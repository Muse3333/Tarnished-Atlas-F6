package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sync"
)

type waypointPosition struct {
	Lat   float64 `json:"lat"`
	Lng   float64 `json:"lng"`
	Label string  `json:"label,omitempty"`
}

type plannerPreferences struct {
	Waypoint    *waypointPosition `json:"waypoint"`
	Ending      string            `json:"ending"`
	SpoilerFree bool              `json:"spoilerFree"`
}

func (p plannerPreferences) valid() bool {
	switch p.Ending {
	case "", "fracture", "order", "duskborn", "despair", "stars", "flame":
	default:
		return false
	}
	w := p.Waypoint
	return w == nil || len(w.Label) <= 256 && ((w.Lat >= .255 && w.Lat <= 1.24 && w.Lng >= -1.202 && w.Lng <= -.217) ||
		(w.Lat >= .15 && w.Lat <= .39 && w.Lng >= 1.84 && w.Lng <= 2.06))
}

type plannerStore struct {
	mu    sync.Mutex
	path  string
	prefs plannerPreferences
}

func newPlannerStore(path string) *plannerStore {
	store := &plannerStore{path: path}
	var saved plannerPreferences
	if data, err := os.ReadFile(path); err == nil && json.Unmarshal(data, &saved) == nil && saved.valid() {
		store.prefs = saved
	}
	return store
}

func loadPlannerStore() *plannerStore {
	if dir, err := os.UserConfigDir(); err == nil {
		return newPlannerStore(filepath.Join(dir, "TarnishedAtlas", "planner.json"))
	}
	return newPlannerStore("")
}

func (s *plannerStore) serveHTTP(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	switch r.Method {
	case http.MethodGet:
	case http.MethodPatch:
		next := s.prefs
		r.Body = http.MaxBytesReader(w, r.Body, 1024)
		// Decode into a copy so invalid requests cannot mutate a saved waypoint.
		if next.Waypoint != nil {
			copy := *next.Waypoint
			next.Waypoint = &copy
		}
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		candidate := &next
		if err := decoder.Decode(&candidate); err != nil || candidate == nil || !next.valid() {
			http.Error(w, "Invalid planner preferences", http.StatusBadRequest)
			return
		}
		if err := writePreferences(s.path, next); err != nil {
			http.Error(w, "Could not save planner preferences", http.StatusInternalServerError)
			return
		}
		s.prefs = next
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(s.prefs)
}
