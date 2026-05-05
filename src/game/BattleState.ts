import { buildGrid, getNeighbors, getTile } from "./Grid";
import { hasLineOfSight } from "./LineOfSight";
import { calculateMovement, getPath, tileKey, type PathfindingResult } from "./Pathfinding";
import { createEnemyUnits, createPlayerUnits } from "./Units";
import type { BattlePhase, BattleResult, GridPosition, Team, Tile, Unit } from "./types";

type BattleStateListener = () => void;

export interface MovementEvent {
  unitId: string;
  path: GridPosition[];
}

export interface AttackEvent {
  attackerId: string;
  targetId: string;
  hit: boolean;
  damage: number;
  targetDied: boolean;
}

const ATTACK_RANGE = 7;
const BASE_HIT_CHANCE = 0.72;
const DISTANCE_PENALTY_PER_TILE = 0.05;
const DISTANCE_PENALTY_START = 4;

export class BattleState {
  readonly grid: Tile[];
  readonly units: Unit[];
  selectedUnitId: string | null = null;
  currentTeam: Team = "player";
  phase: BattlePhase = "selecting";

  private readonly listeners = new Set<BattleStateListener>();
  private selectedMovementCache: PathfindingResult | null = null;
  private readonly movementEvents: MovementEvent[] = [];
  private readonly attackEvents: AttackEvent[] = [];

  constructor() {
    this.grid = buildGrid();
    this.units = [...createPlayerUnits(), ...createEnemyUnits()];
    this.units.forEach((unit) => {
      const tile = getTile(this.grid, unit.position);
      if (tile !== undefined) {
        tile.occupiedBy = unit.id;
      }
    });
  }

