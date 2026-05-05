import { getTile } from "./Grid";
import type { GridPosition, Tile } from "./types";

export function hasLineOfSight(grid: Tile[], from: GridPosition, to: GridPosition): boolean {
  const points = bresenhamLine(from.x, from.y, to.x, to.y);
  for (let i = 1; i < points.length - 1; i++) {
    if (getTile(grid, points[i])?.blocksSight) {
      return false;
    }
  }
  return true;
}

function bresenhamLine(x0: number, y0: number, x1: number, y1: number): GridPosition[] {
  const points: GridPosition[] = [];
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let cx = x0;
  let cy = y0;

  while (true) {
    points.push({ x: cx, y: cy });
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }
  }

  return points;
}
