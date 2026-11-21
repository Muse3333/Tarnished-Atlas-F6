package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestDetectSavesInCustomAccountFolders(t *testing.T) {
	appData := t.TempDir()
	t.Setenv("APPDATA", appData)
	t.Setenv("TARNISHED_ATLAS_SAVE", "")
	folder := filepath.Join(appData, "EldenRing", "OfflineProfile")
	if err := os.MkdirAll(folder, 0700); err != nil {
		t.Fatal(err)
	}
	older := filepath.Join(folder, "ER0000.sl2")
	newer := filepath.Join(folder, "ER0000.co2")
	for i, path := range []string{older, newer} {
		if err := os.WriteFile(path, []byte("BND4"), 0600); err != nil {
			t.Fatal(err)
		}
		stamp := time.Unix(100+int64(i), 0)
		if err := os.Chtimes(path, stamp, stamp); err != nil {
			t.Fatal(err)
		}
	}
	if got, err := locateSave(); err != nil || got != newer {
		t.Fatalf("newest PC save = %q, %v", got, err)
	}
	t.Setenv("TARNISHED_ATLAS_SAVE", older)
	if got, err := locateSave(); err != nil || got != older {
		t.Fatalf("explicit PC save = %q, %v", got, err)
	}
}

func TestCharacterSelection(t *testing.T) {
	a := character{Slot: 1, Name: "One", Time: 100, Fingerprint: [16]byte{1}}
	b := character{Slot: 2, Name: "Two", Time: 30, Fingerprint: [16]byte{2}}
	before := []character{a, b}
	if got := changedSlot(nil, before); got != 0 {
		t.Fatalf("guessed a character: %d", got)
	}
	if got := changedSlot(nil, []character{b}); got != 2 {
		t.Fatalf("single character selection: got %d", got)
	}
	b.Fingerprint[0]++
	if got := changedSlot(before, []character{a, b}); got != 2 {
		t.Fatalf("changed character selection: got %d", got)
	}
	a.Fingerprint[0]++
	if got := changedSlot(before, []character{a, b}); got != 0 {
		t.Fatalf("guessed across simultaneous updates: %d", got)
	}
}

