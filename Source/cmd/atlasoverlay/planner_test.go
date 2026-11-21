package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestPlannerPreferencesPersistIndependentChanges(t *testing.T) {
	path := filepath.Join(t.TempDir(), "TarnishedAtlas", "planner.json")
	store := newPlannerStore(path)
	patch := func(body string, status int) {
		t.Helper()
		request := httptest.NewRequest(http.MethodPatch, "/planner", strings.NewReader(body))
		response := httptest.NewRecorder()
		store.serveHTTP(response, request)
		if response.Code != status {
			t.Fatalf("PATCH %s returned %d, want %d", body, response.Code, status)
		}
	}
	patch(`{"waypoint":{"lat":0.66,"lng":-0.8}}`, http.StatusOK)
	patch(`{"ending":"stars","spoilerFree":true}`, http.StatusOK)
	patch(`{"waypoint":{"lat":5,"lng":1},"spoilerFree":false}`, http.StatusBadRequest)
	patch(`{"ending":"unknown"}`, http.StatusBadRequest)
	patch(`null`, http.StatusBadRequest)
	store = newPlannerStore(path)
	saved := store.prefs
	if !saved.SpoilerFree || saved.Ending != "stars" || saved.Waypoint == nil || *saved.Waypoint != (waypointPosition{Lat: .66, Lng: -.8}) {
		t.Fatalf("incorrect saved preferences after invalid changes: %+v", saved)
	}
	patch(`{"waypoint":null}`, http.StatusOK)
	res := httptest.NewRecorder()
	newPlannerStore(path).serveHTTP(res, httptest.NewRequest(http.MethodGet, "/planner", nil))
	var got plannerPreferences
	if err := json.Unmarshal(res.Body.Bytes(), &got); err != nil || got.Ending != "stars" || !got.SpoilerFree || got.Waypoint != nil {
		t.Fatalf("clearing waypoint affected other preferences: %+v (%v)", got, err)
	}
}
