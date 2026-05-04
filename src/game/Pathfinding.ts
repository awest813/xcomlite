import { getNeighbors, getTile, isWalkable } from "./Grid";
import type { GridPosition, Tile, Unit } from "./types";

export interface PathfindingResult {
  reachableTiles: Tile[];
  costByTile: Map<string, number>;
  previousByTile: Map<string, string>;
}

export function calculateMovement(grid: Tile[], unit: Unit): PathfindingResult {
  const startKey = tileKey(unit.position);
  const costByTile = new Map<string, number>([[startKey, 0]]);
  const previousByTile = new Map<string, string>();
  const openSet: GridPosition[] = [{ ...unit.position }];

  while (openSet.length > 0) {
    openSet.sort((a, b) => getCost(costByTile, a) - getCost(costByTile, b));
    const current = openSet.shift();
    if (current === undefined) {
      break;
    }

    const currentCost = getCost(costByTile, current);
    const currentTile = getTile(grid, current);
    if (currentTile === undefined) {
      continue;
    }

    getNeighbors(grid, currentTile).forEach((neighbor) => {
      if (!isWalkable(grid, neighbor)) {
        return;
      }

      const nextCost = currentCost + neighbor.moveCost;
      const neighborKey = tileKey(neighbor);
      const existingCost = costByTile.get(neighborKey);

      if (nextCost > unit.movementPoints || (existingCost !== undefined && existingCost <= nextCost)) {
        return;
      }

      costByTile.set(neighborKey, nextCost);
      previousByTile.set(neighborKey, tileKey(current));
      openSet.push({ x: neighbor.x, y: neighbor.y });
    });
  }

  const reachableTiles = [...costByTile.keys()].flatMap((key) => {
    if (key === startKey) {
      return [];
    }

    const tile = getTileFromKey(grid, key);
    return tile === undefined ? [] : [tile];
  });

  reachableTiles.sort((a, b) => getCost(costByTile, a) - getCost(costByTile, b));

  return {
    reachableTiles,
    costByTile,
    previousByTile,
  };
}

export function getPath(result: PathfindingResult, from: GridPosition, to: GridPosition): GridPosition[] {
  const startKey = tileKey(from);
  const destinationKey = tileKey(to);

  if (!result.costByTile.has(destinationKey) || destinationKey === startKey) {
    return [];
  }

  const path: GridPosition[] = [];
  let currentKey: string | undefined = destinationKey;

  while (currentKey !== undefined && currentKey !== startKey) {
    path.unshift(positionFromKey(currentKey));
    currentKey = result.previousByTile.get(currentKey);
  }

  return currentKey === startKey ? path : [];
}

export function tileKey(position: GridPosition): string {
  return `${position.x},${position.y}`;
}

function getCost(costByTile: Map<string, number>, position: GridPosition): number {
  return costByTile.get(tileKey(position)) ?? Number.POSITIVE_INFINITY;
}

function getTileFromKey(grid: Tile[], key: string): Tile | undefined {
  return getTile(grid, positionFromKey(key));
}

function positionFromKey(key: string): GridPosition {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}
