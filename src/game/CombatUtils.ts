/**
 * Pure, stateless combat utility functions and shared constants.
 * Import from this module to avoid duplicating game-mechanics logic.
 */

import type { CoverDirection, GridPosition, StatusEffectData, Unit } from "./types";

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

export const SHOOT_ACTION_POINT_COST = 1;
export const RELOAD_ACTION_POINT_COST = 1;
export const GRENADE_DAMAGE = 4;
export const GRENADE_RADIUS = 2;
export const OVERWATCH_HIT_PENALTY = 20;
export const SMOKE_HIT_PENALTY = 25;
export const SUPPRESSION_ACCURACY_PENALTY = 30;

// ---------------------------------------------------------------------------
// Range
// ---------------------------------------------------------------------------

export type RangeBand = "close" | "normal" | "long";

export function getRangeBand(range: number): RangeBand {
  if (range <= 4) {
    return "close";
  }

  if (range <= 7) {
    return "normal";
  }

  return "long";
}

// ---------------------------------------------------------------------------
// Distance and direction
// ---------------------------------------------------------------------------

export function getManhattanDistance(from: GridPosition, to: GridPosition): number {
  return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
}

export function getCoverDirectionTowardAttacker(attacker: GridPosition, target: GridPosition): CoverDirection {
  const deltaX = attacker.x - target.x;
  const deltaY = attacker.y - target.y;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX < 0 ? "west" : "east";
  }

  return deltaY < 0 ? "north" : "south";
}

// ---------------------------------------------------------------------------
// Hit chance
// ---------------------------------------------------------------------------

export function calculateHitChance(
  cover: number,
  flanked: boolean,
  rangeBand: RangeBand,
  aimBonus: number = 0,
  isSuppressed: boolean = false,
  smokePenalty: number = 0
): number {
  const coverModifier = flanked ? 20 : cover === 1 ? -20 : cover >= 2 ? -40 : 0;
  const rangeModifier = rangeBand === "close" ? 10 : rangeBand === "long" ? -15 : 0;
  const suppressionModifier = isSuppressed ? -SUPPRESSION_ACCURACY_PENALTY : 0;
  return clamp(65 + coverModifier + rangeModifier + aimBonus + suppressionModifier - smokePenalty, 10, 95);
}

// ---------------------------------------------------------------------------
// Unit state helpers
// ---------------------------------------------------------------------------

export function hasStatusEffect(unit: Unit, type: StatusEffectData["type"]): boolean {
  return unit.statusEffects.some((effect) => effect.type === type);
}

export function isUnitIncapacitated(unit: Unit): boolean {
  return unit.isPanicked || hasStatusEffect(unit, "stunned");
}

export function getUnitActionLockMessage(unit: Unit): string {
  if (hasStatusEffect(unit, "stunned")) {
    return `${unit.name} is stunned and loses this turn.`;
  }

  if (unit.isPanicked) {
    return `${unit.name} is panicked and cannot act this turn.`;
  }

  return `${unit.name} cannot act right now.`;
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
