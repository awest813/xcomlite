import { getTile } from "./Grid";
import type { GridPosition, Tile, Unit } from "./types";

export interface Sightline {
  targetUnitId: string;
  path: GridPosition[];
  visible: boolean;
  blockedAt: GridPosition | null;
}

export function calculateSightline(grid: Tile[], from: GridPosition, target: Unit): Sightline {
  const path = getLineCells(from, target.position);
  const blockers = path.slice(1, -1);
  const blockedTile = blockers
    .map((position) => getTile(grid, position))
    .find((tile) => tile?.blocksSight);

  return {
    targetUnitId: target.id,
    path,
    visible: blockedTile === undefined,
    blockedAt: blockedTile === undefined ? null : { x: blockedTile.x, y: blockedTile.y },
  };
}

function getLineCells(from: GridPosition, to: GridPosition): GridPosition[] {
  const cells: GridPosition[] = [];
  let x = from.x;
  let y = from.y;
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const stepX = from.x < to.x ? 1 : -1;
  const stepY = from.y < to.y ? 1 : -1;
  let error = dx - dy;

  while (true) {
    cells.push({ x, y });

    if (x === to.x && y === to.y) {
      break;
    }

    const doubleError = error * 2;
    if (doubleError > -dy) {
      error -= dy;
      x += stepX;
    }

    if (doubleError < dx) {
      error += dx;
      y += stepY;
    }
  }

  return cells;
}
