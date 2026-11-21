package main

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"
)

const historyLimit = 36
const historyCharacterLimit = 24

type historyChange struct {
	Step   string `json:"step"`
	Before string `json:"before"`
	After  string `json:"after"`
	Reason string `json:"reason,omitempty"`
}

type historySave struct {
	Time    time.Time       `json:"time"`
	Changes []historyChange `json:"changes"`
}

type historyCharacter struct {
	Updated  time.Time         `json:"updated"`
	State    map[string]string `json:"state"`
	Saves    []historySave     `json:"saves"`
	Manual   map[string]bool   `json:"manual,omitempty"`
	PlayTime uint32            `json:"playTime,omitempty"`
}

type historyLog struct {
	path       string
	characters map[string]historyCharacter
	dirty      bool
}

func loadHistory(persistent bool) *historyLog {
	log := &historyLog{characters: make(map[string]historyCharacter)}
	if dir, err := os.UserConfigDir(); persistent && err == nil {
		log.path = filepath.Join(dir, "TarnishedAtlas", "quest-history.json")
		if info, err := os.Stat(log.path); err == nil && info.Size() <= 8*1024*1024 {
			var characters map[string]historyCharacter
			if file, err := os.ReadFile(log.path); err == nil && json.Unmarshal(file, &characters) == nil && characters != nil {
				log.characters = characters
			}
		}
	}
	return log
}

func historyKey(path string, char character) string {
	return fmt.Sprintf("%x", sha256.Sum256([]byte(fmt.Sprintf("%s\x00%d\x00%s\x00%d", path, char.Slot, char.Name, char.Cycle))))
}

func (log *historyLog) entries(path string, char character) []historySave {
	return log.characters[historyKey(path, char)].Saves
}

func (log *historyLog) setManual(key, step string, checked bool) error {
	record := log.characters[key]
	before := record
	record.Manual = make(map[string]bool, len(before.Manual)+1)
	for id, value := range before.Manual {
		record.Manual[id] = value
	}
	if checked {
		record.Manual[step] = true
	} else {
		delete(record.Manual, step)
	}
	log.characters[key] = record
	if log.path != "" {
		if err := writePreferences(log.path, log.characters); err != nil {
			log.characters[key] = before
			return err
		}
		log.dirty = false
	}
	return nil
}

func (log *historyLog) observe(path string, modified time.Time, characters []character, rules map[string]stageRule) {
	for _, char := range characters {
		key := historyKey(path, char)
		record := log.characters[key]
		if record.State == nil {
			record.State = make(map[string]string)
		}
		var changes []historyChange
		restored := char.Time != 0 && record.PlayTime > char.Time
		updated := restored
		for id, rule := range rules {
			available, complete := characterRule(rule, char)
			_, skipped := evaluateFlags(rule.SkipWhen, char.Flags)
			next, reason := "remaining", ""
			switch {
			case complete:
				next, reason = "completed", "Saved quest evidence confirms this step."
				if _, flag := evaluateFlags(rule.groups(), char.Flags); !flag && len(rule.Items) != 0 {
					reason = "The expected item was found in this character’s save."
				}
			case skipped:
				next, reason = "unavailable", "A saved branch or prerequisite closed this step."
			case !available:
				continue
			}
			previous, known := record.State[id]
			// A consumed hand-off item still evidences an earlier step in this journey.
			if rule.JourneyItems && !restored && previous == "completed" && next == "remaining" {
				continue
			}
			if previous == next {
				continue
			}
			record.State[id] = next
			updated = true
			if known {
				if next == "remaining" {
					reason = "This save no longer shows the earlier evidence."
				}
				changes = append(changes, historyChange{id, previous, next, reason})
			}
		}
		if !updated {
			continue
		}
		if len(changes) > 0 {
			sort.Slice(changes, func(i, j int) bool { return changes[i].Step < changes[j].Step })
			record.Saves = append(record.Saves, historySave{modified, changes})
			if len(record.Saves) > historyLimit {
				record.Saves = record.Saves[len(record.Saves)-historyLimit:]
			}
		}
		record.Updated = modified
		record.PlayTime = char.Time
		log.characters[key] = record
		log.dirty = true
	}
	if len(log.characters) > historyCharacterLimit {
		keys := make([]string, 0, len(log.characters))
		for key := range log.characters {
			keys = append(keys, key)
		}
		sort.Slice(keys, func(i, j int) bool { return log.characters[keys[i]].Updated.After(log.characters[keys[j]].Updated) })
		for _, key := range keys[historyCharacterLimit:] {
			delete(log.characters, key)
		}
		log.dirty = true
	}
	if log.dirty && log.path != "" && writePreferences(log.path, log.characters) == nil {
		log.dirty = false
	}
}
