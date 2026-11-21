package main

import (
	"bytes"
	"crypto/md5"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/oisis/EldenRing-SaveForge/backend/core"
	"github.com/oisis/EldenRing-SaveForge/backend/db"
)

type stageRule struct {
	Flags        []uint32   `json:"flags"`
	AnyOf        [][]uint32 `json:"anyOf"`
	Items        []uint32   `json:"items"`
	WithoutItems []uint32   `json:"withoutItems"`
	SkipWhen     [][]uint32 `json:"skipWhen"`
	JourneyItems bool       `json:"journeyItems"`
}

// Each group represents one way to confirm the action.
func (rule stageRule) groups() [][]uint32 {
	if len(rule.AnyOf) != 0 {
		return rule.AnyOf
	}
	if len(rule.Flags) != 0 {
		return [][]uint32{rule.Flags}
	}
	return nil
}

func (rule stageRule) evaluate(flags, items map[uint32]bool) (available, complete bool) {
	available, complete = evaluateFlags(rule.groups(), flags)
	// Hand-offs require proof that the item was acquired and is now absent.
	for _, item := range rule.WithoutItems {
		held, read := items[item]
		available = available && read
		complete = complete && read && !held
	}
	for _, item := range rule.Items {
		held, read := items[item]
		available = available || read
		complete = complete || held
	}
	return available, complete
}

func evaluateFlags(groups [][]uint32, flags map[uint32]bool) (available, complete bool) {
	available = len(groups) != 0
	for _, group := range groups {
		read, set := true, len(group) != 0
		for _, id := range group {
			value, present := flags[id]
			read = read && present
			set = set && present && value
		}
		if set {
			return true, true
		}
		available = available && read
	}
	return available, false
}

type character struct {
	Slot        int             `json:"slot"`
	Name        string          `json:"name"`
	Level       uint32          `json:"level"`
	Cycle       uint32          `json:"cycle"`
	Time        uint32          `json:"-"`
	Flags       map[uint32]bool `json:"-"`
	Items       map[uint32]bool `json:"-"`
	Fingerprint [16]byte        `json:"-"`
}
type progress struct {
	Characters []character     `json:"characters"`
	Slot       int             `json:"slot"`
	Mode       string          `json:"mode"`
	Profile    string          `json:"profile,omitempty"`
	Complete   map[string]bool `json:"complete"`
	Available  map[string]bool `json:"available"`
	Skipped    map[string]bool `json:"skipped,omitempty"`
	Message    string          `json:"message"`
	World      map[uint32]bool `json:"world,omitempty"`
	History    []historySave   `json:"history,omitempty"`
	HistoryKey string          `json:"historyKey,omitempty"`
	Manual     []string        `json:"manual,omitempty"`
}
type saveTracker struct {
	mu             sync.Mutex
	override       string
	lastPath       string
	lastModified   time.Time
	lastSize       int64
	lastCharacters []character
	detected       int
	selected       int
	rules          map[string]stageRule
	history        *historyLog
}

func newTracker(override string) *saveTracker {
	var rules map[string]stageRule
	if err := json.Unmarshal(stageRules, &rules); err != nil {
		panic(err)
	}
	return &saveTracker{override: override, rules: rules, history: loadHistory(override == "")}
}

func locateSave() (string, error) {
	if path := strings.TrimSpace(os.Getenv("TARNISHED_ATLAS_SAVE")); path != "" {
		return path, nil
	}
	appData := os.Getenv("APPDATA")
	if appData == "" {
		return "", errors.New("the Windows save folder is unavailable")
	}
	root := filepath.Join(appData, "EldenRing")
	accounts, err := os.ReadDir(root)
	if err != nil {
		return "", errors.New("waiting for an Elden Ring PC save")
	}
	type candidate struct {
		path string
		time time.Time
	}
	var saves []candidate
	folders := []string{root}
	for _, account := range accounts {
		if account.IsDir() {
			folders = append(folders, filepath.Join(root, account.Name()))
		}
	}
	for _, folder := range folders {
		for _, name := range []string{"ER0000.sl2", "ER0000.co2"} {
			path := filepath.Join(folder, name)
			if info, err := os.Stat(path); err == nil && info.Mode().IsRegular() {
				saves = append(saves, candidate{path, info.ModTime()})
			}
		}
	}
	if len(saves) == 0 {
		return "", errors.New("waiting for an Elden Ring PC save in AppData")
	}
	sort.SliceStable(saves, func(i, j int) bool { return saves[i].time.After(saves[j].time) })
	if len(saves) > 1 && saves[0].time.Equal(saves[1].time) {
		return "", errors.New("multiple saves have the same timestamp. Load your character and wait for an autosave")
	}
	return saves[0].path, nil
}

