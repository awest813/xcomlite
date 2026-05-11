/**
 * Enemy AI manager.
 *
 * Handles all enemy decision-making during the enemy turn:
 * - Grenade usage when multiple targets are clustered
 * - Shooting the best visible target
 * - Reloading when out of ammo
 * - Moving to a better tactical position
 *
 * EnemyAI.run() is called by BattleState.runEnemyTurn() to execute the full
 * enemy action phase, after which BattleState handles turn cleanup.
 */

import { getTile } from "./Grid";
import { calculateSightline } from "./LineOfSight";
import { calculateMovement, tileKey } from "./Pathfinding";
import {
  calculateHitChance,
  getCoverDirectionTowardAttacker,
  getManhattanDistance,
  getRangeBand,
  GRENADE_DAMAGE,
  GRENADE_RADIUS,
  RELOAD_ACTION_POINT_COST,
  SHOOT_ACTION_POINT_COST,
  SMOKE_HIT_PENALTY,
} from "./CombatUtils";
import type { Sightline } from "./LineOfSight";
import type { GridPosition, Unit } from "./types";
import type { BattleState, TargetPreview } from "./BattleState";

// ---------------------------------------------------------------------------
// AI scoring constants
// ---------------------------------------------------------------------------

const MAX_ACTIONS_PER_ENEMY_TURN = 20;
const FLANKED_TARGET_SCORE_BONUS = 24;
const SMOKE_SHOT_SCORE_PENALTY = 8;
const COVER_POSITION_SCORE_MULTIPLIER = 12;
const SMOKE_POSITION_SCORE_BONUS = 8;
const VISIBLE_TARGET_POSITION_SCORE = 140;
const EXTRA_VISIBLE_TARGET_SCORE = 10;
const APPROACH_POSITION_SCORE = 40;
const APPROACH_DISTANCE_SCORE_MULTIPLIER = 6;

// ---------------------------------------------------------------------------
// Internal snapshot for loop-termination detection
// ---------------------------------------------------------------------------

interface EnemyActionSnapshot {
  positionKey: string;
  actionPoints: number;
  movementPoints: number;
  ammo: number;
  grenadeUses: number;
}

// ---------------------------------------------------------------------------
// EnemyAI
// ---------------------------------------------------------------------------

/**
 * Stateless-per-turn AI driver.  A fresh EnemyAI instance is created at the
 * start of each enemy turn and discarded when the turn ends.
 */
export class EnemyAI {
  constructor(private readonly state: BattleState) {}

