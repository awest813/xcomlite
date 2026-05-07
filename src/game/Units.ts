import { shadowrunTheme, type ThemeConfig } from "../data/BattleMap";
import type { Unit } from "./types";

let currentTheme: ThemeConfig = shadowrunTheme;

export function setTheme(theme: ThemeConfig): void {
  currentTheme = theme;
}

export function createPlayerUnits(): Unit[] {
  return [
    createUnit("player-1", currentTheme.playerUnitNames[0], "player", 1, 1),
    createUnit("player-2", currentTheme.playerUnitNames[1], "player", 2, 2),
    createUnit("player-3", currentTheme.playerUnitNames[2], "player", 1, 3),
  ];
}

export function createEnemyUnits(): Unit[] {
  return [
    createUnit("enemy-1", currentTheme.enemyUnitNames[0], "enemy", 8, 6),
    createUnit("enemy-2", currentTheme.enemyUnitNames[1], "enemy", 7, 7),
    createUnit("enemy-3", currentTheme.enemyUnitNames[2], "enemy", 8, 8),
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
    isOverwatch: false,
  };
}
