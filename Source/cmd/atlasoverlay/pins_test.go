package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
)

func TestPinsPersistForSeveralQuests(t *testing.T) {
	path := filepath.Join(t.TempDir(), "overlay", "preferences.json")
	allowed := map[string]bool{"ranni": true, "thops": true, "boc": true, "varre": true}
	store := newPinStore(path, allowed)
	post := func(body string) int {
		req := httptest.NewRequest(http.MethodPost, "/pins", strings.NewReader(body))
		res := httptest.NewRecorder()
		store.serveHTTP(res, req)
		return res.Code
	}
	if status := post(`{"questId":"unlisted","pinned":true}`); status != http.StatusBadRequest {
		t.Fatalf("unknown quest accepted, status %d", status)
	}
	if status := post(`{"questId":"ranni","pinned":true,"kind":"giver"}`); status != http.StatusNoContent {
		t.Fatalf("could not pin giver, status %d", status)
	}
	var writes sync.WaitGroup
	for _, id := range []string{"ranni", "varre", "boc"} {
		writes.Add(1)
		go func(id string) {
			defer writes.Done()
			if status := post(`{"questId":"` + id + `","pinned":true}`); status != http.StatusNoContent {
				t.Errorf("could not pin %s, status %d", id, status)
			}
		}(id)
	}
	writes.Wait()
	rebooted := newPinStore(path, allowed)
	if have := pinIDs(rebooted.pins); !reflect.DeepEqual(have, []string{"boc", "ranni", "varre"}) {
		t.Fatalf("wrong pins after restart: %v", have)
	}
	if status := post(`{"questId":"ranni","pinned":false}`); status != http.StatusNoContent {
		t.Fatalf("could not unpin, status %d", status)
	}
	res := httptest.NewRecorder()
	newPinStore(path, allowed).serveHTTP(res, httptest.NewRequest(http.MethodGet, "/pins", nil))
	var saved pinSettings
	want := pinSettings{Pins: []string{"boc", "varre"}, Givers: []string{"ranni"}}
	if err := json.Unmarshal(res.Body.Bytes(), &saved); err != nil || !reflect.DeepEqual(saved, want) {
		t.Fatalf("unpin affected other pins: %v, %v", saved, err)
	}
}
