package main

import (
	"bytes"
	"debug/pe"
	"encoding/binary"
	"strings"
	"time"

	"golang.org/x/sys/windows"
)

// These Windows fields and signatures describe the map, camera and loading state. The
// reader shares the game's map projection and has no write or injection path.
// Field references: github.com/soarqin/EROverlay (MIT).
type liveReader struct {
	process   windows.Handle
	menu      uintptr
	gameData  uintptr
	fieldArea uintptr
	layout    int
}

type menuLayout struct {
	owner, view, loading uintptr
}

var menuLayouts = []menuLayout{
	{0x80, 0x250, 0x730},
	{0x80, 0x248, 0x728},
	{0x78, 0x248, 0x718},
}

func readProcess(process windows.Handle, address uintptr, target []byte) bool {
	var count uintptr
	return address != 0 && windows.ReadProcessMemory(process, address, &target[0], uintptr(len(target)), &count) == nil &&
		count == uintptr(len(target))
}

func findGlobal(text []byte, instructions []byte, exact []int, textRVA uint32, writable *pe.Section) uint32 {
	var resolved uint32
	for start := 0; start <= len(text)-len(instructions); {
		n := bytes.Index(text[start:], instructions[:3])
		if n < 0 {
			break
		}
		i := start + n
		start = i + 1
		if i+len(instructions) > len(text) {
			break
		}
		matches := true
		for _, n := range exact {
			if text[i+n] != instructions[n] {
				matches = false
				break
			}
		}
		if !matches {
			continue
		}
		rel := int32(binary.LittleEndian.Uint32(text[i+3:]))
		target := int64(textRVA) + int64(i) + 7 + int64(rel)
		if target < int64(writable.VirtualAddress) || target+8 > int64(writable.VirtualAddress)+int64(writable.VirtualSize) {
			continue
		}
		if resolved != 0 && int64(resolved) != target {
			return 0
		}
		resolved = uint32(target)
	}
	return resolved
}

func locatePlayer(process windows.Handle, pid uint32, path string) *liveReader {
	snapshot, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPMODULE, pid)
	if err != nil {
		return nil
	}
	defer windows.CloseHandle(snapshot)
	module := windows.ModuleEntry32{Size: uint32(windows.SizeofModuleEntry32)}
	if windows.Module32First(snapshot, &module) != nil || !strings.EqualFold(windows.UTF16ToString(module.Module[:]), "eldenring.exe") {
		return nil
	}
	image, err := pe.Open(path)
	if err != nil {
		return nil
	}
	defer image.Close()
	text, data := image.Section(".text"), image.Section(".data")
	if text == nil || data == nil || text.VirtualSize > 128<<20 || text.VirtualSize == 0 ||
		uint64(text.VirtualAddress)+uint64(text.VirtualSize) > uint64(module.ModBaseSize) {
		return nil
	}
	code := make([]byte, text.VirtualSize)
	if !readProcess(process, module.ModBaseAddr+uintptr(text.VirtualAddress), code) {
		return nil
	}
	menu := findGlobal(code,
		[]byte{0x48, 0x8b, 0x0d, 0, 0, 0, 0, 0x48, 0x8b, 0x49, 0x08, 0xe8, 0, 0, 0, 0, 0x48, 0x8b, 0xd0, 0x48, 0x8b, 0xce, 0xe8},
		[]int{7, 8, 9, 10, 11, 16, 17, 18, 19, 20, 21, 22}, text.VirtualAddress, data)
	gameData := findGlobal(code,
		[]byte{0x48, 0x8b, 0x05, 0, 0, 0, 0, 0x48, 0x85, 0xc0, 0x74, 0x05, 0x48, 0x8b, 0x40, 0x58, 0xc3, 0xc3},
		[]int{7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17}, text.VirtualAddress, data)
	if menu == 0 || gameData == 0 {
		return nil
	}
	reader := &liveReader{process: process, menu: module.ModBaseAddr + uintptr(menu),
		gameData: module.ModBaseAddr + uintptr(gameData), layout: -1}
	// FieldArea's RIP-relative load, as located by kh0nsu/EldenRingTool.
	fieldArea := findGlobal(code,
		[]byte{0x48, 0x8b, 0x0d, 0, 0, 0, 0, 0x48, 0, 0, 0, 0x44, 0x0f, 0xb6, 0x61, 0, 0xe8,
			0, 0, 0, 0, 0x48, 0x63, 0x87, 0, 0, 0, 0, 0x48, 0, 0, 0, 0x48, 0x85, 0xc0},
		[]int{7, 11, 12, 13, 14, 16, 21, 22, 23, 28, 32, 33, 34}, text.VirtualAddress, data)
	if fieldArea != 0 {
		reader.fieldArea = module.ModBaseAddr + uintptr(fieldArea)
	}
	return reader
}

