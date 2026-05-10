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
    const sightlines = battleState.getSightlinesForSelectedUnit();

    return JSON.stringify({
      coordinateSystem: "grid origin is top-left; x increases right; y increases down",
      currentTeam: battleState.currentTeam,
      phase: battleState.phase,
      selectedUnitId: battleState.selectedUnitId,
      selectedTargetUnitId: battleState.selectedTargetUnitId,
      hoveredTile:
        battleState.hoveredTile === undefined
          ? null
          : {
              x: battleState.hoveredTile.x,
              y: battleState.hoveredTile.y,
              terrain: battleState.hoveredTile.terrain,
              cover: battleState.hoveredTile.cover,
              moveCost: battleState.hoveredTile.moveCost,
              pathCost: battleState.getPathCostForSelectedUnit(battleState.hoveredTile),
            },
      hoveredUnitId: battleState.hoveredUnitId,
      previewOrigin: battleState.getPreviewOriginForSelectedUnit() ?? null,
      sightlines,
      targetPreviews: battleState.getTargetPreviewsForSelectedUnit(),
      aimPreview: battleState.aimPreview,
      lastShotResult: battleState.lastShotResult,
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
              weaponAmmo: selectedUnit.weapon.ammo,
              weaponClip: selectedUnit.weapon.clipSize,
              inventory: selectedUnit.inventory.map((item) => ({
                id: item.id,
                name: item.name,
                category: item.category,
                quantity: item.quantity,
                maxQuantity: item.maxQuantity,
                linkedAbility: item.linkedAbility,
              })),
            },
      units: battleState.units.map((unit) => ({
        id: unit.id,
        name: unit.name,
        team: unit.team,
        hp: unit.hp,
        maxHp: unit.maxHp,
        actionPoints: unit.actionPoints,
        maxActionPoints: unit.maxActionPoints,
        movementPoints: unit.movementPoints,
        maxMovementPoints: unit.maxMovementPoints,
        position: unit.position,
        weaponAmmo: unit.weapon.ammo,
        weaponClip: unit.weapon.clipSize,
        inventory: unit.inventory.map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          maxQuantity: item.maxQuantity,
          linkedAbility: item.linkedAbility,
        })),
      })),
      terrain: battleState.grid
        .filter((tile) => tile.terrain !== "floor" || !tile.walkable || tile.cover > 0 || tile.moveCost > 1)
        .map((tile) => ({
          x: tile.x,
          y: tile.y,
          terrain: tile.terrain,
          walkable: tile.walkable,
          cover: tile.cover,
          coverSides: tile.coverSides,
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
