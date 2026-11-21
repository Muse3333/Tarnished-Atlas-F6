//go:build !windows

package main

import (
	"errors"
	"log"
)

func runOverlay(game uint32, tracker *saveTracker) error {
	return errors.New("the in-game overlay requires Windows")
}

func reportError(err error) { log.Fatal(err) }
