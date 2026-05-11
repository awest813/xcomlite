Original prompt: We are working in this repo: awest813/xcomlite. It is currently a Babylon.js + Vite + TypeScript template. Goal: Convert the template into the first playable foundation for an XCOM-like browser tactics game. Important: Do not add React yet. Do not add shooting yet. Do not add campaign systems yet. Do not add external game assets. Keep it simple, clean, and working.

## Phase 1

- Replaced the Babylon shader demo with a 10x10 tactical grid, player/enemy placeholder units, selection, move highlighting, movement, and an End Turn HUD.
- `npm run build` passes.

## Phase 2 Plan

- Add a deterministic enemy movement turn so End Turn has visible tactical consequences without adding shooting.
- Add lightweight browser test hooks for inspecting game state.
- Keep scope limited to movement/turn foundations.

## Phase 2 Progress

- Added a `TurnController` that watches for enemy turns and runs a delayed deterministic enemy movement pass.
- Added `window.render_game_to_text()` and `window.advanceTime(ms)` hooks for browser-game verification.
- Browser-game verification caught enemy positions leaking full tile fields after AI movement; normalized AI movement positions back to `{x, y}`.
- `npm run build` passes after Phase 2 changes.
- Playwright browser-game verification passed for initial render and End Turn enemy movement; screenshot showed enemy units advanced and HUD returned to Player turn.

## Next Suggestions

- Add authored cover/obstacle tiles in `src/data` and render simple cover blocks.
- Add path preview or step-by-step movement before introducing shooting.

## Phase 2 Terrain And Path Preview

- Started authored terrain in `src/data/BattleMap.ts` with half cover, full cover, and blocked obstacle tiles.
- Movement reachability now uses breadth-first neighbor walking so obstacles affect legal movement and preview paths.
- Tactical rendering now draws simple cover blocks and shows a yellow hover path preview for the selected unit.
- Exposed the current hover path in the debug payload to make browser verification less guessy.
- Browser verification showed Babylon pointer move events were not carrying useful pick info, so hover preview now performs an explicit `scene.pick(pointerX, pointerY)`.
- `npm run build` passes after terrain/path preview changes.
- Browser verification passed: cover blocks render, selected unit shows reachable BFS tiles, and hover path preview appears in yellow with matching `hoverPath` debug output.

## Phase 2 Movement Costs And Animation

- Added `src/game/Pathfinding.ts` so movement reachability, costs, and previous-tile path data live outside `BattleState`.
- Replaced `moveRange` with movement points while leaving action points available for later non-movement actions.
- Tiles now carry `moveCost` and `blocksSight` alongside walkability, cover, and occupancy.
- `BattleState` caches selected-unit movement data and invalidates it when selection or movement changes.
- Tactical rendering now previews actual paths and animates units tile-by-tile while gameplay state remains authoritative.
- `npm run build` passes after movement-cost and animation changes.
- Browser verification passed: selecting a player unit shows path data, clicking a reachable tile moves it, AP stays unchanged, and MP is reduced by path cost.

## Phase 3 Tactical Readability

- Added terrain identity (`floor`, `road`, `rough`, `obstacle`) so authored map data can drive both movement and rendering.
- Expanded the battle map into a clearer lane-and-cover encounter with road strips, rough edges, half-cover, full-cover, and blocked center obstacles.
- Upgraded unit placeholders with team bases, heads, selection rings, and HP bars while keeping everything Babylon primitive-based.
- Added path step pips on hover so planned movement reads as a route instead of only highlighted tiles.
- Reworked the HUD into a compact command panel with a player roster, selected soldier stats, hover tile intel, basic orders text, and End Turn.
- Expanded `render_game_to_text()` to expose terrain type and full unit resources for browser verification.
- `npm run build` passes after tactical readability changes.
- Browser verification passed: no console errors, unit selection and movement still work, visuals show roster, cover, terrain lanes, HP bars, selection ring, and path feedback.

## Phase 4 Line Of Sight Preview