func TestSavedRanniAndThops(t *testing.T) {
	dir := os.Getenv("ATLAS_TEST_PAIR")
	if dir == "" {
		t.Skip("local save pair not supplied")
	}
	before, err := os.ReadFile(filepath.Join(dir, "before.sl2"))
	if err != nil {
		t.Fatal(err)
	}
	after, err := os.ReadFile(filepath.Join(dir, "after.sl2"))
	if err != nil {
		t.Fatal(err)
	}
	current := filepath.Join(t.TempDir(), "ER0000.sl2")
	if err := os.WriteFile(current, before, 0600); err != nil {
		t.Fatal(err)
	}
	tracker := newTracker(current)
	root, server, err := serve(tracker, newMinimapStore(""))
	if err != nil {
		t.Fatal(err)
	}
	defer server.Close()

	read := func(method, body string) progress {
		req, err := http.NewRequest(method, root+"progress", bytes.NewBufferString(body))
		if err != nil {
			t.Fatal(err)
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		if res.StatusCode != 200 {
			t.Fatalf("HTTP %d", res.StatusCode)
		}
		var result progress
		if err := json.NewDecoder(res.Body).Decode(&result); err != nil {
			t.Fatal(err)
		}
		return result
	}
	if multi := os.Getenv("ATLAS_TEST_MULTI"); multi != "" {
		tracker := newTracker(multi)
		waiting := tracker.state(nil)
		if waiting.Slot != 0 || len(waiting.Characters) != 2 {
			t.Fatalf("initial profile did not wait for selection: slot=%d, characters=%d", waiting.Slot, len(waiting.Characters))
		}
		first, second := 1, 2
		if tracker.state(&first).Complete["ranni-1"] || !tracker.state(&second).Complete["ranni-1"] {
			t.Fatal("save slots did not expose different Ranni states")
		}
	}
	if result := read("GET", ""); result.Slot != 2 || result.Mode != "auto" {
		t.Fatalf("single character did not auto-select: slot=%d, mode=%s", result.Slot, result.Mode)
	}
	result := read("POST", `{"slot":2}`)
	if result.Slot != 2 || !result.Complete["ranni-1"] || result.Complete["thops-1"] {
		t.Fatal("before-save Ranni and Thops flags differ from expected")
	}
	read("POST", `{"slot":0}`)
	if err := os.WriteFile(current, after, 0600); err != nil {
		t.Fatal(err)
	}
	result = read("GET", "")
	if result.Slot != 2 || result.Mode != "auto" || !result.Complete["ranni-1"] {
		t.Fatalf("after-save character detection failed: slot=%d, mode=%s", result.Slot, result.Mode)
	}
	for _, id := range []string{"thops-1", "thops-2", "thops-3"} {
		if !result.Complete[id] {
			t.Fatalf("%s not detected", id)
		}
	}
	if result.Complete["thops-6"] {
		t.Fatal("unverified key handover marked complete")
	}
	for _, path := range []string{"", "overlay.mjs", "quest-model.mjs", "quests.json"} {
		res, err := http.Get(root + path)
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(res.Body)
		res.Body.Close()
		if err != nil || res.StatusCode != 200 || len(body) == 0 {
			t.Fatalf("embedded asset unavailable: %s", path)
		}
		if filepath.Ext(path) == ".mjs" && res.Header.Get("Content-Type") != "text/javascript; charset=utf-8" {
			t.Fatalf("incorrect JavaScript MIME type for %s: %s", path, res.Header.Get("Content-Type"))
		}
	}
	remaining, err := os.ReadFile(current)
	if err != nil || !bytes.Equal(remaining, after) {
		t.Fatal("reader changed the save")
	}
}

func TestVarreRules(t *testing.T) {
	rules := newTracker("").rules
	cases := []struct {
		name    string
		bits    []uint32
		done    []string
		pending []string
	}{
		{"first meeting only", []uint32{1042369202}, []string{"meet"}, []string{"rune", "enia", "fingers", "trial"}},
		{"Enia and correct answer", []uint32{11109358, 1035449206}, []string{"rune", "enia"}, []string{"meet", "fingers", "trial"}},
		{"Rose Church", []uint32{1035449207}, []string{"rune", "enia", "fingers"}, []string{"trial", "favor"}},
		{"one invasion", []uint32{1035449207, 1035449230}, []string{"fingers"}, []string{"trial", "favor"}},
		{"two invasions", []uint32{1035449207, 1035449231}, []string{"fingers"}, []string{"trial", "favor"}},
		{"three invasions", []uint32{1035449207, 1035449230, 1035449231}, []string{"fingers", "trial"}, []string{"favor"}},
		{"Magnus offline", []uint32{1035449207, 7601}, []string{"trial"}, []string{"favor", "blood", "medal", "palace"}},
		{"white cloth", []uint32{400031}, []string{"rune", "enia", "fingers", "trial", "favor"}, []string{"meet", "note", "blood", "offering", "medal"}},
		{"bloodied cloth", []uint32{400033}, []string{"favor", "blood"}, []string{"offering", "medal", "palace"}},
		{"Bloody Finger", []uint32{1035449227}, []string{"blood", "offering"}, []string{"medal", "palace", "duel"}},
		{"medal", []uint32{400032}, []string{"blood", "offering", "medal"}, []string{"palace", "duel", "bouquet"}},
		{"palace grace", []uint32{71252}, []string{"palace"}, []string{"medal", "duel", "bouquet"}},
		{"defeated Varré", []uint32{12055121}, []string{"palace", "duel"}, []string{"bouquet"}},
		{"loot Varré", []uint32{400032, 400037}, []string{"rune", "enia", "fingers", "trial", "favor", "blood", "offering", "medal", "palace", "duel", "bouquet"}, []string{"meet", "note"}},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			flags := map[uint32]bool{}
			for _, rule := range rules {
				for _, group := range rule.groups() {
					for _, id := range group {
						flags[id] = false
					}
				}
			}
			for _, id := range test.bits {
				flags[id] = true
			}
			for _, id := range test.done {
				if available, complete := rules["varre-"+id].evaluate(flags, nil); !available || !complete {
					t.Errorf("%s should be complete", id)
				}
			}
			for _, id := range test.pending {
				if _, complete := rules["varre-"+id].evaluate(flags, nil); complete {
					t.Errorf("%s should remain unticked", id)
				}
			}
		})
	}
}

func TestBlaiddConversationAfterDarriwil(t *testing.T) {
	rule := newTracker("").rules["blaidd-3"]
	const (
		reward           = 400150
		darriwilDefeated = 1044350800
		firstDialogue    = 1044349255
		secondDialogue   = 1044349256
		summonPermission = 1044349257
		foughtTogether   = 1044349258
	)
	for _, test := range []struct {
		name     string
		set      []uint32
		complete bool
	}{
		{"boss only", []uint32{darriwilDefeated}, false},
		{"fought alongside Blaidd", []uint32{darriwilDefeated, summonPermission, foughtTogether}, false},
		{"dialogue without boss defeat", []uint32{firstDialogue, secondDialogue}, false},
		{"reward already saved", []uint32{reward}, true},
		{"first post-fight dialogue", []uint32{darriwilDefeated, firstDialogue}, true},
		{"second post-fight dialogue", []uint32{darriwilDefeated, secondDialogue}, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			flags := map[uint32]bool{reward: false, darriwilDefeated: false, firstDialogue: false, secondDialogue: false}
			for _, id := range test.set {
				flags[id] = true
			}
			if available, complete := rule.evaluate(flags, nil); !available || complete != test.complete {
				t.Fatalf("available=%v, complete=%v, want complete=%v", available, complete, test.complete)
			}
		})
	}
}