func (r *liveReader) pointer(at uintptr) uintptr {
	var raw [8]byte
	if !readProcess(r.process, at, raw[:]) {
		return 0
	}
	p := uintptr(binary.LittleEndian.Uint64(raw[:]))
	if p < 0x10000 || p > 0x7fffffffffff {
		return 0
	}
	return p
}

func (r *liveReader) mapSample(menu, gameData, player uintptr, layout menuLayout) (liveSample, bool) {
	var loading [2]byte
	if !readProcess(r.process, menu+layout.loading, loading[:]) || binary.LittleEndian.Uint16(loading[:]) != 0 {
		return liveSample{}, false
	}
	owner := r.pointer(menu + layout.owner)
	if owner == 0 {
		return liveSample{}, false
	}
	view := r.pointer(owner + layout.view)
	var raw [36]byte
	if view == 0 || !readProcess(r.process, view+0x14, raw[:]) ||
		r.pointer(r.menu) != menu || r.pointer(menu+layout.owner) != owner ||
		r.pointer(owner+layout.view) != view || r.pointer(r.gameData) != gameData ||
		r.pointer(gameData+0x58) != player {
		return liveSample{}, false
	}
	sample, ok := mapPlayerPosition(raw[:])
	if ok && sample.position != nil {
		sample.position.CameraHeading, sample.position.CameraAvailable = r.cameraBearing()
	}
	return sample, ok
}

func (r *liveReader) cameraBearing() (float64, bool) {
	field := r.pointer(r.fieldArea)
	if field == 0 {
		return 0, false
	}
	controller := r.pointer(field + 0x20)
	if controller == 0 {
		return 0, false
	}
	camera := r.pointer(controller + 0x18)
	var matrix [48]byte
	if camera == 0 || !readProcess(r.process, camera+0x10, matrix[:]) {
		return 0, false
	}
	return readCameraBearing(matrix)
}

func (r *liveReader) sample() liveSample {
	waiting := liveSample{status: "Waiting for player"}
	menu, gameData := r.pointer(r.menu), r.pointer(r.gameData)
	if menu == 0 || gameData == 0 {
		return waiting
	}
	player := r.pointer(gameData + 0x58)
	if player == 0 {
		return waiting
	}
	if r.layout >= 0 {
		sample, ok := r.mapSample(menu, gameData, player, menuLayouts[r.layout])
		if ok {
			return sample
		}
		return waiting
	}
	for i, layout := range menuLayouts {
		if sample, ok := r.mapSample(menu, gameData, player, layout); ok {
			r.layout = i
			return sample
		}
	}
	return waiting
}

func streamPlayer(pid uint32, path string, samples chan liveSample, done <-chan struct{}) {
	publish := func(sample liveSample) {
		// Replace any unread sample so the overlay always gets the newest frame.
		select {
		case <-samples:
		default:
		}
		select {
		case samples <- sample:
		case <-done:
		}
	}
	process, err := windows.OpenProcess(windows.PROCESS_QUERY_INFORMATION|windows.PROCESS_VM_READ, false, pid)
	if err != nil {
		publish(liveSample{status: "Live position unavailable"})
		return
	}
	defer windows.CloseHandle(process)
	reader := locatePlayer(process, pid, path)
	if reader == nil {
		publish(liveSample{status: "Live position unavailable"})
		return
	}
	tick := time.NewTicker(liveSampleInterval)
	defer tick.Stop()
	var previous liveSample
	for {
		select {
		case <-done:
			return
		case <-tick.C:
			sample := reader.sample()
			if sample.status == previous.status &&
				(sample.position == nil || previous.position != nil && *sample.position == *previous.position) {
				continue
			}
			publish(sample)
			previous = sample
		}
	}
}
