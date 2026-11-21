package main

import (
	"encoding/binary"
	"math"
)

type playerPosition struct {
	Lat             float64 `json:"lat"`
	Lng             float64 `json:"lng"`
	Heading         float64 `json:"heading"`
	CameraHeading   float64 `json:"cameraHeading"`
	CameraAvailable bool    `json:"cameraAvailable"`
	Underground     bool    `json:"underground"`
	Layer           string  `json:"layer,omitempty"`
}

type liveSample struct {
	position *playerPosition
	status   string
}

// The game's world map view publishes one pixel per world unit. Map Genie
// places the same textures at different offsets at zoom 15. The offsets were
// measured by matching the actual map tiles in both layers.
func mapPlayerPosition(data []byte) (liveSample, bool) {
	if len(data) != 36 {
		return liveSample{}, false
	}
	rawMap := binary.LittleEndian.Uint32(data)
	mapID := binary.LittleEndian.Uint32(data[16:])
	x := float64(math.Float32frombits(binary.LittleEndian.Uint32(data[20:])))
	y := float64(math.Float32frombits(binary.LittleEndian.Uint32(data[24:])))
	heading := float64(math.Float32frombits(binary.LittleEndian.Uint32(data[32:])))
	area := rawMap >> 24
	if area < 10 || area > 65 || (mapID != 0 && mapID != 1 && mapID != 10) ||
		!(x >= 0 && x <= 10496 && y >= 0 && y <= 10496 && (x != 0 || y != 0)) ||
		!(heading > -720 && heading < 720) || data[28] > 1 {
		return liveSample{}, false
	}
	if rawMap&0xffff0000 == 0x0b0a0000 {
		return liveSample{status: "Roundtable Hold"}, true
	}
	offsetX, offsetY := 20609.0, 21631.0
	underground := mapID == 1 || data[28] == 1
	layer := ""
	if mapID == 10 || area == 61 {
		// Place the DLC's native map pixels on their own canvas at the same scale.
		offsetX, offsetY = -40000, 12000
		underground, layer = false, "shadow"
	} else if underground {
		offsetX, offsetY = 20805, 13409
	}
	const mapWorld = 1 << 23
	lat := math.Atan(math.Sinh((offsetY-y)*2*math.Pi/mapWorld)) * 180 / math.Pi
	lng := (x - offsetX) * 360 / mapWorld
	return liveSample{position: &playerPosition{Lat: lat, Lng: lng, Heading: heading, Underground: underground, Layer: layer}, status: "Live"}, true
}

// The camera transform uses four floats per vector. +X points east and +Z
// points north on the world map. The right vector supplies yaw when the
// forward vector is nearly vertical.
func readCameraBearing(matrix [48]byte) (float64, bool) {
	component := func(offset int) float64 {
		return float64(math.Float32frombits(binary.LittleEndian.Uint32(matrix[offset:])))
	}
	x, y, z := component(32), component(36), component(40)
	if lengthSquared := x*x + y*y + z*z; !(lengthSquared > 0.9 && lengthSquared < 1.1) {
		return 0, false
	}
	if x*x+z*z < 0.0001 {
		x, z = -component(8), component(0)
		if lengthSquared := x*x + z*z; !(lengthSquared > 0.9 && lengthSquared < 1.1) {
			return 0, false
		}
	}
	return math.Atan2(x, z) * 180 / math.Pi, true
}
