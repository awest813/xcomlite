import type { Scene } from "@babylonjs/core";
import type { BattleState } from "./BattleState";

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
    tactical_hover_path?: Array<{ x: number; y: number }>;
  }
}

export function installDebugHooks(battleState: BattleState, scene: Scene, update: (deltaMs: number) => void): void {
  window.render_game_to_text = () => {
    const selectedUnit = battleState.selectedUnit;
    const reachableTiles = selectedUnit === undefined ? [] : battleState.getReachableTiles(selectedUnit);

    return JSON.stringify({
      coordinateSystem: "grid origin is top-left; x increases right; y increases down",
      currentTeam: battleState.currentTeam,
      phase: battleState.phase,
      selectedUnitId: battleState.selectedUnitId,
      selectedUnit:
        selectedUnit === undefined
          ? null
          : {
              id: selectedUnit.id,
              name: selectedUnit.name,
              hp: selectedUnit.hp,
              maxHp: selectedUnit.maxHp,
              actionPoints: selectedUnit.actionPoints,
              maxActionPoints: selectedUnit.maxActionPoints,
              movementPoints: selectedUnit.movementPoints,
              maxMovementPoints: selectedUnit.maxMovementPoints,
              position: selectedUnit.position,
            },
      units: battleState.units.map((unit) => ({
        id: unit.id,
        team: unit.team,
        hp: unit.hp,
        actionPoints: unit.actionPoints,
        movementPoints: unit.movementPoints,
        position: unit.position,
      })),
      terrain: battleState.grid
        .filter((tile) => !tile.walkable || tile.cover > 0)
        .map((tile) => ({
          x: tile.x,
          y: tile.y,
          walkable: tile.walkable,
          cover: tile.cover,
          moveCost: tile.moveCost,
          blocksSight: tile.blocksSight,
        })),
      reachableTiles: reachableTiles.map((tile) => ({
        x: tile.x,
        y: tile.y,
        moveCost: tile.moveCost,
        pathCost: battleState.getPathCostForSelectedUnit(tile),
      })),
      hoverPath: window.tactical_hover_path ?? [],
    });
  };

  window.advanceTime = (ms: number) => {
    const frames = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let frame = 0; frame < frames; frame += 1) {
      update(1000 / 60);
      scene.render();
    }
  };
}
