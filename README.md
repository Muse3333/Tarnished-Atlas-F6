# Tarnished Atlas for Elden Ring

A Windows x64 offline mod with a read-only quest journal and an interactive map. The DLL starts the companion window that displays the overlay.

See the [build instructions](Source/BUILD.md) and [release verification notes](REVIEW.md) for the Windows x64 build.

## Update an existing installation

Close Elden Ring. Replace `AtlasOverlay.exe` inside your installed `AtlasOverlay` folder with the one from this ZIP. Start the game with your existing launcher. Press **F6** to open the full-screen overlay with **Quests**, **Map**, and the interactive minimap.

## Install and open

1. Extract the ZIP. Copy the whole `AtlasOverlay` folder beside your offline mod loader’s Elden Ring launcher. Keep `AtlasOverlay.dll` and `AtlasOverlay.exe` together.
2. Tell your offline mod loader to load `AtlasOverlay.dll`. For Mod Engine 2, edit the existing `external_dlls` list under `[modengine]` in `config_eldenring.toml`. Keep any entries you already use. An otherwise empty list looks like this.

   ```toml
   external_dlls = ["AtlasOverlay\\AtlasOverlay.dll"]
   ```

3. Launch Elden Ring using your offline mod loader and set **Screen Mode** to **Borderless Windowed** or **Windowed**. The circular minimap appears in the upper-right corner. Press **F6** to open the overlay over the entire game window. Press **F6** again or **Esc** to return to the game.

The companion window uses the Microsoft Edge WebView2 Runtime. Most Windows 10 and 11 systems already have it. If it's missing, install the [Evergreen Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/). The Lands Between map needs internet access to load Map Genie tiles. The Realm of Shadow landmark chart and save decoding run locally.

For an existing Elden Mod Loader setup, copy both `AtlasOverlay.dll` and `AtlasOverlay.exe` directly into `ELDEN RING\Game\mods`. Launch `eldenring.exe` using your offline mod setup.

## Pin quests and explore

1. Open **Quests**, then choose **Lands Between** for the 46 base-game entries or **Shadow of the Erdtree** for the 15 DLC entries. Each tab has its own list and remembers the quest you last opened while the overlay is running.
2. Use **All quests**, **Not started**, **In progress**, and **Completed** to filter the active character’s journal. **Pinned** shows quests you are following.
3. Select **Pin quest** to put one numbered marker at its current objective on both maps. Select **Pin quest giver** to mark where the quest starts. You can pin several quests and givers at the same time.
4. Open **Map**. **4** is quest 4’s current objective. The number moves as you finish objectives and clears when the route ends. **!** marks an unpinned quest at its giver before you start or at its current objective once you make progress. **◆4** is a separately pinned quest giver. Right-click overlapping markers to see every quest at that location.
5. Right-click a marker to **Pin quest**, **Unpin quest**, or open its **Current objective**. **Fit pins** frames tracked locations. **Fit world** resets the view.

The full map and minimap show available objectives on their current map layer. The minimap stays visible in the journal and keeps its own zoom. Scroll or use **+** and **−** to zoom. Drag to explore, then click **Follow** to recenter on your character. Closing the overlay resumes following automatically.

The edge arrow appears when a pinned quest’s next objective is off-screen on your current map layer. It reports straight-line distance. It uses the nearest pinned objective by default. Choose a particular pinned quest in **Minimap settings** to follow that quest’s next objective as it advances.

Right-click the full map to save a **custom waypoint**. Existing quest pins offer **Set waypoint here** in their menus. The waypoint takes priority over quest objectives until you click **Clear waypoint**. For another map layer, the arrow points to a known transfer when available. Route instructions appear on the minimap and full map. Check the full map for gate requirements, instructions to use an item, and routes that involve fast travel.

Open **F6 → Minimap settings** to save the in-game size, opacity, screen corner, default zoom, north marker, and arrow target. Press **F7** during play to hide or show the minimap for the current session.

**Show on map** opens the current objective. Each journal row has a **Map** button, and **Show all steps** plots the full quest route on the F6 map. **Show current pins** clears the route preview. The minimap continues to show current objectives. If the current objective has multiple possible locations, choose the location in the journal. A giver pin stays at the starting location until you remove it. Pin selections are saved across launches on this Windows profile.

