package main

import (
	"encoding/binary"
	"math"
	"testing"
)

func playerFrame(rawMap, mapID uint32, x, y, heading float32, underground bool) [36]byte {
	var data [36]byte
	binary.LittleEndian.PutUint32(data[:], rawMap)
	binary.LittleEndian.PutUint32(data[16:], mapID)
	binary.LittleEndian.PutUint32(data[20:], math.Float32bits(x))
	binary.LittleEndian.PutUint32(data[24:], math.Float32bits(y))
	binary.LittleEndian.PutUint32(data[32:], math.Float32bits(heading))
	if underground {
		data[28] = 1
	}
	return data
}

func TestPlayerMapCoordinates(t *testing.T) {
	// Pixel matches from the Lands Between and Underground Map Genie tiles at z=15.
	tests := []struct {
		name                string
		rawMap              uint32
		x, y                float32
		underground         bool
		pixelX, pixelY, yaw int
	}{
		{"The First Step", 0x3c2a2400, 3699, 7350, false, 4177394, 4180023, 90},
		{"Ainsel River Main", 0x0c010000, 2710, 4268, true, 4176209, 4185163, 180},
		{"Dynasty Mausoleum Entrance", 0x0c0a0000, 5714, 6744, true, 4179213, 4187639, -90},
	}
	const size = 1 << 23
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data := playerFrame(tt.rawMap, 0, tt.x, tt.y, float32(tt.yaw), tt.underground)
			sample, ok := mapPlayerPosition(data[:])
			if !ok || sample.position == nil {
				t.Fatal("missing live position")
			}
			p := sample.position
			x := (p.Lng/360 + .5) * size
			y := (.5 - math.Asinh(math.Tan(p.Lat*math.Pi/180))/(2*math.Pi)) * size
			if math.Abs(x-float64(tt.pixelX)) > .01 || math.Abs(y-float64(tt.pixelY)) > .01 ||
				p.Heading != float64(tt.yaw) {
				t.Fatalf("got Map Genie pixel (%f,%f), heading %f", x, y, p.Heading)
			}
		})
	}
}

func TestPlayerMapRejectsInvalidPosition(t *testing.T) {
	for _, test := range []struct {
		rawMap, mapID uint32
		status        string
	}{
		{0x0b0a0000, 0, "Roundtable Hold"},
	} {
		raw := playerFrame(test.rawMap, test.mapID, 2841, 7610, 0, false)
		got, ok := mapPlayerPosition(raw[:])
		if !ok || got.position != nil || got.status != test.status {
			t.Fatalf("unexpected sample %+v", got)
		}
	}
	raw := playerFrame(0x3c2a2400, 0, 3699, 7350, float32(math.NaN()), false)
	if _, ok := mapPlayerPosition(raw[:]); ok {
		t.Fatal("accepted invalid heading")
	}
	raw = playerFrame(0, 0, 0, 0, 0, false)
	if _, ok := mapPlayerPosition(raw[:]); ok {
		t.Fatal("accepted empty frame")
	}
}

func TestShadowMapProjection(t *testing.T) {
	// Gravesite Plain is published in native map pixels by the DLC map view.
	for _, area := range []uint32{0x3d2e2800, 0x14000000} {
		raw := playerFrame(area, 10, 4797.56, 6237.914, 36, false)
		got, ok := mapPlayerPosition(raw[:])
		if !ok || got.position == nil || got.position.Layer != "shadow" || got.position.Underground ||
			math.Abs(got.position.Lat-.24728114) > .00002 || math.Abs(got.position.Lng-1.92250271) > .00002 {
			t.Fatalf("unexpected Shadow Realm position: %+v", got.position)
		}
	}
}

func TestCameraBearing(t *testing.T) {
	tests := []struct {
		name    string
		right   [3]float32
		forward [3]float32
		want    float64
		valid   bool
	}{
		{"north", [3]float32{1, 0, 0}, [3]float32{0, 0, 1}, 0, true},
		{"east", [3]float32{0, 0, -1}, [3]float32{1, 0, 0}, 90, true},
		{"south", [3]float32{-1, 0, 0}, [3]float32{0, 0, -1}, 180, true},
		{"west", [3]float32{0, 0, 1}, [3]float32{-1, 0, 0}, -90, true},
		{"pitch down", [3]float32{0, 0, -1}, [3]float32{0.6, -0.8, 0}, 90, true},
		{"vertical west", [3]float32{0, 0, 1}, [3]float32{0, -1, 0}, -90, true},
		{"unavailable", [3]float32{}, [3]float32{}, 0, false},
		{"vertical without right vector", [3]float32{}, [3]float32{0, 1, 0}, 0, false},
		{"invalid", [3]float32{}, [3]float32{float32(math.NaN()), 0, 1}, 0, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var matrix [48]byte
			for i := range tt.forward {
				binary.LittleEndian.PutUint32(matrix[4*i:], math.Float32bits(tt.right[i]))
				binary.LittleEndian.PutUint32(matrix[32+4*i:], math.Float32bits(tt.forward[i]))
			}
			got, valid := readCameraBearing(matrix)
			if valid != tt.valid || math.Abs(got-tt.want) > 1e-6 {
				t.Fatalf("bearing = (%f, %t), want (%f, %t)", got, valid, tt.want, tt.valid)
			}
		})
	}
}
