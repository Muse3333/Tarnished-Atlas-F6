package main

import (
	_ "embed"
	"encoding/json"
	"regexp"
	"slices"
	"sort"
	"strings"
	"sync"

	"github.com/oisis/EldenRing-SaveForge/backend/db"
	"github.com/oisis/EldenRing-SaveForge/backend/db/data"
)

type finderStats struct {
	Requirements [5]int32 `json:"requirements"`
	Scaling      [5]int32 `json:"scaling"`
}

type finderWeapon struct {
	ID       uint32                 `json:"id"`
	Name     string                 `json:"name"`
	Type     string                 `json:"type"`
	DLC      bool                   `json:"dlc,omitempty"`
	Source   string                 `json:"source"`
	Location string                 `json:"location,omitempty"`
	Stats    map[string]finderStats `json:"stats"`
}

var guideLink = regexp.MustCompile(`\s*\[[^\]]*[Ll]ink[^\]]*\]`)

var manualStepIDs = sync.OnceValue(func() map[string]bool {
	var catalog []struct {
		Steps []struct{ ID string }
	}
	raw, err := assets.ReadFile("ui/quests.json")
	if err != nil || json.Unmarshal(raw, &catalog) != nil {
		panic("invalid quest catalog")
	}
	ids := make(map[string]bool)
	for _, quest := range catalog {
		for _, step := range quest.Steps {
			ids[step.ID] = true
		}
	}
	return ids
})

func acquisitionType(location string) string {
	text := strings.ToLower(location)
	switch {
	case strings.Contains(text, "remembrance"):
		return "Boss / Remembrance"
	case strings.Contains(text, "purchased") || strings.Contains(text, "sold by") || strings.Contains(text, "buy from"):
		return "Merchant"
	case strings.Contains(text, "chest"):
		return "Chest"
	case strings.Contains(text, "chance to drop") || strings.Contains(text, "farmed") || strings.Contains(text, "random drop"):
		return "Enemy drop"
	case strings.Contains(text, "dropped by") || strings.Contains(text, "defeating") || strings.Contains(text, "defeat "):
		return "Defeat reward"
	case strings.Contains(text, "quest") || strings.Contains(text, "given by"):
		return "Quest reward"
	case strings.Contains(text, "starting equipment") || strings.Contains(text, "starting weapon"):
		return "Starting gear"
	case text != "":
		return "World pickup"
	default:
		return "Unknown"
	}
}

var weaponCatalogue = sync.OnceValue(func() []finderWeapon {
	var result []finderWeapon
	for _, category := range []string{"melee_armaments", "ranged_and_catalysts", "shields"} {
		for _, item := range db.GetItemsByCategory(category, "pc") {
			base, found := data.WeaponStatsV1ByID[item.ID]
			if !found || strings.Contains(item.Name, " +") || slices.Contains(item.Flags, "cut_content") || slices.Contains(item.Flags, "ban_risk") {
				continue
			}
			stats := map[string]finderStats{"Standard": baseFinderStats(base)}
			if base.IsInfusable {
				for _, affinity := range db.GetInfuseTypes()[1:] {
					id := item.ID + uint32(affinity.Offset)
					if variant, ok := data.WeaponStatsV1ByID[id]; ok {
						stats[affinity.Name] = baseFinderStats(variant)
					} else if desc := data.Descriptions[id].Weapon; desc != nil {
						value := baseFinderStats(base)
						value.Scaling = [5]int32{int32(desc.ScaleStr), int32(desc.ScaleDex), int32(desc.ScaleInt), int32(desc.ScaleFai)}
						// The older table does not record Arcane scaling.
						if affinity.Name == "Blood" || affinity.Name == "Poison" || affinity.Name == "Occult" {
							value.Scaling[4] = -1
						}
						stats[affinity.Name] = value
					}
				}
			}
			location := strings.TrimSpace(guideLink.ReplaceAllString(item.Location, ""))
			result = append(result, finderWeapon{item.ID, item.Name, item.SubCategory, slices.Contains(item.Flags, "dlc"), acquisitionType(location), location, stats})
		}
	}
	return result
})

func baseFinderStats(stat data.WeaponStatsV1) finderStats {
	return finderStats{
		Requirements: [5]int32{stat.StatReqStr, stat.StatReqDex, stat.StatReqInt, stat.StatReqFai, stat.StatReqArc},
		Scaling:      [5]int32{stat.ScalingStrRaw, stat.ScalingDexRaw, stat.ScalingIntRaw, stat.ScalingFaiRaw, stat.ScalingArcRaw},
	}
}

type explorerLandmark struct {
	Flag uint32 `json:"flag"`
}

type encounterPoint struct {
	Lat   float64 `json:"lat"`
	Lng   float64 `json:"lng"`
	Layer string  `json:"layer"`
}

type explorerBoss struct {
	db.BossEntry
	Flag  uint32          `json:"-"`
	Point *encounterPoint `json:"point,omitempty"`
}

//go:embed boss_ids.json
var trackedBossData []byte

var explorerBosses = sync.OnceValue(func() []explorerBoss {
	entries := make(map[uint32]explorerBoss)
	for _, boss := range db.GetAllBosses() {
		entries[boss.ID] = explorerBoss{BossEntry: boss, Flag: boss.ID}
	}
	var table []struct {
		ID     uint32          `json:"id"`
		Flag   uint32          `json:"flag"`
		Name   string          `json:"name"`
		Region string          `json:"region"`
		Point  *encounterPoint `json:"point"`
	}
	if json.Unmarshal(trackedBossData, &table) != nil {
		panic("invalid encounter catalog")
	}
	data.LoadBST()
	for _, row := range table {
		boss, found := entries[row.ID]
		_, block := data.EventFlagBST[row.Flag/data.BSTFlagDivisor]
		_, knownFlag := data.EventFlags[row.Flag]
		if !found {
			if !block && !knownFlag {
				continue
			}
			boss = explorerBoss{BossEntry: db.BossEntry{ID: row.ID, Name: row.Name, Region: row.Region, Type: "field"}}
		}
		if block || knownFlag {
			boss.Flag = row.Flag
		}
		boss.Point = row.Point
		entries[row.ID] = boss
	}
	result := make([]explorerBoss, 0, len(entries))
	for _, boss := range entries {
		result = append(result, boss)
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].Name == result[j].Name {
			return result[i].ID < result[j].ID
		}
		return result[i].Name < result[j].Name
	})
	return result
})

var explorerFlags = sync.OnceValue(func() []uint32 {
	var ids []uint32
	for _, boss := range explorerBosses() {
		ids = append(ids, boss.Flag)
	}
	var landmarks []explorerLandmark
	raw, err := assets.ReadFile("ui/landmarks.json")
	if err != nil || json.Unmarshal(raw, &landmarks) != nil {
		panic("invalid landmark catalog")
	}
	for _, landmark := range landmarks {
		if landmark.Flag != 0 {
			ids = append(ids, landmark.Flag)
		}
	}
	return ids
})

func worldProgress(flags map[uint32]bool) map[uint32]bool {
	result := make(map[uint32]bool)
	for _, id := range explorerFlags() {
		if value, known := flags[id]; known {
			result[id] = value
		}
	}
	for _, boss := range explorerBosses() {
		if value, known := flags[boss.Flag]; known {
			result[boss.ID] = value
		}
	}
	return result
}