- Added `src/game/LineOfSight.ts` with grid-line sight checks against `blocksSight` tiles.
- `BattleState` now exposes a selected-unit preview origin: the selected soldier's current tile, or the hovered reachable tile when planning movement.
- Tactical rendering now draws sightlines from the preview origin to enemies and marks visible enemies with orange rings.
- The HUD now lists currently visible enemies from the current or previewed position.
- `render_game_to_text()` now includes `previewOrigin` and `sightlines` so tests can verify visibility without relying only on pixels.
- `npm run build` passes after line-of-sight preview changes.
- Browser verification passed: selecting Specialist shows Trooper visible, hovering a move tile updates preview origin and visible enemies to Scout/Guard, movement preserves the previewed sight state.

## Next Suggestions

- Keep shooting out one more beat and add cover-side data first, so aim previews can tell whether a target has no/half/full cover from a shooter.
- Add enemy hover cards or small labels above units once shooting is introduced.

## Phase 5 Directional Cover Preview

- Used Godot tactical RPG movement guidance as an architecture check: keep grid legality/metadata separate from rendering and drive UI from selected/hovered state.
- Added `CoverDirection` and `coverSides` metadata so tiles can express directional half/full cover instead of only a tile-level cover summary.
- Authored directional cover on road barriers, central full cover, obstacles, and flank cover.
- `BattleState` now calculates target previews from the selected/hovered origin, including target-facing cover direction, cover amount, and flanked state.
- Tactical rendering now places cover blocks on their protected tile edges and colors enemy target rings red when visible/flanked.
- HUD sight preview now labels visible targets as flanked, half cover, or full cover.
- `render_game_to_text()` now includes `targetPreviews` and tile `coverSides` for verification.
- `npm run build` passes after directional cover changes.
- Browser verification passed: selected/hovered previews identify visible enemies as flanked, sightlines remain correct, and the map reads with side-oriented cover.

## Next Suggestions

- Add the smallest possible shooting action with AP cost, hit chance, and HP reduction.

## XCOM-Aligned Gameplay Roadmap

Guiding rule: build the tactical combat loop first. Delay campaign, base management, inventory, soldier progression, procedural generation, and external art until the battlefield is fun and readable.

### Phase 6 Aim Preview

- Status: implemented.
- Clicking a visible enemy enters non-damaging aim mode.
- HUD shows selected shooter, target, line of sight, target cover, flanked state, range band, and hit chance.
- This is preview-only: no damage, no ammo, no overwatch, no abilities yet.
- Debug state exposes `selectedTargetUnitId` and `aimPreview` so browser tests can verify target, hit chance, cover, and visibility.

### Phase 7 Basic Shooting

- Add the smallest possible attack action: consume AP, roll hit chance, reduce HP on hit, remove dead units.
- Use deterministic/random-seeded rolls for testability if possible.
- Keep weapons simple: one default rifle profile for all units.
- Do not add crits, suppression, grenades, ammo, reload, perks, or animation polish yet.

### Phase 8 Enemy Combat Turn

- Upgrade enemy AI from movement-only to simple XCOM-like priorities:
  - Shoot a visible flanked player.
  - Shoot a visible player in cover if no flank is available.
  - Move to a reachable tile that improves visibility or cover.
  - End turn.
- Keep enemy turns deterministic enough for browser verification.

### Phase 9 Overwatch And Reaction

- Add Overwatch as the first reaction system after basic shooting is stable.
- Units can spend remaining AP to enter Overwatch.
- Moving through enemy sight can trigger one reaction shot.
- Keep interrupts simple: trigger at most once per moving unit per enemy.

### Phase 10 Mission Objective

- Add a tiny mission objective so combat has shape:
  - Eliminate all enemies, or
  - Reach/extract from a marked tile.
- Add win/loss state to `BattleState` and HUD.
- Add restart/reset debug hook for repeated tests.

### Phase 11 Tactical Polish

- Add unit labels/hover cards.
- Add action buttons for Move, Fire, Overwatch, End Turn.
- Add shot/impact animations using primitives only.
- Improve camera constraints and optional keyboard shortcuts.

### Explicitly Later

- Campaign layer, research, base building, geoscape, soldier classes, perks, inventory, weapon variety, procedural maps, fog of war, destructible terrain, multi-level buildings, and external assets.

## Phase 6 Aim Preview Progress

