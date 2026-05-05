export type Team = "player" | "enemy";

export type BattlePhase = "selecting" | "moving";

export interface GridPosition {
  x: number;
  y: number;
}

export interface Tile extends GridPosition {
  walkable: boolean;
  cover: number;
  moveCost: number;
  blocksSight: boolean;
  occupiedBy: string | null;
}

export interface Unit {
  id: string;
  name: string;
  team: Team;
  hp: number;
  maxHp: number;
  actionPoints: number;
  maxActionPoints: number;
  movementPoints: number;
  maxMovementPoints: number;
  position: GridPosition;
  alive: boolean;
}

export type BattleResult = "ongoing" | "victory" | "defeat";
