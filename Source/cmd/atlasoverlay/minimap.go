package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sync"
)

type minimapSettings struct {
	Size       int     `json:"size"`
	Opacity    int     `json:"opacity"`
	Corner     string  `json:"corner"`
	Zoom       float64 `json:"zoom"`
	North      bool    `json:"north"`
	GuideQuest string  `json:"guideQuest"`
}

var defaultMinimapSettings = minimapSettings{
	Size: 310, Opacity: 100, Corner: "top-right", Zoom: 13.5, North: true,
}

func (s minimapSettings) valid() bool {
	switch s.Corner {
	case "top-right", "top-left", "bottom-right", "bottom-left":
	default:
		return false
	}
	return s.Size >= 180 && s.Size <= 440 && s.Opacity >= 30 && s.Opacity <= 100 &&
		s.Zoom >= 8 && s.Zoom <= 17 && len(s.GuideQuest) <= 64
}

type minimapStore struct {
	mu       sync.Mutex
	path     string
	settings minimapSettings
}

func newMinimapStore(path string) *minimapStore {
	store := &minimapStore{path: path, settings: defaultMinimapSettings}
	saved := defaultMinimapSettings
	data, err := os.ReadFile(path)
	if err == nil && json.Unmarshal(data, &saved) == nil && saved.valid() {
		store.settings = saved
	}
	return store
}

func loadMinimapStore() *minimapStore {
	dir, err := os.UserConfigDir()
	if err != nil {
		return newMinimapStore("")
	}
	return newMinimapStore(filepath.Join(dir, "TarnishedAtlas", "minimap.json"))
}

func (s *minimapStore) current() minimapSettings {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.settings
}

func (s *minimapStore) save(settings minimapSettings) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := writePreferences(s.path, settings); err != nil {
		return err
	}
	s.settings = settings
	return nil
}

func (s *minimapStore) serveHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(s.current())
	case http.MethodPut:
		var input *minimapSettings
		r.Body = http.MaxBytesReader(w, r.Body, 1024)
		if json.NewDecoder(r.Body).Decode(&input) != nil || input == nil || !input.valid() {
			http.Error(w, "Invalid minimap settings", http.StatusBadRequest)
			return
		}
		if err := s.save(*input); err != nil {
			http.Error(w, "Could not save minimap settings", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