func TestCatalogSaveCoverage(t *testing.T) {
	raw, err := assets.ReadFile("ui/quests.json")
	if err != nil {
		t.Fatal(err)
	}
	var quests []struct {
		ID    string
		Steps []struct {
			ID     string
			Manual bool
		}
	}
	if err := json.Unmarshal(raw, &quests); err != nil {
		t.Fatal(err)
	}
	rules := newTracker("").rules
	// These optional Boc scenes still need confirmed encounter or dialogue evidence.
	manual := map[string]bool{"boc-5": true, "boc-6": true, "boc-7": true, "boc-11": true}
	seen := make(map[string]bool)
	for _, quest := range quests {
		tracked := 0
		for _, step := range quest.Steps {
			if seen[step.ID] {
				t.Errorf("duplicate step %s", step.ID)
			}
			seen[step.ID] = true
			rule, ok := rules[step.ID]
			if !ok && (manual[step.ID] || step.Manual) {
				continue
			}
			if !ok || (len(rule.groups()) == 0 && len(rule.Items) == 0) {
				t.Errorf("%s has no save evidence rule", step.ID)
				continue
			}
			tracked++
		}
		if tracked == 0 {
			t.Errorf("%s has no automatically tracked steps", quest.ID)
		}
	}
	for id := range rules {
		if !seen[id] {
			t.Errorf("%s has a rule but no catalog step", id)
		}
	}

	if path := os.Getenv("ATLAS_TEST_MULTI"); path != "" {
		slot := 2
		snapshot := newTracker(path).state(&slot)
		for id := range rules {
			if !snapshot.Available[id] && !strings.HasPrefix(id, "dlc-") {
				t.Errorf("%s could not be read from the PC save", id)
			}
		}
		characters, _, err := loadSnapshot(path, rules)
		if err != nil || len(characters) == 0 {
			t.Fatalf("could not load PC save: %v", err)
		}
		for id, rule := range rules {
			if len(rule.SkipWhen) == 0 {
				continue
			}
			if available, _ := evaluateFlags(rule.SkipWhen, characters[0].Flags); !available {
				t.Errorf("%s could not read its skip flags from the PC save", id)
			}
		}
	}
}

func TestReviewedQuestEvidence(t *testing.T) {
	const castanets = 0x40001fe8
	rules := newTracker("").rules
	for _, test := range []struct {
		name     string
		step     string
		flags    map[uint32]bool
		items    map[uint32]bool
		complete bool
	}{
		{"Margit defeated", "elden-throne-1", map[uint32]bool{9100: true}, nil, false},
		{"Godrick defeated", "elden-throne-1", map[uint32]bool{9101: true}, nil, true},
		{"Radahn defeated alone", "blaidd-6", map[uint32]bool{9130: true}, nil, false},
		{"Blaidd spoken to on the battlefield", "blaidd-6", map[uint32]bool{9130: true, 1052389305: true}, nil, true},
		{"Blaidd spoken to in Siofra", "ranni-5", map[uint32]bool{12029153: true}, nil, true},
		{"Triumph gesture without the Saintsbridge rescue", "alexander-1", map[uint32]bool{60828: true}, nil, false},
		{"Alexander freed at Saintsbridge", "alexander-1", map[uint32]bool{1043390724: true}, nil, true},
		{"Radahn defeated without battlefield dialogue", "alexander-4", map[uint32]bool{9130: true, 3668: true}, nil, false},
		{"Only the first battlefield dialogue played", "alexander-4", map[uint32]bool{9130: true, 1051369265: true}, nil, false},
		{"Alexander ready to leave the battlefield", "alexander-4", map[uint32]bool{9130: true, 1051369266: true}, nil, true},
		{"Alexander already moved to Liurnia", "alexander-4", map[uint32]bool{3669: true}, nil, true},
		{"body below Stormveil witnessed", "rogier-3", map[uint32]bool{11109528: true}, nil, true},
		{"unrelated Spirit Ashes", "aureliette-1", map[uint32]bool{710550: true}, nil, false},
		{"reinforced Spirit Jellyfish Ashes", "aureliette-1", nil, map[uint32]bool{0x400399ea: true}, true},
		{"Patches' letter awarded", "patches-5", map[uint32]bool{400180: true}, nil, true},
		{"Rykard defeated without Patches dialogue", "patches-post-rykard", map[uint32]bool{16000800: true}, nil, false},
		{"Patches spoken to after Rykard", "patches-post-rykard", map[uint32]bool{16000800: true, 16009359: true}, nil, true},
		{"Patches attacked in the cave rematch", "patches-10", map[uint32]bool{31009258: true}, nil, false},
		{"Patches taught the crouch gesture in the rematch", "patches-10", map[uint32]bool{31009258: true, 60832: true}, nil, true},
		{"Patches running the final shop", "patches-10", map[uint32]bool{3692: true}, nil, true},
		{"castanets never received", "patches-9", nil, map[uint32]bool{castanets: false}, false},
		{"castanets still held", "patches-9", map[uint32]bool{400181: true, 1039549205: true}, map[uint32]bool{castanets: true}, false},
		{"castanets inventory unreadable", "patches-9", map[uint32]bool{400181: true, 1039549205: true}, nil, false},
		{"castanets offered after being received", "patches-9", map[uint32]bool{400181: true, 1039549205: true}, map[uint32]bool{castanets: false}, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			if _, complete := rules[test.step].evaluate(test.flags, test.items); complete != test.complete {
				t.Fatalf("%s complete=%v, want %v", test.step, complete, test.complete)
			}
		})
	}
}