Each quest has a description and a visible warning. Expand **Choices, requirements & spoilers** for important dialogue choices, missable encounters, prerequisite items and their sources, and rewards from different branches. **The Elden Throne** lists how to unlock and select each of the six base-game endings.

Use **Search quest names** to find a quest by its journal title. Use **Quests → Missable** to see alerts based on your current character’s save, including Rogier’s investigation, Seluvis’s charm, recruiting Latenna, the Volcano Manor contracts, and Goldmask’s Royal Capital step. The journal distinguishes an approaching deadline from one the save shows has passed. Alerts update after the game saves.

Use **Quests → Nearby** to list each unfinished quest’s next objective on your current map layer, nearest first. Distances are measured in a straight line.

Turn on **Spoiler-free journal** to see the current step and hide upcoming stages, quest outcomes, and detailed warnings. Use **Reveal step hint** or **Reveal full quest** when you want more information. The setting is saved, and a revealed quest stays open for the current session.

The **Ending planner** has a save-aware checklist for all six base-game endings. Choose an ending to reveal its route, open a linked quest, and check choices that could close the route. The planner shows tracked milestones from your last save and the journal’s manual checkmarks.

## Live player location

The blue arrow shows your character’s position and facing on the Lands Between and Underground maps. While following, the minimap puts the game camera’s facing direction at the top and smooths movement between live samples. It switches to north-up while you pan, read a marker popup, or play on a build where the camera heading is unavailable. Use **Find player** to jump to your position on the full map. At Roundtable Hold the minimap centers on the inset and shows the location name because the game provides no position on the inset’s floor plan. During loading or if the live reader cannot identify your game build, the quest map remains available and the arrow is hidden.

The reader uses read-only access to the running game in your offline mod session. Your location and save stay on your PC.

## Save-based checkboxes

The overlay reads the active character’s PC save when the minimap starts and checks for new saves while you play. When a saved flag or item confirms a milestone, the checkbox ticks and the same quest number moves to the next objective on both maps. Newly detected objectives show a quest update on the right, including for unpinned quests. On the first read or after switching characters, existing progress is loaded quietly. The overlay only reads your game save.

Guided optional encounters can appear as **Next objective · Optional**. When the save shows that an encounter is no longer available, the journal labels it **Skipped** and advances the pin. Alexander’s Gael Tunnel and Redmane Castle stops follow this rule.

All 46 quests have save rules covering 302 of 306 steps. Manual checks still cover Boc’s stops at Lake-Facing Cliffs, East Raya Lucaria Gate, and Altus Highway Junction, plus the “You’re Beautiful” conversation. A confirmed ending moves a quest to **Completed**. Earlier objectives bypassed by that ending can stay unticked. Where a scene has several possible locations or no separate map point, the journal labels the relevant grace, entrance, or encounter.

When there are several characters, use the **Character** dropdown or wait for an autosave that identifies the active slot. The overlay looks for `ER0000.sl2` and `ER0000.co2` in `%APPDATA%\EldenRing` and its account folders. For a launcher that stores its PC save elsewhere, add this line before the game launch command in your existing batch file, substituting your actual save path.

```bat
set "TARNISHED_ATLAS_SAVE=D:\YourFolder\ER0000.sl2"
```

## Verification

PC save fixtures exercise the quest reader. Tests cover saved quest stages, weapon filters, checklist states, history, marker placement, preferences, ending routes, and travel guidance. The Windows x64 build still needs a live in-game test.

## Weapons, checklist, and history

