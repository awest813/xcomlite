import type { Unit } from "./types";

export function createPlayerUnits(): Unit[] {
  return [
    createUnit("player-1", "Ranger", "player", 1, 1),
    createUnit("player-2", "Specialist", "player", 2, 2),
    createUnit("player-3", "Grenadier", "player", 1, 3),
  ];
}

export function createEnemyUnits(): Unit[] {
  return [
    createUnit("enemy-1", "Trooper", "enemy", 8, 6),
    createUnit("enemy-2", "Scout", "enemy", 7, 7),
    createUnit("enemy-3", "Guard", "enemy", 8, 8),
  ];
}

function createUnit(id: string, name: string, team: Unit["team"], x: number, y: number): Unit {
  return {
    id,
    name,
    team,
    hp: 6,
    maxHp: 6,
    actionPoints: 2,
    maxActionPoints: 2,
    movementPoints: 6,
    maxMovementPoints: 6,
    position: { x, y },
    alive: true,
  };
}
