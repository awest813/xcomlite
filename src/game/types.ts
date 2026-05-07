export type Team = "player" | "enemy";

export type BattlePhase = "selecting" | "moving" | "aiming";

export type MissionResult = "in_progress" | "victory" | "defeat";

export type MissionType = "eliminate" | "extract";

export type TerrainType = "floor" | "road" | "rough" | "obstacle";

export type CoverDirection = "north" | "east" | "south" | "west";

export type CoverSides = Record<CoverDirection, number>;

export interface GridPosition {
  x: number;
  y: number;
}

export interface Tile extends GridPosition {
  terrain: TerrainType;
  walkable: boolean;
  cover: number;
  coverSides: CoverSides;
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
  isOverwatch: boolean;
}