- **Weapons** lists base-game and DLC armaments. Filter by the strongest scaling attribute, affinity, game, and acquisition type. Compare up to three weapons at +0. Scaling is reported as raw coefficients. **Guide me there** marks a known encounter or nearby grace. Use the location note for the last part of the route.
- **Checklist** reads supported boss defeat flags and dungeon progress from the selected save. Each boss entry shows where to find it and whether it is a nighttime encounter. The location note gives an approach, a nearby Site of Grace, or an approximate direction and distance on the map. **Current region** uses nearby landmarks to estimate the region. Dungeons with tracked encounters show whether those bosses are cleared. Other dungeons can report discovery when a Site of Grace is known.
- **Quest history** records detected quest changes after the first observed save, by character and New Game cycle. It records new completions, steps made unavailable, and the resulting next objective. Atlas only sees save snapshots it reads while running. Follow the spoiler setting to control how much is shown.
- **Realm of Shadow** is available in the map selector. The offline chart plots Sites of Grace, quest pins, and waypoints. The minimap follows your live map layer. DLC steps are tracked using verified flags or first-journey item evidence where available. Other dialogue steps use manual checkmarks, saved by character and journey. Read **Missable** before advancing past major DLC deadlines.

## Sources

Map tiles and marker coordinates are from [Map Genie](https://mapgenie.io/elden-ring/maps/the-lands-between). Save evidence uses the bundled SaveForge-derived PC save reader and quest data, the [translated event flag table](https://raw.githubusercontent.com/Nordgaren/Erd-Tools/main/Documentation/Params/Params-Translated/Event%20Param%20Flags%20Translated.csv), and [Elden Ring Randomizer event references](https://github.com/thefifthmatt/eldenring-randomizer). The bundled source includes build instructions and license notices. Elden Ring belongs to FromSoftware and Bandai Namco.

Live map and camera fields reference [EROverlay](https://github.com/soarqin/EROverlay). The camera reader also references the FieldArea signature from [EldenRingTool](https://github.com/kh0nsu/EldenRingTool/blob/main/ERProcess.cs) and the camera matrix layout documented in [Minecraft-Ring](https://github.com/siddoff/Minecraft-Ring/blob/main/bridge-base/elden-ring/er-bridge/src/game.cpp). The tile translation was measured against native game map tiles and checked at landmarks from the [Elden Ring Compass data](https://github.com/EthanShoeDev/elden-ring-compass).

Quest notes were checked against the [Eldenpedia endings guide](https://eldenring.wiki.gg/wiki/Ending), its entries for [Seluvis’s Potion](https://eldenring.wiki.gg/wiki/Seluvis%27s_Potion), [Dung Eater](https://eldenring.wiki.gg/wiki/Dung_Eater), and [Miquella’s Needle](https://eldenring.wiki.gg/wiki/Miquella%27s_Needle), and the [Tarnished Forge quest index](https://tarnishedforge.com/quests). The missable alerts also reference [Seluvis](https://eldenring.wiki.gg/wiki/Preceptor_Seluvis), the [Volcano Manor letters](https://eldenring.wiki.gg/wiki/Letter_from_Volcano_Manor_(Old_Knight_Istvan)), and [Corhyn](https://eldenring.wiki.gg/wiki/Brother_Corhyn).

Travel guidance uses verified regional connections and landmark positions fitted to the Atlas map. [Eldenpedia sending gates](https://eldenring.wiki.gg/wiki/Waygate) · [Eldenpedia Deeproot Depths](https://eldenring.wiki.gg/wiki/Deeproot_Depths) · [Fextralife interactive map](https://eldenring.wiki.fextralife.com/Interactive_Map) · [Elden Ring Compass grace data](https://github.com/EthanShoeDev/elden-ring-compass)

Expansion sources include [Elden Ring Compass landmark coordinates](https://github.com/EthanShoeDev/elden-ring-compass), [community boss and quest flag research compiled by er-save-manager](https://github.com/Hapfel1/er-save-manager/tree/main/src/er_save_manager/data), and [PowerPyx’s DLC quest index](https://www.powerpyx.com/elden-ring-shadow-of-the-erdtree-dlc-all-side-quests/). The Realm of Shadow chart is drawn from landmark positions.

Nighttime boss locations and exceptions were checked against Eldenpedia’s [Night’s Cavalry](https://eldenring.wiki.gg/wiki/Night%27s_Cavalry), [Deathbird](https://eldenring.wiki.gg/wiki/Deathbird), [Death Rite Bird](https://eldenring.wiki.gg/wiki/Death_Rite_Bird), and [Bell Bearing Hunter](https://eldenring.wiki.gg/wiki/Bell_Bearing_Hunter) guides.