  subscribe(listener: BattleStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get selectedUnit(): Unit | undefined {
    return this.selectedUnitId === null ? undefined : this.units.find((unit) => unit.id === this.selectedUnitId);
  }

  get aliveUnits(): Unit[] {
    return this.units.filter((unit) => unit.alive);
  }

  selectUnit(unitId: string): void {
    const unit = this.units.find((candidate) => candidate.id === unitId);
    if (unit === undefined || !unit.alive || unit.team !== "player" || this.currentTeam !== "player") {
      return;
    }

    this.selectedUnitId = unit.id;
    this.phase = "moving";
    this.refreshSelectedMovementCache();
    this.notify();
  }

  moveSelectedUnit(position: GridPosition): boolean {
    const unit = this.selectedUnit;
    if (unit === undefined || unit.team !== this.currentTeam) {
      return false;
    }

    return this.moveUnit(unit, position);
  }

  shootAtUnit(targetId: string): boolean {
    const attacker = this.selectedUnit;
    if (attacker === undefined || attacker.team !== "player" || this.currentTeam !== "player") {
      return false;
    }

    const target = this.units.find((u) => u.id === targetId);
    if (target === undefined || !target.alive || target.team === attacker.team) {
      return false;
    }

    if (!this.canShootAt(attacker, target)) {
      return false;
    }

    this.resolveAttack(attacker, target);
    this.notify();
    return true;
  }

  canShootAt(attacker: Unit, target: Unit): boolean {
    if (!attacker.alive || !target.alive || attacker.actionPoints <= 0) {
      return false;
    }
    if (getManhattanDistance(attacker.position, target.position) > ATTACK_RANGE) {
      return false;
    }
    return hasLineOfSight(this.grid, attacker.position, target.position);
  }

  getAttackableUnits(attacker: Unit): Unit[] {
    const opposingTeam: Team = attacker.team === "player" ? "enemy" : "player";
    return this.aliveUnits.filter(
      (unit) => unit.team === opposingTeam && this.canShootAt(attacker, unit)
    );
  }

  getBattleResult(): BattleResult {
    const hasLivingPlayers = this.aliveUnits.some((u) => u.team === "player");
    const hasLivingEnemies = this.aliveUnits.some((u) => u.team === "enemy");
    if (!hasLivingEnemies) return "victory";
    if (!hasLivingPlayers) return "defeat";
    return "ongoing";
  }

  endTurn(): void {
    if (this.getBattleResult() !== "ongoing") return;
    this.currentTeam = this.currentTeam === "player" ? "enemy" : "player";
    this.selectedUnitId = null;
    this.selectedMovementCache = null;
    this.phase = "selecting";
    this.resetActionPoints(this.currentTeam);
    this.resetMovementPoints(this.currentTeam);
    this.notify();
  }

  resetActionPoints(team: Team = this.currentTeam): void {
    this.units
      .filter((unit) => unit.team === team && unit.alive)
      .forEach((unit) => {
        unit.actionPoints = unit.maxActionPoints;
      });
  }

  resetMovementPoints(team: Team = this.currentTeam): void {
    this.units
      .filter((unit) => unit.team === team && unit.alive)
      .forEach((unit) => {
        unit.movementPoints = unit.maxMovementPoints;
      });
  }

  canMoveUnitTo(unit: Unit, position: GridPosition): boolean {
    return this.getPathForUnit(unit, position).length > 0;
  }

  getReachableTiles(unit: Unit): Tile[] {
    return this.getMovementForUnit(unit).reachableTiles;
  }

  getPathForSelectedUnit(position: GridPosition): GridPosition[] {
    const unit = this.selectedUnit;
    return unit === undefined ? [] : this.getPathForUnit(unit, position);
  }

  getPathCostForSelectedUnit(position: GridPosition): number | undefined {
    const unit = this.selectedUnit;
    if (unit === undefined) {
      return undefined;
    }

    return this.getMovementForUnit(unit).costByTile.get(tileKey(position));
  }

  drainMovementEvents(): MovementEvent[] {
    return this.movementEvents.splice(0);
  }

  drainAttackEvents(): AttackEvent[] {
    return this.attackEvents.splice(0);
  }

  runEnemyTurn(): void {
    if (this.currentTeam !== "enemy") {
      return;
    }

    this.aliveUnits
      .filter((unit) => unit.team === "enemy")
      .forEach((unit) => {
        // Shoot any player in range before moving
        const target = this.getAttackableUnits(unit)[0];
        if (target !== undefined) {
          while (unit.actionPoints > 0 && this.canShootAt(unit, target) && target.alive) {
            this.resolveAttack(unit, target);
          }
        } else {
          const nextPosition = this.getEnemyStep(unit);
          if (nextPosition !== undefined) {
            this.moveUnit(unit, nextPosition, false);
          }
        }
      });

    this.endTurn();
  }

  private resolveAttack(attacker: Unit, target: Unit): void {
    const distance = getManhattanDistance(attacker.position, target.position);
    const distancePenalty = Math.max(0, distance - DISTANCE_PENALTY_START) * DISTANCE_PENALTY_PER_TILE;
    const coverBonus = target.alive ? (getTile(this.grid, target.position)?.cover ?? 0) * 0.15 : 0;
    const hitChance = Math.min(0.95, Math.max(0.10, BASE_HIT_CHANCE - distancePenalty - coverBonus));

    const hit = Math.random() < hitChance;
    const damage = hit ? 3 : 0;

    attacker.actionPoints -= 1;

    if (hit) {
      target.hp = Math.max(0, target.hp - damage);
      if (target.hp <= 0) {
        target.alive = false;
        target.hp = 0;
        const tile = getTile(this.grid, target.position);
        if (tile !== undefined) tile.occupiedBy = null;
        if (this.selectedUnitId === target.id) {
          this.selectedUnitId = null;
          this.selectedMovementCache = null;
        }
      }
    }

    this.attackEvents.push({
      attackerId: attacker.id,
      targetId: target.id,
      hit,
      damage,
      targetDied: hit && target.hp <= 0,
    });
  }

  private moveUnit(unit: Unit, position: GridPosition, shouldNotify = true): boolean {
    if (unit.team !== this.currentTeam || unit.movementPoints <= 0 || !this.canMoveUnitTo(unit, position)) {
      return false;
    }

    const movement = this.getMovementForUnit(unit);
    const path = getPath(movement, unit.position, position);
    const movementCost = movement.costByTile.get(tileKey(position));
    const previousTile = getTile(this.grid, unit.position);
    const nextTile = getTile(this.grid, position);
    if (previousTile === undefined || nextTile === undefined || movementCost === undefined || path.length === 0) {
      return false;
    }

    previousTile.occupiedBy = null;
    nextTile.occupiedBy = unit.id;
    this.movementEvents.push({ unitId: unit.id, path: [{ ...unit.position }, ...path] });
    unit.position = { ...position };
    unit.movementPoints -= movementCost;
    this.refreshSelectedMovementCache();
    this.phase = unit.movementPoints > 0 ? "moving" : "selecting";

    if (shouldNotify) {
      this.notify();
    }

    return true;
  }

  private getEnemyStep(enemy: Unit): GridPosition | undefined {
    const playerUnits = this.aliveUnits.filter((unit) => unit.team === "player");
    const nearestPlayer = [...playerUnits].sort((a, b) => {
      return getManhattanDistance(enemy.position, a.position) - getManhattanDistance(enemy.position, b.position);
    })[0];

    if (nearestPlayer === undefined) {
      return undefined;
    }

    const nextTile = getNeighbors(this.grid, enemy.position)
      .filter((tile) => this.canMoveUnitTo(enemy, tile))
      .sort((a, b) => {
        return getManhattanDistance(a, nearestPlayer.position) - getManhattanDistance(b, nearestPlayer.position);
      })[0];

    return nextTile === undefined ? undefined : { x: nextTile.x, y: nextTile.y };
  }

  private getPathForUnit(unit: Unit, destination: GridPosition): GridPosition[] {
    return getPath(this.getMovementForUnit(unit), unit.position, destination);
  }

  private getMovementForUnit(unit: Unit): PathfindingResult {
    if (unit.id === this.selectedUnitId) {
      if (this.selectedMovementCache === null) {
        this.refreshSelectedMovementCache();
      }

      if (this.selectedMovementCache !== null) {
        return this.selectedMovementCache;
      }
    }

    return calculateMovement(this.grid, unit);
  }

  private refreshSelectedMovementCache(): void {
    const unit = this.selectedUnit;
    this.selectedMovementCache = unit === undefined ? null : calculateMovement(this.grid, unit);
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}

function getManhattanDistance(from: GridPosition, to: GridPosition): number {
  return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
}
