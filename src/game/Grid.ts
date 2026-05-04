import { battleMapTiles } from "../data/BattleMap";
import type { GridPosition, Tile } from "./types";

export const GRID_WIDTH = 10;
export const GRID_HEIGHT = 10;

export function buildGrid(width = GRID_WIDTH, height = GRID_HEIGHT): Tile[] {
  const tiles: Tile[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      tiles.push({
        x,
        y,
        walkable: true,
        cover: 0,
        moveCost: 1,
        blocksSight: false,
        occupiedBy: null,
      });
    }
  }

  battleMapTiles.forEach((authoredTile) => {
    const tile = getTile(tiles, authoredTile);
    if (tile !== undefined) {
      tile.walkable = authoredTile.walkable ?? tile.walkable;
      tile.cover = authoredTile.cover ?? tile.cover;
      tile.moveCost = authoredTile.moveCost ?? tile.moveCost;
      tile.blocksSight = authoredTile.blocksSight ?? tile.blocksSight;
    }
  });

  return tiles;
}

export function getTile(grid: Tile[], position: GridPosition): Tile | undefined {
  return grid.find((tile) => tile.x === position.x && tile.y === position.y);
}

export function isWalkable(grid: Tile[], position: GridPosition): boolean {
  const tile = getTile(grid, position);
  return Boolean(tile?.walkable && tile.occupiedBy === null);
}

export function getNeighbors(grid: Tile[], position: GridPosition): Tile[] {
  const candidates: GridPosition[] = [
    { x: position.x, y: position.y - 1 },
    { x: position.x + 1, y: position.y },
    { x: position.x, y: position.y + 1 },
    { x: position.x - 1, y: position.y },
  ];

  return candidates.flatMap((candidate) => {
    const tile = getTile(grid, candidate);
    return tile === undefined ? [] : [tile];
  });
}
