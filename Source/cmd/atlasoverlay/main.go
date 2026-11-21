package main

import (
	"crypto/rand"
	"embed"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"time"
)

//go:embed ui
var assets embed.FS

//go:embed rules.json
var stageRules []byte

func serve(tracker *saveTracker, minimap *minimapStore) (string, *http.Server, error) {
	var token [16]byte
	if _, err := rand.Read(token[:]); err != nil {
		return "", nil, err
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return "", nil, err
	}
	basePath := "/" + hex.EncodeToString(token[:]) + "/"
	mux := http.NewServeMux()
	mux.HandleFunc(basePath+"pins", defaultPinStore().serveHTTP)
	mux.HandleFunc(basePath+"minimap-settings", minimap.serveHTTP)
	mux.HandleFunc(basePath+"planner", loadPlannerStore().serveHTTP)
	mux.HandleFunc(basePath+"manual-progress", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var input struct {
			Profile string `json:"profile"`
			Step    string `json:"step"`
			Checked bool   `json:"checked"`
		}
		r.Body = http.MaxBytesReader(w, r.Body, 512)
		if json.NewDecoder(r.Body).Decode(&input) != nil {
			http.Error(w, "Invalid quest check", http.StatusBadRequest)
			return
		}
		valid, err := tracker.setManual(input.Profile, input.Step, input.Checked)
		if err != nil {
			http.Error(w, "Could not save quest check", http.StatusInternalServerError)
		} else if !valid {
			http.Error(w, "Quest check does not match the active character", http.StatusConflict)
		} else {
			w.WriteHeader(http.StatusNoContent)
		}
	})
	mux.HandleFunc(basePath+"explore", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"weapons": weaponCatalogue(), "bosses": explorerBosses()})
	})
	mux.HandleFunc(basePath+"progress", func(w http.ResponseWriter, r *http.Request) {
		var chosen *int
		if r.Method == http.MethodPost {
			var input struct {
				Slot *int `json:"slot"`
			}
			r.Body = http.MaxBytesReader(w, r.Body, 100)
			if json.NewDecoder(r.Body).Decode(&input) != nil || input.Slot == nil || *input.Slot < 0 || *input.Slot > 10 {
				http.Error(w, "Invalid character slot", http.StatusBadRequest)
				return
			}
			chosen = input.Slot
		} else if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(tracker.state(chosen))
	})
	web, _ := fs.Sub(assets, "ui")
	mux.Handle(basePath, http.StripPrefix(basePath, http.FileServer(http.FS(web))))
	server := &http.Server{
		ReadHeaderTimeout: 3 * time.Second,
		WriteTimeout:      10 * time.Second,
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Host != listener.Addr().String() {
				http.Error(w, "Invalid host", http.StatusBadRequest)
				return
			}
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("Referrer-Policy", "no-referrer")
			w.Header().Set("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tiles.mapgenie.io; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'")
			mux.ServeHTTP(w, r)
		}),
	}
	go func() { _ = server.Serve(listener) }()
	return "http://" + listener.Addr().String() + basePath, server, nil
}

func main() {
	game := flag.Uint("game", 0, "process ID supplied by the mod DLL")
	inspect := flag.Bool("inspect", false, "print save progress and exit")
	preview := flag.Bool("preview", false, "serve the UI for local testing")
	save := flag.String("save", "", "explicit PC save path for testing")
	slot := flag.Int("slot", 0, "character slot for inspection or preview")
	flag.Parse()
	if *slot < 0 || *slot > 10 {
		log.Fatal("slot must be between 0 and 10")
	}
	tracker := newTracker(*save)
	if *slot > 0 {
		tracker.selected = *slot
	}
	if *inspect {
		_ = json.NewEncoder(os.Stdout).Encode(tracker.state(nil))
		return
	}
	if *preview {
		url, server, err := serve(tracker, loadMinimapStore())
		if err != nil {
			log.Fatal(err)
		}
		defer server.Close()
		fmt.Println(url)
		select {}
	}
	if err := runOverlay(uint32(*game), tracker); err != nil {
		reportError(err)
	}
}
