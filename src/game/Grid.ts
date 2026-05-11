import type { MapLayout } from "../data/BattleMap";
import type { CoverSides, FogState, GridPosition, Tile } from "./types";

export const GRID_WIDTH = 10;
export const GRID_HEIGHT = 10;
export const MAX_CLIMBABLE_ELEVATION = 1;

export function buildGrid(layout: MapLayout): Tile[] {
  const { width, height, tiles: layoutTiles } = layout;
  const tiles: Tile[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      tiles.push({
        x,
        y,
        elevation: 0,
        terrain: "floor",
        walkable: true,
        cover: 0,
        coverSides: createEmptyCoverSides(),
        moveCost: 1,
        blocksSight: false,
        occupiedBy: null,
        destructible: false,
        smokeTurns: 0,
        fogState: "hidden" as FogState,
      });
    }
  }

  layoutTiles.forEach((authoredTile) => {
    const tile = getTile(tiles, { x: authoredTile.x, y: authoredTile.y, elevation: authoredTile.elevation ?? 0 });
    if (tile !== undefined) {
      tile.terrain = authoredTile.terrain ?? tile.terrain;
      tile.walkable = authoredTile.walkable ?? tile.walkable;
      tile.cover = authoredTile.cover ?? tile.cover;
      tile.coverSides = { ...tile.coverSides, ...authoredTile.coverSides };
      tile.moveCost = authoredTile.moveCost ?? tile.moveCost;
      tile.blocksSight = authoredTile.blocksSight ?? tile.blocksSight;
      tile.elevation = authoredTile.elevation ?? tile.elevation;
    }
  });

  return tiles;
}

function createEmptyCoverSides(): CoverSides {
  return {
    north: 0,
    east: 0,
    south: 0,
    west: 0,
  };
}

export function getTile(grid: Tile[], position: GridPosition): Tile | undefined {
  return grid.find((tile) => tile.x === position.x && tile.y === position.y);
}

export function isWalkable(grid: Tile[], position: GridPosition): boolean {
  const tile = getTile(grid, position);
  return Boolean(tile?.walkable && tile.occupiedBy === null);
}

export function isClimbable(from: Tile, to: Tile): boolean {
  const elevationDiff = Math.abs(to.elevation - from.elevation);
  return elevationDiff <= MAX_CLIMBABLE_ELEVATION;
}

export function getNeighbors(grid: Tile[], position: GridPosition): Tile[] {
  const candidates: GridPosition[] = [
    { x: position.x, y: position.y - 1, elevation: position.elevation },
    { x: position.x + 1, y: position.y, elevation: position.elevation },
    { x: position.x, y: position.y + 1, elevation: position.elevation },
    { x: position.x - 1, y: position.y, elevation: position.elevation },
  ];

  return candidates.flatMap((candidate) => {
    const tile = getTile(grid, candidate);
    return tile === undefined ? [] : [tile];
  });
}
