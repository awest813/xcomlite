import type { CoverSides, GridPosition, TerrainType } from "../game/types";

export interface AuthoredTile extends GridPosition {
  terrain?: TerrainType;
  walkable?: boolean;
  cover?: number;
  coverSides?: Partial<CoverSides>;
  moveCost?: number;
  blocksSight?: boolean;
}

export const battleMapTiles: AuthoredTile[] = [
  { x: 0, y: 0, terrain: "rough", moveCost: 2 },
  { x: 1, y: 0, terrain: "rough", moveCost: 2 },
  { x: 8, y: 0, terrain: "rough", moveCost: 2 },
  { x: 9, y: 0, terrain: "rough", moveCost: 2 },
  { x: 0, y: 1, terrain: "rough", moveCost: 2 },
  { x: 9, y: 1, terrain: "rough", moveCost: 2 },

  { x: 4, y: 0, terrain: "road" },
  { x: 5, y: 0, terrain: "road" },
  { x: 4, y: 1, terrain: "road" },
  { x: 5, y: 1, terrain: "road" },
  { x: 4, y: 2, terrain: "road", cover: 1, coverSides: { north: 1, south: 1 }, moveCost: 2 },
  { x: 5, y: 2, terrain: "road", cover: 1, coverSides: { north: 1, south: 1 }, moveCost: 2 },
  { x: 4, y: 3, terrain: "road" },
  { x: 5, y: 3, terrain: "road" },
  { x: 4, y: 4, terrain: "road" },
  { x: 5, y: 4, terrain: "road" },
  { x: 4, y: 6, terrain: "road" },
  { x: 5, y: 6, terrain: "road" },
  { x: 4, y: 7, terrain: "road", cover: 1, coverSides: { north: 1, south: 1 }, moveCost: 2 },
  { x: 5, y: 7, terrain: "road", cover: 1, coverSides: { north: 1, south: 1 }, moveCost: 2 },
  { x: 4, y: 8, terrain: "road" },
  { x: 5, y: 8, terrain: "road" },
  { x: 4, y: 9, terrain: "road" },
  { x: 5, y: 9, terrain: "road" },

  { x: 3, y: 4, terrain: "floor", cover: 2, coverSides: { east: 2, south: 2 }, moveCost: 2, blocksSight: true },
  { x: 6, y: 4, terrain: "floor", cover: 2, coverSides: { west: 2, south: 2 }, moveCost: 2, blocksSight: true },
  { x: 4, y: 5, terrain: "obstacle", walkable: false, cover: 2, coverSides: { north: 2, east: 2, south: 2, west: 2 }, blocksSight: true },
  { x: 5, y: 5, terrain: "obstacle", walkable: false, cover: 2, coverSides: { north: 2, east: 2, south: 2, west: 2 }, blocksSight: true },
  { x: 2, y: 6, terrain: "floor", cover: 1, coverSides: { north: 1, east: 1 }, moveCost: 2 },
  { x: 7, y: 6, terrain: "floor", cover: 1, coverSides: { north: 1, west: 1 }, moveCost: 2 },

  { x: 0, y: 8, terrain: "rough", moveCost: 2 },
  { x: 1, y: 9, terrain: "rough", moveCost: 2 },
  { x: 8, y: 9, terrain: "rough", moveCost: 2 },
  { x: 9, y: 8, terrain: "rough", moveCost: 2 },
];