  /** Execute all enemy actions for this turn. */
  run(): void {
    const { state } = this;
    if (state.currentTeam !== "enemy") {
      return;
    }

    // Snapshot the enemy list so units that die during the turn don't cause
    // iteration issues.
    const enemyUnits = state.units.filter((u) => u.team === "enemy");

    for (const enemy of enemyUnits) {
      if (!state.units.some((u) => u.id === enemy.id)) {
        continue;
      }

      if (enemy.statusEffects.some((e) => e.type === "stunned")) {
        continue;
      }

      let actionCount = 0;
      let missionEnded = false;

      while (enemy.actionPoints > 0 && actionCount < MAX_ACTIONS_PER_ENEMY_TURN) {
        if (!state.units.some((u) => u.id === enemy.id)) {
          break;
        }

        const snapshot = this.takeSnapshot(enemy);
        const result = this.runAction(enemy);

        if (result === "done") {
          missionEnded = true;
          break;
        }

        if (!state.units.some((u) => u.id === enemy.id)) {
          break;
        }

        if (!this.didStateChange(enemy, snapshot)) {
          break;
        }

        actionCount += 1;
      }

      if (missionEnded || !this.hasPlayerUnitsRemaining()) {
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Action selection
  // ---------------------------------------------------------------------------

  private runAction(enemy: Unit): "continue" | "done" {
    const playerUnits = this.state.units.filter((u) => u.team === "player");
    if (playerUnits.length === 0) {
      return "done";
    }

    const visibleTargets = this.getVisibleTargets(enemy, playerUnits);

    // Prefer grenade when 2+ players are within blast radius of a single tile.
    if (visibleTargets.length >= 2 && enemy.actionPoints >= SHOOT_ACTION_POINT_COST) {
      if (this.tryGrenadeThrow(enemy, playerUnits)) {
        return "continue";
      }
    }

    if (visibleTargets.length > 0 && enemy.actionPoints >= SHOOT_ACTION_POINT_COST) {
      if (enemy.weapon.ammo <= 0) {
        this.tryReload(enemy);
        return "continue";
      }

      const flankedTargets = visibleTargets.filter((t) => t.flanked);
      const target = flankedTargets.length > 0 ? flankedTargets[0] : visibleTargets[0];
      return this.shootAt(enemy, target);
    }

    if (enemy.actionPoints > 0) {
      this.moveToBetterPosition(enemy, playerUnits, visibleTargets);
    }

    return "continue";
  }

  // ---------------------------------------------------------------------------
  // Grenade
  // ---------------------------------------------------------------------------

  private tryGrenadeThrow(enemy: Unit, playerUnits: Unit[]): boolean {
    const grenadeAbility = enemy.abilities.find((a) => a.type === "grenade" && a.uses > 0);
    if (grenadeAbility === undefined || enemy.actionPoints < grenadeAbility.apCost) {
      return false;
    }

    // Pick the tile that catches the most visible players in the blast.
    const bestTarget = playerUnits
      .map((anchor) => ({
        position: anchor.position,
        count: playerUnits.filter(
          (p) => getManhattanDistance(anchor.position, p.position) <= GRENADE_RADIUS
        ).length,
      }))
      .filter((t) => t.count >= 2)
      .sort((a, b) => b.count - a.count)[0];

    if (bestTarget === undefined) {
      return false;
    }

    enemy.actionPoints -= grenadeAbility.apCost;
    grenadeAbility.uses -= 1;
    this.state.syncInventoryFromAbility(enemy, "grenade");

    const pos: GridPosition = {
      x: bestTarget.position.x,
      y: bestTarget.position.y,
      elevation: bestTarget.position.elevation,
    };
    const result = this.state.createExplosion(pos, GRENADE_RADIUS, GRENADE_DAMAGE);
    this.state.lastExplosionResult = result;
    this.state.addExplosionEvent({ position: pos, radius: GRENADE_RADIUS, damage: GRENADE_DAMAGE });

    for (const hit of result.unitsHit) {
      if (hit.killed) {
        enemy.kills += 1;
      }
    }

    this.state.notify();
    return true;
  }

  // ---------------------------------------------------------------------------
  // Visibility
  // ---------------------------------------------------------------------------

  private getVisibleTargets(enemy: Unit, playerUnits: Unit[]): TargetPreview[] {
    return this.getVisibleTargetsFromPosition(enemy.position, playerUnits);
  }

  private getVisibleTargetsFromPosition(fromPosition: GridPosition, playerUnits: Unit[]): TargetPreview[] {
    const grid = this.state.grid;

    return playerUnits
      .map((target) => {
        const sightline = calculateSightline(grid, fromPosition, target);
        if (!sightline.visible) {
          return null;
        }

        const coverDirection = getCoverDirectionTowardAttacker(fromPosition, target.position);
        const targetTile = getTile(grid, target.position);
        const cover = targetTile?.coverSides[coverDirection] ?? 0;

        return {
          targetUnitId: target.id,
          visible: true,
          coverDirection,
          cover,
          flanked: cover === 0,
          smokeObscured: this.isSightlineObscured(sightline),
        };
      })
      .filter((t): t is TargetPreview => t !== null);
  }

  // ---------------------------------------------------------------------------
  // Shooting
  // ---------------------------------------------------------------------------

  private tryReload(enemy: Unit): boolean {
    if (enemy.weapon.ammo >= enemy.weapon.clipSize) {
      return false;
    }

    if (enemy.actionPoints < RELOAD_ACTION_POINT_COST) {
      return false;
    }

    enemy.actionPoints -= RELOAD_ACTION_POINT_COST;
    enemy.weapon.ammo = enemy.weapon.clipSize;
    this.state.notify();
    return true;
  }

  private shootAt(enemy: Unit, target: TargetPreview): "continue" | "done" {
    const targetUnit = this.state.units.find((u) => u.id === target.targetUnitId);
    if (targetUnit === undefined) {
      return "continue";
    }

    if (enemy.weapon.ammo <= 0) {
      return "continue";
    }

    const range = getManhattanDistance(enemy.position, targetUnit.position);
    const hitChance = calculateHitChance(
      target.cover,
      target.flanked,
      getRangeBand(range),
      enemy.weapon.aimBonus,
      enemy.isSuppressed,
      target.smokeObscured ? SMOKE_HIT_PENALTY : 0
    );

    enemy.actionPoints -= SHOOT_ACTION_POINT_COST;
    enemy.weapon.ammo -= 1;

    // executeShot handles damage, panic, unit removal, shot events, and notification.
    this.state.executeShot(enemy, targetUnit, hitChance, enemy.weapon.damage);

    if (!this.hasPlayerUnitsRemaining()) {
      return "done";
    }

    return "continue";
  }

  // ---------------------------------------------------------------------------
  // Movement
  // ---------------------------------------------------------------------------

  private moveToBetterPosition(enemy: Unit, playerUnits: Unit[], visibleTargets: TargetPreview[]): boolean {
    if (playerUnits.length === 0) {
      return false;
    }

    // Don't move if there are visible targets we can still shoot at.
    if (visibleTargets.length > 0 && enemy.actionPoints >= SHOOT_ACTION_POINT_COST) {
      return false;
    }

    const movement = calculateMovement(this.state.grid, enemy);
    const currentScore = this.scorePosition(enemy, enemy.position, playerUnits);

    const bestTile = movement.reachableTiles
      .map((tile) => ({ tile, score: this.scorePosition(enemy, tile, playerUnits) }))
      .sort((a, b) => b.score - a.score)[0];

    if (bestTile === undefined || bestTile.score <= currentScore) {
      return false;
    }

    this.state.moveUnit(
      enemy,
      { x: bestTile.tile.x, y: bestTile.tile.y, elevation: bestTile.tile.elevation },
      true
    );
    return true;
  }

  // ---------------------------------------------------------------------------
  // Position scoring
  // ---------------------------------------------------------------------------

  private scorePosition(enemy: Unit, position: GridPosition, playerUnits: Unit[]): number {
    const tile = getTile(this.state.grid, position);
    const visibleTargets = this.getVisibleTargetsFromPosition(position, playerUnits);

    const bestShotScore = visibleTargets.reduce((best, target) => {
      const targetUnit = playerUnits.find((u) => u.id === target.targetUnitId);
      if (targetUnit === undefined) {
        return best;
      }

      const range = getManhattanDistance(position, targetUnit.position);
      const hitChance = calculateHitChance(
        target.cover,
        target.flanked,
        getRangeBand(range),
        enemy.weapon.aimBonus,
        enemy.isSuppressed,
        target.smokeObscured ? SMOKE_HIT_PENALTY : 0
      );
      const score =
        hitChance +
        (target.flanked ? FLANKED_TARGET_SCORE_BONUS : 0) -
        (target.smokeObscured ? SMOKE_SHOT_SCORE_PENALTY : 0);
      return Math.max(best, score);
    }, Number.NEGATIVE_INFINITY);

    const nearestDistance = playerUnits.reduce(
      (best, player) => Math.min(best, getManhattanDistance(position, player.position)),
      Number.POSITIVE_INFINITY
    );

    const moveTax = getManhattanDistance(enemy.position, position);
    const coverScore =
      (tile?.cover ?? 0) * COVER_POSITION_SCORE_MULTIPLIER +
      ((tile?.smokeTurns ?? 0) > 0 ? SMOKE_POSITION_SCORE_BONUS : 0);

    const visibilityScore =
      visibleTargets.length > 0
        ? VISIBLE_TARGET_POSITION_SCORE +
          bestShotScore +
          Math.min(visibleTargets.length, 2) * EXTRA_VISIBLE_TARGET_SCORE
        : Math.max(0, APPROACH_POSITION_SCORE - nearestDistance * APPROACH_DISTANCE_SCORE_MULTIPLIER);

    return visibilityScore + coverScore - moveTax;
  }

  // ---------------------------------------------------------------------------
  // Loop helpers
  // ---------------------------------------------------------------------------

  private takeSnapshot(enemy: Unit): EnemyActionSnapshot {
    const grenadeAbility = enemy.abilities.find((a) => a.type === "grenade");
    return {
      positionKey: tileKey(enemy.position),
      actionPoints: enemy.actionPoints,
      movementPoints: enemy.movementPoints,
      ammo: enemy.weapon.ammo,
      grenadeUses: grenadeAbility?.uses ?? 0,
    };
  }

  private didStateChange(enemy: Unit, before: EnemyActionSnapshot): boolean {
    const grenadeAbility = enemy.abilities.find((a) => a.type === "grenade");
    return (
      tileKey(enemy.position) !== before.positionKey ||
      enemy.actionPoints !== before.actionPoints ||
      enemy.movementPoints !== before.movementPoints ||
      enemy.weapon.ammo !== before.ammo ||
      (grenadeAbility?.uses ?? 0) !== before.grenadeUses
    );
  }

  private hasPlayerUnitsRemaining(): boolean {
    return this.state.units.some((u) => u.team === "player");
  }

  private isSightlineObscured(sightline: Sightline): boolean {
    return sightline.path.some(
      (pos, index) => index > 0 && (getTile(this.state.grid, pos)?.smokeTurns ?? 0) > 0
    );
  }
}
