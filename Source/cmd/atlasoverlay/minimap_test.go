package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestMinimapSettingsPersistAndRejectInvalidValues(t *testing.T) {
	path := filepath.Join(t.TempDir(), "overlay", "minimap.json")
	api := newMinimapStore(path)
	if api.current() != defaultMinimapSettings {
		t.Fatal("a new installation should use the default settings")
	}
	put := func(value any) int {
		payload, err := json.Marshal(value)
		if err != nil {
			t.Fatal(err)
		}
		res := httptest.NewRecorder()
		api.serveHTTP(res, httptest.NewRequest(http.MethodPut, "/minimap-settings", bytes.NewReader(payload)))
		return res.Code
	}
	want := minimapSettings{Size: 220, Opacity: 65, Corner: "bottom-left", Zoom: 15.75, GuideQuest: "ranni"}
	if status := put(want); status != http.StatusNoContent {
		t.Fatalf("saving minimap settings returned %d", status)
	}
	for _, invalid := range []minimapSettings{
		{Size: 500, Opacity: 65, Corner: "bottom-left", Zoom: 15.75},
		{Size: 220, Opacity: 0, Corner: "bottom-left", Zoom: 15.75},
		{Size: 220, Opacity: 65, Corner: "center", Zoom: 15.75},
		{Size: 220, Opacity: 65, Corner: "bottom-left", Zoom: 18},
	} {
		if status := put(invalid); status != http.StatusBadRequest {
			t.Fatalf("invalid settings accepted: %+v, status %d", invalid, status)
		}
	}
	if status := put(nil); status != http.StatusBadRequest {
		t.Fatalf("null settings accepted, status %d", status)
	}
	res := httptest.NewRecorder()
	newMinimapStore(path).serveHTTP(res, httptest.NewRequest(http.MethodGet, "/minimap-settings", nil))
	var got minimapSettings
	if err := json.Unmarshal(res.Body.Bytes(), &got); err != nil || got != want {
		t.Fatalf("reload returned %+v, want %+v (%v)", got, want, err)
	}
}