const slotBytes = 0x280000
const headerBytes = 0x300
const metadataBytes = 0x60000
const metadataOffset = headerBytes + 10*(16+slotBytes)
const maxSaveBytes = 64 * 1024 * 1024

func intactBlock(data []byte, start, length int) bool {
	checksum := md5.Sum(data[start+16 : start+16+length])
	return bytes.Equal(checksum[:], data[start:start+16])
}

func loadSnapshot(path string, rules map[string]stageRule) ([]character, string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, "", err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, maxSaveBytes+1))
	if err != nil {
		return nil, "", err
	}
	if len(data) < metadataOffset+16+metadataBytes || len(data) > maxSaveBytes || !bytes.HasPrefix(data, []byte("BND4")) {
		return nil, "", errors.New("unsupported or incomplete PC save")
	}
	if !intactBlock(data, metadataOffset, metadataBytes) {
		return nil, "", errors.New("character list is still being written")
	}
	save, err := core.ParseSaveBytes(data)
	if err != nil {
		return nil, "", err
	}
	var characters []character
	for index, active := range save.ActiveSlots {
		if !active {
			continue
		}
		start := headerBytes + index*(slotBytes+16)
		if !intactBlock(data, start, slotBytes) {
			return nil, "", errors.New("character data is still being written")
		}
		slot := save.Slots[index]
		name := core.UTF16ToString(save.ProfileSummaries[index].CharacterName[:])
		if name == "" {
			name = fmt.Sprintf("Slot %d", index+1)
		}
		state := character{Slot: index + 1, Name: name, Level: save.ProfileSummaries[index].Level, Cycle: slot.Player.ClearCount, Flags: make(map[uint32]bool)}
		copy(state.Fingerprint[:], data[start:start+16])
		if offset := slot.IngameTimerOffset; offset > 0 && offset+4 <= len(slot.Data) {
			state.Time = binary.LittleEndian.Uint32(slot.Data[offset:])
		}
		if offset := slot.EventFlagsOffset; offset > 0 && offset+core.EventFlagsByteCount <= len(slot.Data) {
			block := slot.Data[offset : offset+core.EventFlagsByteCount]
			state.Items = questItems(&slot, rules)
			for _, id := range explorerFlags() {
				if value, err := db.GetEventFlag(block, id); err == nil {
					state.Flags[id] = value
				}
			}
			for _, rule := range rules {
				for _, groups := range [][][]uint32{rule.groups(), rule.SkipWhen} {
					for _, group := range groups {
						for _, flag := range group {
							if _, present := state.Flags[flag]; present {
								continue
							}
							value, err := db.GetEventFlag(block, flag)
							if err == nil {
								state.Flags[flag] = value
							}
						}
					}
				}
			}
		}
		characters = append(characters, state)
	}
	profile := fmt.Sprintf("%x", md5.Sum([]byte(filepath.Dir(path))))
	return characters, profile, nil
}

func questItems(slot *core.SaveSlot, rules map[string]stageRule) map[uint32]bool {
	if slot.Inventory.CommonItems == nil && slot.Inventory.KeyItems == nil {
		return nil
	}
	targets := make(map[uint32]bool)
	journeyItems := make(map[uint32]bool)
	for _, rule := range rules {
		for _, id := range rule.Items {
			targets[id] = false
			if rule.JourneyItems {
				journeyItems[id] = true
			}
		}
		if slot.Inventory.CommonItems != nil && slot.Inventory.KeyItems != nil {
			for _, id := range rule.WithoutItems {
				targets[id] = false
			}
		}
	}
	for _, records := range [][]core.InventoryItem{slot.Inventory.CommonItems, slot.Inventory.KeyItems, slot.Storage.CommonItems, slot.Storage.KeyItems} {
		for _, entry := range records {
			if entry.Quantity&0x7fffffff == 0 {
				continue
			}
			id, found := slot.GaMap[entry.GaItemHandle]
			if !found {
				id = db.HandleToItemID(entry.GaItemHandle)
			}
			if _, tracked := targets[id]; tracked {
				targets[id] = true
			} else if len(journeyItems) != 0 {
				if _, baseID := db.GetItemDataFuzzy(id); journeyItems[baseID] {
					targets[baseID] = true
				}
			}
		}
	}
	return targets
}

