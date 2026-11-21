package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"sync"
)

type pinSettings struct {
	Pins   []string `json:"pins"`
	Givers []string `json:"givers"`
}

type pinStore struct {
	mu      sync.Mutex
	path    string
	allowed map[string]bool
	pins    map[string]bool
	givers  map[string]bool
}

func newPinStore(path string, questIDs map[string]bool) *pinStore {
	s := &pinStore{path: path, allowed: questIDs, pins: map[string]bool{}, givers: map[string]bool{}}
	raw, err := os.ReadFile(path)
	if err != nil {
		return s
	}
	var saved pinSettings
	if json.Unmarshal(raw, &saved) == nil {
		for _, id := range saved.Pins {
			if s.allowed[id] {
				s.pins[id] = true
			}
		}
		for _, id := range saved.Givers {
			if s.allowed[id] {
				s.givers[id] = true
			}
		}
	}
	return s
}

func defaultPinStore() *pinStore {
	dir, err := os.UserConfigDir()
	path := ""
	if err == nil {
		path = filepath.Join(dir, "TarnishedAtlas", "preferences.json")
	}
	var catalog []struct {
		ID string `json:"id"`
	}
	raw, err := assets.ReadFile("ui/quests.json")
	if err != nil || json.Unmarshal(raw, &catalog) != nil {
		panic("invalid quest catalog")
	}
	questIDs := make(map[string]bool, len(catalog))
	for _, q := range catalog {
		questIDs[q.ID] = true
	}
	return newPinStore(path, questIDs)
}

func pinIDs(pins map[string]bool) []string {
	result := make([]string, 0, len(pins))
	for id := range pins {
		result = append(result, id)
	}
	sort.Strings(result)
	return result
}

func (s *pinStore) settings() pinSettings {
	return pinSettings{Pins: pinIDs(s.pins), Givers: pinIDs(s.givers)}
}

func (s *pinStore) setPin(id string, pinned, giver bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	current := &s.pins
	if giver {
		current = &s.givers
	}
	if (*current)[id] == pinned {
		return nil
	}
	next := make(map[string]bool, len(*current)+1)
	for id := range *current {
		next[id] = true
	}
	if pinned {
		next[id] = true
	} else {
		delete(next, id)
	}
	settings := s.settings()
	if giver {
		settings.Givers = pinIDs(next)
	} else {
		settings.Pins = pinIDs(next)
	}
	if err := writePreferences(s.path, settings); err != nil {
		return err
	}
	*current = next
	return nil
}

func writePreferences(path string, data any) error {
	if path == "" {
		return errors.New("preferences folder is unavailable")
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	file, err := os.CreateTemp(dir, "preferences-*.json")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	encodeErr := json.NewEncoder(file).Encode(data)
	closeErr := file.Close()
	if encodeErr != nil {
		return encodeErr
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(file.Name(), path)
}

func (s *pinStore) serveHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.mu.Lock()
		data := s.settings()
		s.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(data)
	case http.MethodPost:
		var input struct {
			QuestID string `json:"questId"`
			Pinned  *bool  `json:"pinned"`
			Kind    string `json:"kind"`
		}
		r.Body = http.MaxBytesReader(w, r.Body, 128)
		if json.NewDecoder(r.Body).Decode(&input) != nil || !s.allowed[input.QuestID] || input.Pinned == nil ||
			(input.Kind != "" && input.Kind != "giver") {
			http.Error(w, "Invalid pin selection", http.StatusBadRequest)
			return
		}
		if err := s.setPin(input.QuestID, *input.Pinned, input.Kind == "giver"); err != nil {
			http.Error(w, "Could not save pin preferences", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
