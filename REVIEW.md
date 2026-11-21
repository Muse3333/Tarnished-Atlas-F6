# Tarnished Atlas F6 Windows x64 review

This repository contains the source for the build with boss location notes, time-of-day labels, and the separate Lands Between and Shadow of the Erdtree journal tabs.

## Build and verification

- [Build commands](Source/BUILD.md)
- [DLL entry point](Source/bootstrap/AtlasOverlay.c)
- [Companion application](Source/cmd/atlasoverlay)
- [Third-party notices](Source/THIRD-PARTY-NOTICES.md)

Build from `Source` on Linux. The verification used Go 1.27.4 and Zig 0.15.2. The DLL launches the adjacent `AtlasOverlay.exe`. The companion displays the quest journal and minimap, reads progress from the local save, and reads live player position and camera direction. The Lands Between map requests map tiles from Map Genie.

The rebuilt EXE matched the packaged EXE byte for byte. DLL rebuild differences were confined to the PE build hash and PDB identifier.

## SHA-256 of the player ZIP and its binaries

```text
3b26e491e742c32684dd2db4937fb2b1a011903e2955a453121f777c53cde79b  Tarnished_Atlas_F6_Windows_x64.zip
24024192051c61945443a2045af3ff4c6d7a49d5d34688b46ec2c3b19f21a9b3  AtlasOverlay/AtlasOverlay.exe
87a546930fbbd96f183381526ec1277f137acd9d8417ee5e704b40b7681f8014  AtlasOverlay/AtlasOverlay.dll
```