- Added `AimPreview` state to `BattleState` with shooter, target, line-of-sight visibility, target cover, flanked state, range band, and hit chance.
- Clicking a visible enemy now enters `aiming` phase and selects that target without consuming AP or changing HP.
- Hovering a move tile clears aim preview and returns to movement planning.
- HUD now shows a gold aim card such as `Aim Trooper | 70% | (flanked) | Long range`.
- Tactical rendering highlights the aimed enemy ring separately from visible/flanked preview rings.
- `render_game_to_text()` now includes `selectedTargetUnitId` and `aimPreview`.
- `npm run build` passes after aim preview changes.
- Browser verification passed: selecting Specialist and clicking visible Trooper opens aim preview, AP/HP remain unchanged, and hovering a reachable tile cancels aim back to movement preview.

## Next Suggestions

- Implement Phase 7: basic shooting with AP cost, hit roll, HP reduction, and unit death/removal.
- Keep it deliberately small: one default rifle profile, no ammo, no crits, no perks, no reaction fire yet.

## Phase 7 Basic Shooting Progress

- Added a simple rifle shot action to `BattleState`: firing consumes 1 AP, rolls against the current aim preview, deals 3 damage on hit, and removes killed units from the unit list and tile occupancy.
- Shot rolls are deterministic for browser verification; the first two shots roll 18 and 55.
- HUD now includes a Fire button plus last-shot feedback showing hit/miss, damage, kills, and roll versus hit chance.
- Tactical rendering now disposes meshes and overlays for killed units so dead enemies disappear from the board.
- `render_game_to_text()` now includes `lastShotResult` for combat tests.
- `npm run build` passes after basic shooting changes.
- Browser verification passed: Specialist aimed at Trooper, fired twice, consumed AP, dealt 3 damage per hit, killed Trooper, removed Trooper from state and scene, and produced no console errors.

## Next Suggestions

- Implement Phase 8 enemy combat turn with the same basic rifle shot before adding overwatch.
- Add a small shot line/impact flash using Babylon primitives so firing reads visually, while keeping rules unchanged.

## Phase 8 Enemy Combat Turn Progress

- Upgraded enemy AI from movement-only to XCOM-like priorities: shoot visible flanked targets first, then visible targets in cover, then move to better position.
- Enemies now consume AP to shoot at player units with the same rifle profile, hit chance calculation, and damage as player shots.
- Added shot line and impact flash visual effects: yellow shot lines from shooter to target, red hit spheres or gray miss spheres that fade over 600ms.
- Shot events are drained from BattleState and rendered by TacticalScene with animated fade-out.
- `npm run build` passes after enemy combat turn changes.
- Browser verification passed: enemy units shoot at visible player units, deal damage, and remove killed units from the board.

## Phase 9 Overwatch Progress

- Added `isOverwatch` state to units and `enterOverwatch()` action to BattleState.
- Units can spend 1 AP to enter overwatch; overwatch units fire at the first enemy they see moving through their sight line.
- Overwatch shots suffer a -20% hit chance penalty and consume the overwatch state.
- Overwatch is cleared for the acting team when their turn ends.
- Added overwatch button to HUD and green cone marker on overwatch units in the scene.
- Added keyboard shortcut: `O` for overwatch.
- `npm run build` passes after overwatch changes.

## Phase 10 Mission Objective Progress

- Added `MissionResult` type (`in_progress`, `victory`, `defeat`) and `MissionType` (`eliminate`, `extract`).
- BattleState tracks mission result and checks for win/loss after each turn.
- Victory: eliminate all enemies (or reach extract zone in extract mode).
- Defeat: all player units killed.
- Added extract zone visual marker (blue tile) at position 9,9.
- Added restart button and `restartMission()` method to reset the battle state.
- HUD displays victory/defeat message with colored text when mission ends.
- `npm run build` passes after mission objective changes.

## Phase 11 Tactical Polish Progress

- Added keyboard shortcuts: `E` for end turn, `F` for fire, `O` for overwatch, `1/2/3` for unit selection, `R` for restart.
- Added theme toggle button to switch between XCOM and Shadowrun Hong Kong themes.
- Theme system changes unit names, enemy types, and mission briefing.
- Default theme is Shadowrun Hong Kong (Street Samurai, Decker, Shaman vs Corp Sec, Lone Star, Triad).
- `npm run build` passes after tactical polish changes.

