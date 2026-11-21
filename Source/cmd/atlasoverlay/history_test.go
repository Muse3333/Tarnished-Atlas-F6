package main

import (
	"path/filepath"
	"testing"
	"time"
)

func TestQuestHistoryAndManualChecksPersistByJourney(t *testing.T) {
	config := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", config)
	t.Setenv("APPDATA", config)
	path := filepath.Join(config, "ER0000.sl2")
	log := loadHistory(true)
	characterA := character{Slot: 1, Name: "Fixture", Time: 100, Flags: map[uint32]bool{5: false, 6: false}, Items: map[uint32]bool{8: false}}
	characterB := character{Slot: 2, Name: "Fixture", Time: 100, Flags: map[uint32]bool{5: false, 6: false}, Items: map[uint32]bool{8: false}}
	rules := map[string]stageRule{
		"defeat": {Flags: []uint32{5}},
		"branch": {Flags: []uint32{5, 6}, SkipWhen: [][]uint32{{6}}},
		"item":   {Items: []uint32{8}, JourneyItems: true},
	}
	start := time.Unix(1000, 0)
	log.observe(path, start, []character{characterA, characterB}, rules)
	if len(log.entries(path, characterA)) != 0 {
		t.Fatal("initial snapshot generated history")
	}
	characterA.Time++
	characterA.Flags[6], characterA.Items[8] = true, true
	reload := loadHistory(true)
	reload.observe(path, start.Add(time.Second), []character{characterA, characterB}, rules)
	characterA.Time++
	characterA.Items[8] = false
	reload.observe(path, start.Add(2*time.Second), []character{characterA, characterB}, rules)
	key := historyKey(path, characterA)
	if err := reload.setManual(key, "dlc-leda-fight", true); err != nil {
		t.Fatal(err)
	}
	saved := loadHistory(true)
	entries := saved.entries(path, characterA)
	if len(entries) != 1 || len(entries[0].Changes) != 2 || entries[0].Changes[0].After != "unavailable" || entries[0].Changes[1].After != "completed" {
		t.Fatalf("unexpected history %+v", entries)
	}
	if !saved.characters[key].Manual["dlc-leda-fight"] || saved.characters[key].State["item"] != "completed" || len(saved.entries(path, characterB)) != 0 {
		t.Fatal("stored history, manual checks, or character isolation was lost")
	}
	characterA.Cycle++
	if historyKey(path, characterA) == key || len(saved.entries(path, characterA)) != 0 {
		t.Fatal("the prior journey's history appeared in a new journey")
	}
	characterA.Items[8] = true
	if _, done := characterRule(rules["item"], characterA); done {
		t.Fatal("a retained DLC reward completed a step in NG+")
	}
}

func TestChecklistUsesArenaFlag(t *testing.T) {
	var messmer explorerBoss
	for _, boss := range explorerBosses() {
		if boss.ID == 9146 {
			messmer = boss
			break
		}
	}
	if messmer.Flag == 0 || messmer.Flag == messmer.ID || messmer.Point == nil || messmer.Point.Layer != "shadow" {
		t.Fatalf("missing save-backed shadow encounter: %+v", messmer)
	}
	if world := worldProgress(map[uint32]bool{messmer.Flag: true, 1042360800: false}); !world[messmer.ID] || world[1042360800] {
		t.Fatalf("wrong checklist status %+v", world)
	}
}