func changedSlot(before, after []character) int {
	if len(after) == 1 {
		return after[0].Slot
	}
	var changed, advancing []int
	for _, previous := range before {
		for _, current := range after {
			if previous.Slot != current.Slot || previous.Name != current.Name || current.Fingerprint == previous.Fingerprint {
				continue
			}
			changed = append(changed, current.Slot)
			if current.Time > previous.Time {
				advancing = append(advancing, current.Slot)
			}
		}
	}
	if len(advancing) == 1 {
		return advancing[0]
	}
	if len(changed) == 1 {
		return changed[0]
	}
	return 0
}

func (t *saveTracker) state(selection *int) progress {
	t.mu.Lock()
	defer t.mu.Unlock()
	if selection != nil {
		t.selected = *selection
	}
	p := progress{Complete: map[string]bool{}, Available: map[string]bool{}, Mode: "auto"}
	if t.selected > 0 {
		p.Mode = "manual"
	}
	path := t.override
	if path == "" {
		var err error
		path, err = locateSave()
		if err != nil {
			p.Message = err.Error()
			return p
		}
	}
	info, err := os.Stat(path)
	if err != nil {
		p.Message = "Waiting for the PC save."
		return p
	}
	p.Profile = fmt.Sprintf("%x", md5.Sum([]byte(filepath.Dir(path))))
	if path != t.lastPath || !info.ModTime().Equal(t.lastModified) || info.Size() != t.lastSize {
		fresh, profile, err := loadSnapshot(path, t.rules)
		now, statErr := os.Stat(path)
		if err != nil || statErr != nil || !info.ModTime().Equal(now.ModTime()) || info.Size() != now.Size() {
			p.Message = "Waiting for a complete PC save snapshot."
			if path != t.lastPath {
				return p
			}
		} else {
			if path != t.lastPath {
				t.lastCharacters, t.detected = nil, 0
				if t.lastPath != "" && selection == nil {
					t.selected, p.Mode = 0, "auto"
				}
			}
			if advancing := changedSlot(t.lastCharacters, fresh); advancing != 0 {
				t.detected = advancing
			}
			t.lastPath, t.lastModified, t.lastSize, t.lastCharacters = path, info.ModTime(), info.Size(), fresh
			if t.history != nil {
				t.history.observe(path, info.ModTime(), fresh, t.rules)
			}
			p.Profile = profile
		}
	}

	p.Characters = t.lastCharacters
	target := t.detected
	if t.selected != 0 {
		target = t.selected
	}
	for _, char := range t.lastCharacters {
		if char.Slot != target {
			continue
		}
		p.Slot = target
		if len(char.Flags) == 0 {
			p.Message = "This character’s event flags are unavailable."
			return p
		}
		if p.Message == "" {
			p.Message = "Reading your character’s saved progress."
		}
		p.Skipped = make(map[string]bool)
		p.World = worldProgress(char.Flags)
		var record historyCharacter
		if t.history != nil {
			p.HistoryKey = historyKey(path, char)
			record = t.history.characters[p.HistoryKey]
			p.Manual, p.History = pinIDs(record.Manual), record.Saves
		}
		for id, rule := range t.rules {
			available, complete := characterRule(rule, char)
			if rule.JourneyItems && record.State[id] == "completed" {
				available, complete = true, true
			}
			p.Available[id], p.Complete[id] = available, complete
			if !complete {
				if _, skip := evaluateFlags(rule.SkipWhen, char.Flags); skip {
					p.Skipped[id] = true
				}
			}
		}
		return p
	}
	p.Message = "Select your character or wait for the game to autosave."
	return p
}

func (t *saveTracker) setManual(key, step string, checked bool) (bool, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.history == nil || !manualStepIDs()[step] {
		return false, nil
	}
	active := t.detected
	if t.selected != 0 {
		active = t.selected
	}
	for _, char := range t.lastCharacters {
		if char.Slot == active && historyKey(t.lastPath, char) == key {
			return true, t.history.setManual(key, step, checked)
		}
	}
	return false, nil
}

func characterRule(rule stageRule, char character) (available, complete bool) {
	items := char.Items
	if rule.JourneyItems && char.Cycle != 0 {
		// DLC rewards can carry into NG+. Use current-cycle flags or a manual check.
		items = nil
	}
	return rule.evaluate(char.Flags, items)
}
