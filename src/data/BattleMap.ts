import type { GridPosition } from "../game/types";

export interface AuthoredTile extends GridPosition {
  walkable?: boolean;
  cover?: number;
  moveCost?: number;
  blocksSight?: boolean;
}

export const battleMapTiles: AuthoredTile[] = [
  { x: 4, y: 2, cover: 1, moveCost: 2 },
  { x: 5, y: 2, cover: 1, moveCost: 2 },
  { x: 3, y: 4, cover: 2, moveCost: 2, blocksSight: true },
  { x: 6, y: 4, cover: 2, moveCost: 2, blocksSight: true },
  { x: 4, y: 5, walkable: false, cover: 2, blocksSight: true },
  { x: 5, y: 5, walkable: false, cover: 2, blocksSight: true },
  { x: 2, y: 6, cover: 1, moveCost: 2 },
  { x: 7, y: 6, cover: 1, moveCost: 2 },
  { x: 4, y: 7, cover: 1, moveCost: 2 },
  { x: 5, y: 7, cover: 1, moveCost: 2 },
];
