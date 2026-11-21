# Build Tarnished Atlas

Prerequisites are Go 1.25 or later and a Zig release with Windows GNU x86-64 support. Run these from the unpacked Source directory on Linux. The packaged binaries target Windows x64.

```bash
export GOOS=windows GOARCH=amd64 CGO_ENABLED=0
go build -buildvcs=false -trimpath -ldflags='-s -w -H=windowsgui' -o AtlasOverlay.exe ./cmd/atlasoverlay
zig cc -target x86_64-windows-gnu -shared -O2 bootstrap/AtlasOverlay.c -o AtlasOverlay.dll -luser32
```

Place the resulting DLL and EXE together. Go resolves the pinned public dependencies in go.mod and go.sum. Relevant library notices are included. Run the tests with `go test ./cmd/atlasoverlay` and `node cmd/atlasoverlay/overlay.test.mjs`. The private saves used for verification are excluded.
