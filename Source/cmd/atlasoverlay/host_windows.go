package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"time"
	"unsafe"

	webview "github.com/jchv/go-webview2"
	"golang.org/x/sys/windows"
)

var (
	user32         = windows.NewLazySystemDLL("user32.dll")
	foreground     = user32.NewProc("GetForegroundWindow")
	getWindowPID   = user32.NewProc("GetWindowThreadProcessId")
	keyState       = user32.NewProc("GetAsyncKeyState")
	clientRect     = user32.NewProc("GetClientRect")
	clientToScreen = user32.NewProc("ClientToScreen")
	windowPosition = user32.NewProc("SetWindowPos")
	showWindow     = user32.NewProc("ShowWindow")
	focusWindow    = user32.NewProc("SetForegroundWindow")
	attachInput    = user32.NewProc("AttachThreadInput")
	getWindowLong  = user32.NewProc("GetWindowLongPtrW")
	setWindowLong  = user32.NewProc("SetWindowLongPtrW")
	setDPI         = user32.NewProc("SetProcessDpiAwarenessContext")
	messageBox     = user32.NewProc("MessageBoxW")
	windowDPI      = user32.NewProc("GetDpiForWindow")
	layeredAlpha   = user32.NewProc("SetLayeredWindowAttributes")
	setWindowRgn   = user32.NewProc("SetWindowRgn")
	gdi32          = windows.NewLazySystemDLL("gdi32.dll")
	ellipseRegion  = gdi32.NewProc("CreateEllipticRgn")
	deleteObject   = gdi32.NewProc("DeleteObject")
)

type point struct{ X, Y int32 }
type rect struct{ Left, Top, Right, Bottom int32 }

func reportError(err error) {
	title, _ := windows.UTF16PtrFromString("Tarnished Atlas")
	message, _ := windows.UTF16PtrFromString(err.Error())
	messageBox.Call(0, uintptr(unsafe.Pointer(message)), uintptr(unsafe.Pointer(title)), 0x10)
}

func activeWindow() (uintptr, uint32) {
	hwnd, _, _ := foreground.Call()
	var pid uint32
	if hwnd != 0 {
		getWindowPID.Call(hwnd, uintptr(unsafe.Pointer(&pid)))
	}
	return hwnd, pid
}

const (
	vkF6               = 0x75
	vkF7               = 0x76
	liveSampleInterval = 26 * time.Millisecond

	styleIndex         = ^uintptr(15)
	extendedStyleIndex = ^uintptr(19)
	windowTool         = 0x00000080
	windowApp          = 0x00040000
	windowLayered      = 0x00080000
	windowTransparent  = 0x00000020
	windowNoActivate   = 0x08000000
	windowPopup        = 0x80000000
	windowOverlapped   = 0x00CF0000

	noActivate    = 0x0010
	frameChanged  = 0x0020
	showOnMove    = 0x0040
	noOwnerZOrder = 0x0200
)

func keyDown(key uintptr) bool {
	state, _, _ := keyState.Call(key)
	return state&0x8000 != 0
}

func gameExited(process windows.Handle) bool {
	status, err := windows.WaitForSingleObject(process, 0)
	return err != nil || status != uint32(windows.WAIT_TIMEOUT)
}

type overlayMode int

const (
	passiveMinimap overlayMode = iota
	journalOverlay
)

type panel struct {
	view       webview.WebView
	hwnd       uintptr
	gameWindow uintptr
	gameID     uint32
	mode       overlayMode
	shown      bool
	bounds     rect
	roundSize  int32
	player     *playerPosition
	liveStatus string
	minimap    *minimapStore
	hudHidden  bool
	alpha      uintptr
}

func clientBounds(window uintptr) (rect, bool) {
	var bounds rect
	var origin point
	ok, _, _ := clientRect.Call(window, uintptr(unsafe.Pointer(&bounds)))
	if ok == 0 {
		return rect{}, false
	}
	ok, _, _ = clientToScreen.Call(window, uintptr(unsafe.Pointer(&origin)))
	if ok == 0 || bounds.Right < 320 || bounds.Bottom < 240 {
		return rect{}, false
	}
	return rect{origin.X, origin.Y, origin.X + bounds.Right, origin.Y + bounds.Bottom}, true
}