## XCOM/Shadowrun Hong Kong Framework Summary

The tactical combat framework now supports:

### Core Gameplay
- Grid-based movement with BFS pathfinding and movement costs
- Directional cover system (half/full/flanked)
- Line of sight with Bresenham line algorithm
- Aim preview with hit chance calculation
- Basic shooting with deterministic rolls
- Enemy AI with shoot/move priorities
- Overwatch reaction fire
- Mission objectives (eliminate/extract) with win/loss states
- Restart functionality

### Visual Features
- Terrain rendering (floor, road, rough, obstacle)
- Cover blocks on tile edges
- Unit placeholders with team colors, heads, selection rings, HP bars
- Movement path preview with step pips
- Sightline visualization
- Enemy visibility rings (visible/flanked/aimed/hidden)
- Shot line and impact flash effects
- Overwatch cone markers
- Extract zone marker

### UI Features
- Compact HUD with team label, selected unit stats, roster, tile intel, sight/aim/shot feedback
- Fire, Overwatch, End Turn, Restart buttons
- Theme toggle (XCOM / Shadowrun Hong Kong)
- Keyboard shortcuts for all major actions

### Architecture
- Clean separation: game state (BattleState), rendering (TacticalScene), UI (Hud), data (BattleMap, Units)
- Event-driven updates via subscriber pattern
- Debug hooks for browser verification
- TypeScript throughout with Babylon.js for 3D rendering
- Vite build system

## Phase 12 Authored Objectives Progress

- Added map-authored objective metadata so deployments can be either eliminate or extract missions.
- Converted Void Rift into an extract scenario with an authored extraction beacon while keeping the other maps as eliminate missions.
- BattleState now initializes and restarts mission type/extract zone from the selected map and only grants eliminate victory for eliminate missions.
- HUD and `render_game_to_text()` expose the active objective for player readability and browser verification.

## Phase 13 Turn Counter, Kill Tracking, Enemy Grenades, Suppression Visual

- Added `turnNumber` to `BattleState`: starts at 1, increments each time the player ends their turn, resets to 1 on restart.
- HUD turn strip now displays the current turn number (e.g. "Turn 3 — Your move, Commander").
- Added `kills` field to `Unit` (initialized to 0): incremented in `executeShot` whenever `killed` is true, and for grenade kills in the new enemy grenade AI.
- Kill count shown in the operator stats panel ("Kills" row), squad roster unit stats line, and on the 3D unit nameplate role line (e.g. "Assault · Heavy Cannon · 2K").
- Mission end score banner now includes turns taken, total kills, per-soldier kill breakdown, and a survivor count (or "No survivors" on defeat).
- Enemy grenade AI: when an enemy has a grenade ability with remaining uses and 2 or more player units are visible within the grenade radius of a single anchor tile, the enemy throws the grenade instead of shooting. Grenade kills are credited to the throwing enemy.
- Suppression visual: suppressed units display an orange torus ring at their base AND an orange emissive body tint that composites with the low-HP red tint (both effects can show simultaneously).
- `render_game_to_text()` debug hook now includes `turnNumber` and per-unit `kills`.
- `npm run build` passes after Phase 13 changes.

## Phase 14 Babylon Assets, Audit, and Polish

### Babylon Assets Added
- **`GlowLayer`** (`@babylonjs/core`): All emissive materials (selection rings, path step pips, enemy sight rings, overwatch cones, suppression rings, extract zone tile, shot lines) now produce a visible glow halo in the 3D scene (`intensity = 0.48`, `blurKernelSize = 32`).
- **`DefaultRenderingPipeline`** with bloom, chromatic aberration, and vignette: Bloom threshold 0.38 / weight 0.36 makes bright emissive areas bleed light into surrounding pixels, giving the battlefield a neon sci-fi atmosphere. Subtle chromatic aberration (1.8 px) and edge vignette add cinematic depth.
- **`PointLight`** over the extract zone beacon: When the mission has an extract zone, a blue-tinted `PointLight` (range 5) illuminates the surrounding tiles. Its intensity pulses sinusoidally in the `update()` loop (0.9–1.8), giving the beacon a living, breathing quality.

