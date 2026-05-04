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