func TestAlexanderUnavailableEncounters(t *testing.T) {
	rules := newTracker("").rules
	for _, test := range []struct {
		name    string
		step    string
		flag    uint32
		skipped bool
	}{
		{"still at Gael Tunnel", "alexander-2", 3666, false},
		{"festival preparation moves Alexander out of Gael Tunnel", "alexander-2", 9410, true},
		{"at the festival plaza", "alexander-3", 9410, false},
		{"festival cutscene alone", "alexander-3", 9411, false},
		{"Radahn defeated", "alexander-3", 9130, true},
		{"Liurnia stop still available", "alexander-5", 3669, false},
		{"left Liurnia for Mt. Gelmir", "alexander-5", 3670, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			flags := map[uint32]bool{test.flag: true}
			if _, skipped := evaluateFlags(rules[test.step].SkipWhen, flags); skipped != test.skipped {
				t.Errorf("%s skipped=%v, want %v", test.step, skipped, test.skipped)
			}
			if _, complete := rules[test.step].evaluate(flags, nil); complete {
				t.Errorf("%s was completed by a phase flag alone", test.step)
			}
		})
	}
}

func TestPatchesDeparturesSkipUnavailableScenes(t *testing.T) {
	rules := newTracker("").rules
	for _, test := range []struct {
		name    string
		step    string
		flag    uint32
		skipped bool
	}{
		{"still at Scenic Isle", "patches-3", 3687, false},
		{"already moved to Gelmir", "patches-3", 3688, true},
		{"already moved to the manor", "patches-4", 3689, true},
		{"at the manor before Rykard", "patches-5", 3689, false},
		{"Rykard defeated", "patches-7", 16000800, true},
		{"still at the manor after Rykard", "patches-post-rykard", 16000800, false},
		{"moved to the Shaded Castle", "patches-post-rykard", 3690, true},
		{"at the Shaded Castle", "patches-8", 3690, false},
		{"back at Murkwater Cave", "patches-8", 3691, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			flags := map[uint32]bool{test.flag: true}
			if _, skipped := evaluateFlags(rules[test.step].SkipWhen, flags); skipped != test.skipped {
				t.Errorf("%s skipped=%v, want %v", test.step, skipped, test.skipped)
			}
			if _, complete := rules[test.step].evaluate(flags, nil); complete {
				t.Errorf("%s was marked complete by a phase flag alone", test.step)
			}
		})
	}
}

func TestVarreReadOnlySaveAndPartialWrite(t *testing.T) {
	path := os.Getenv("ATLAS_TEST_MULTI")
	if path == "" {
		t.Skip("local save not supplied")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	temp := filepath.Join(t.TempDir(), "ER0000.sl2")
	if err := os.WriteFile(temp, raw, 0600); err != nil {
		t.Fatal(err)
	}
	tracker := newTracker(temp)
	slot := 2
	result := tracker.state(&slot)
	for id, available := range result.Available {
		if len(id) >= 6 && id[:6] == "varre-" && !available {
			t.Errorf("%s could not be decoded", id)
		}
	}
	if !result.Complete["varre-rune"] || !result.Complete["varre-enia"] ||
		result.Complete["varre-meet"] || result.Complete["varre-fingers"] || result.Complete["varre-bouquet"] {
		t.Fatal("saved Varré progress does not match the observed milestones")
	}
	unchanged, err := os.ReadFile(temp)
	if err != nil || !bytes.Equal(unchanged, raw) {
		t.Fatal("save reader wrote to the file")
	}
	if err := os.WriteFile(temp, raw[:1000], 0600); err != nil {
		t.Fatal(err)
	}
	if pending := tracker.state(nil); !pending.Complete["varre-enia"] || pending.Complete["varre-fingers"] {
		t.Fatal("an incomplete save write replaced the last readable progress")
	}
}