### Audit Fixes
- **Static mesh leak on map switch**: Road stripe meshes, cover block meshes (per-direction and legacy), the extract zone tile mesh, and the starfield mesh were created but never tracked and therefore never disposed when `dispose()` was called between map loads. All are now pushed into a `staticMeshes: Mesh[]` array and disposed in `dispose()`.
- **Untracked scene light**: The `HemisphericLight` was assigned to a local variable and lost. It is now stored in `this.sceneLight` and disposed on `dispose()`.
- **Untracked extract zone point light**: Stored in `this.extractZoneLight` and disposed on `dispose()`.
- **Untracked post-processing pipeline**: `DefaultRenderingPipeline` stored in `this.renderingPipeline` and disposed on `dispose()`.
- **Untracked glow layer**: `GlowLayer` stored in `this.glowLayer` and disposed on `dispose()`.

### Polish
- **Overwatch cone rotation**: Active overwatch markers rotate slowly (0.9 rad/s) in the `update()` loop, making it visually clear a unit is in an active watch state.
- **Extract zone beacon pulse**: The `PointLight` over the extraction point sinusoidally pulses its intensity each frame, reinforcing the extraction tile as a live tactical objective.
- **Boosted emissive values**: Selection rings, path markers, enemy sight rings, and aimed target rings have slightly stronger emissive colors so the new `GlowLayer` produces a clearly visible halo without being overwhelming.
- **Pipeline resilience**: The `DefaultRenderingPipeline` setup is wrapped in `try/catch` so the game continues gracefully if the pipeline is unavailable (e.g., WebGL1 fallback).
- `npm run build` passes after Phase 14 changes.

## Phase 15 Ally Ability Targeting (Medkit) Progress

- Added `selectedAbilityTargetUnitId` to `BattleState` so ability-target selections are explicit and debuggable.
- Clicking an ally while in `ability_select` now sets medkit target instead of switching unit selection.
- Medkit now uses the selected ally target, enforces range 3, and gives feedback for invalid/full-health targets.
- HUD now reflects medkit targeting flow (`Use Medkit → <ally>`) and disables the action until a valid injured ally is selected.
- `render_game_to_text()` now includes `selectedAbilityType` and `selectedAbilityTargetUnitId` for browser verification.

## Phase 16 Gameplay Fixes

### Suppression Bug (Critical Fix)
- **Root cause**: `enterSuppression()` applied `isSuppressed = true` to the *acting player unit* instead of a target enemy. This meant the orange suppression ring appeared on the player's own soldier, and the -30% accuracy penalty applied to the player, not the enemy.
- **Fix**: Suppression now enters `ability_select` phase (like Medkit). The player clicks a visible enemy to select them as the suppression target, then confirms via the "Suppress → <name>" button. Added `suppressEnemy(targetUnitId)` with LoS validation, enemy-only target check, and already-suppressed guard.
- **Timing fix**: `endTurn()` was clearing enemy suppression *before* their turn, so enemies never suffered the accuracy penalty. Removed the `clearSuppression` call from `endTurn()`. Enemy suppression is now cleared at the end of the enemy turn in `runEnemyTurn()`.
- **Suppression fire removed**: The `triggerOverwatchShots` function previously included suppressed units firing at movers, which was semantically backwards. Removed; overwatch fire is now the only reaction shot system.
- **Constant renamed**: `SUPPRESSION_HIT_PENALTY` → `SUPPRESSION_ACCURACY_PENALTY` and wired into `calculateHitChance` to reduce suppressed enemies' hit chance by 30%.

### Shot Roll Randomization
- `rollShot()` previously used a deterministic sequence `((counter * 37 + 17) % 100) + 1` making every game play out identically. Changed to `Math.random()` for genuine tactical variance. The unused `shotCounter` field was removed.

### HUD and Interaction Updates
- Orders text for suppression targeting: "Click a visible enemy to suppress them (−30% accuracy this turn). Esc cancels."
- `renderAbilityButtons()` shows "Suppress → <name>" confirm button with disabled state when target is already suppressed or invalid.
- Hover hint over enemies now reads "Click to select as suppression target." during suppression mode.
- `handlePickedMesh` in TacticalScene routes enemy clicks to `selectAbilityTarget` during suppression `ability_select` phase.
- `npm run build` passes after Phase 16 changes.