func (p *panel) place(force bool) {
	if p.mode == passiveMinimap && p.hudHidden {
		p.hide()
		return
	}
	area, ok := clientBounds(p.gameWindow)
	if !ok {
		p.hide()
		return
	}
	dpi, _, _ := windowDPI.Call(p.gameWindow)
	if dpi == 0 {
		dpi = 96
	}
	width, height := area.Right-area.Left, area.Bottom-area.Top
	gap := int32(14 * dpi / 96)
	bounds := area
	var size int32
	alpha := uintptr(255)
	if p.mode == passiveMinimap {
		settings := p.minimap.current()
		size = max(1, min(width-2*gap, height-2*gap, int32(uintptr(settings.Size)*dpi/96)))
		left, top := area.Right-gap-size, area.Top+gap
		if strings.HasSuffix(settings.Corner, "-left") {
			left = area.Left + gap
		}
		if strings.HasPrefix(settings.Corner, "bottom-") {
			top = area.Bottom - gap - size
		}
		bounds = rect{left, top, left + size, top + size}
		alpha = uintptr((settings.Opacity*255 + 50) / 100)
	}
	if p.alpha != alpha {
		if ok, _, _ := layeredAlpha.Call(p.hwnd, 0, alpha, 2); ok != 0 {
			p.alpha = alpha
		}
	}
	p.setShape(size)
	if p.shown && p.bounds == bounds && !force {
		return
	}
	flags := uintptr(noActivate | showOnMove | noOwnerZOrder)
	if force {
		flags |= frameChanged
	}
	positioned, _, _ := windowPosition.Call(p.hwnd, ^uintptr(0), uintptr(bounds.Left), uintptr(bounds.Top),
		uintptr(bounds.Right-bounds.Left), uintptr(bounds.Bottom-bounds.Top), flags)
	if positioned != 0 {
		p.bounds, p.shown = bounds, true
	}
}

func (p *panel) setShape(size int32) {
	if size == p.roundSize {
		return
	}
	var region uintptr
	if size > 0 {
		region, _, _ = ellipseRegion.Call(0, 0, uintptr(size), uintptr(size))
		if region == 0 {
			return
		}
	}
	if ok, _, _ := setWindowRgn.Call(p.hwnd, region, 1); ok != 0 {
		p.roundSize = size
	} else if region != 0 {
		// Windows only owns the region after SetWindowRgn succeeds.
		deleteObject.Call(region)
	}
}

func (p *panel) hide() {
	if p.shown {
		showWindow.Call(p.hwnd, 0)
		p.shown = false
	}
}

func (p *panel) syncMode() {
	if p.mode == journalOverlay {
		p.view.Eval("window.setAtlasOpen?.(true)")
	} else {
		p.view.Eval("window.setAtlasOpen?.(false)")
	}
}

func activateWindow(target uintptr) {
	if ok, _, _ := focusWindow.Call(target); ok == 0 {
		active, _ := activeWindow()
		thread, _, _ := getWindowPID.Call(active, 0)
		current := uintptr(windows.GetCurrentThreadId())
		if thread != 0 && thread != current {
			if attached, _, _ := attachInput.Call(current, thread, 1); attached != 0 {
				focusWindow.Call(target)
				attachInput.Call(current, thread, 0)
			}
		}
	}
}

func (p *panel) setMode(mode overlayMode, takeFocus bool) {
	p.mode = mode
	style, _, _ := getWindowLong.Call(p.hwnd, extendedStyleIndex)
	style &^= windowTransparent | windowNoActivate
	if mode == passiveMinimap {
		style |= windowTransparent | windowNoActivate
	}
	setWindowLong.Call(p.hwnd, extendedStyleIndex, style)
	p.syncMode()
	if takeFocus {
		p.place(true)
		target := p.hwnd
		if mode == passiveMinimap {
			target = p.gameWindow
		}
		activateWindow(target)
	}
}

func (p *panel) update(hwnd uintptr, owner uint32, toggleOverlay, toggleMinimap bool) {
	if owner == p.gameID {
		p.gameWindow = hwnd
	} else if hwnd != p.hwnd {
		p.hide()
		if p.mode != passiveMinimap {
			p.setMode(passiveMinimap, false)
		}
		return
	}

	if toggleMinimap && p.mode == passiveMinimap {
		p.hudHidden = !p.hudHidden
	}
	switch {
	case toggleOverlay && p.mode == journalOverlay:
		p.setMode(passiveMinimap, true)
	case toggleOverlay:
		p.setMode(journalOverlay, true)
	default:
		p.place(false)
	}
}

func (p *panel) sendPlayer() {
	position, _ := json.Marshal(p.player)
	status, _ := json.Marshal(p.liveStatus)
	p.view.Eval("window.setAtlasPlayer?.(" + string(position) + "," + string(status) + ")")
}

func (p *panel) follow(process windows.Handle, path string) {
	samples := make(chan liveSample, 1)
	done := make(chan struct{})
	defer close(done)
	go streamPlayer(p.gameID, path, samples, done)
	overlayHeld := keyDown(vkF6)
	minimapHeld := keyDown(vkF7)
	tick := time.NewTicker(liveSampleInterval)
	defer tick.Stop()
	var queued atomic.Bool
	for range tick.C {
		if gameExited(process) {
			p.view.Dispatch(p.view.Terminate)
			return
		}
		if !queued.CompareAndSwap(false, true) {
			continue
		}
		hwnd, owner := activeWindow()
		overlayKey := keyDown(vkF6)
		minimapKey := keyDown(vkF7)
		toggleOverlay := overlayKey && !overlayHeld
		toggleMinimap := minimapKey && !minimapHeld
		overlayHeld = overlayKey
		minimapHeld = minimapKey
		p.view.Dispatch(func() {
			defer queued.Store(false)
			p.update(hwnd, owner, toggleOverlay, toggleMinimap)
			select {
			case sample := <-samples:
				p.player, p.liveStatus = sample.position, sample.status
				p.sendPlayer()
			default:
			}
		})
	}
}

func runOverlay(gameID uint32, tracker *saveTracker) error {
	if gameID == 0 {
		return errors.New("Load AtlasOverlay.dll with your offline Elden Ring mod loader, then press F6 in the game.")
	}
	process, err := windows.OpenProcess(windows.SYNCHRONIZE|windows.PROCESS_QUERY_LIMITED_INFORMATION, false, gameID)
	if err != nil {
		return errors.New("The Elden Ring process is unavailable.")
	}
	defer windows.CloseHandle(process)
	executable := make([]uint16, 32768)
	size := uint32(len(executable))
	if err := windows.QueryFullProcessImageName(process, 0, &executable[0], &size); err != nil ||
		!strings.EqualFold(filepath.Base(windows.UTF16ToString(executable[:size])), "eldenring.exe") {
		return errors.New("The overlay must be started by Elden Ring.")
	}

	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	if setDPI.Find() == nil {
		setDPI.Call(^uintptr(3)) // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
	}

	var gameWindow uintptr
	for gameWindow == 0 {
		if gameExited(process) {
			return nil
		}
		hwnd, owner := activeWindow()
		if _, ok := clientBounds(hwnd); owner == gameID && ok {
			gameWindow = hwnd
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	minimap := loadMinimapStore()
	url, server, err := serve(tracker, minimap)
	if err != nil {
		return errors.New("Could not start the local overlay view.")
	}
	defer server.Close()
	cache, err := os.UserCacheDir()
	if err != nil {
		return errors.New("Could not find the Windows local app-data folder.")
	}
	view := webview.NewWithOptions(webview.WebViewOptions{
		DataPath:      filepath.Join(cache, "TarnishedAtlas", "WebView2"),
		AutoFocus:     true,
		WindowOptions: webview.WindowOptions{Title: "Tarnished Atlas", Width: 310, Height: 310},
	})
	if view == nil {
		return errors.New("The overlay needs the Microsoft Edge WebView2 Runtime.")
	}
	defer view.Destroy()
	hwnd := uintptr(view.Window())
	showWindow.Call(hwnd, 0)
	style, _, _ := getWindowLong.Call(hwnd, styleIndex)
	setWindowLong.Call(hwnd, styleIndex, style&^windowOverlapped|windowPopup)
	extendedStyle, _, _ := getWindowLong.Call(hwnd, extendedStyleIndex)
	setWindowLong.Call(hwnd, extendedStyleIndex, extendedStyle&^windowApp|windowTool|windowLayered|windowTransparent|windowNoActivate)
	layeredAlpha.Call(hwnd, 0, 255, 2) // LWA_ALPHA
	panel := &panel{view: view, hwnd: hwnd, gameWindow: gameWindow, gameID: gameID, minimap: minimap, alpha: 255}
	view.Init("window.atlasStartingOpen = false;")
	if err := view.Bind("hideOverlay", func() { panel.setMode(passiveMinimap, true) }); err != nil {
		return errors.New("Could not initialize the overlay controls.")
	}
	if err := view.Bind("overlayReady", func() {
		panel.syncMode()
		panel.sendPlayer()
	}); err != nil {
		return errors.New("Could not initialize the overlay controls.")
	}
	view.Navigate(url)
	if active, owner := activeWindow(); owner == gameID || active == hwnd || active == 0 {
		focusWindow.Call(gameWindow)
		panel.place(true)
	}
	go panel.follow(process, windows.UTF16ToString(executable[:size]))
	view.Run()
	return nil
}
