import { buildGrid, getNeighbors, getTile } from "./Grid";
import { calculateSightline, type Sightline } from "./LineOfSight";
import { calculateMovement, getPath, tileKey, type PathfindingResult } from "./Pathfinding";
import { createEnemyUnits, createPlayerUnits } from "./Units";
import type { BattlePhase, CoverDirection, GridPosition, Team, Tile, Unit } from "./types";

type BattleStateListener = () => void;

export interface MovementEvent {
  unitId: string;
  path: GridPosition[];
}

export interface TargetPreview {
  targetUnitId: string;
  visible: boolean;
  coverDirection: CoverDirection;
  cover: number;
  flanked: boolean;
}

export type RangeBand = "close" | "normal" | "long";

export interface AimPreview extends TargetPreview {
  shooterUnitId: string;
  targetName: string;
  range: number;
  rangeBand: RangeBand;
  hitChance: number;
}

export interface ShotResult {
  shooterUnitId: string;
  targetUnitId: string;
  targetName: string;
  hitChance: number;
  roll: number;
  hit: boolean;
  damage: number;
  killed: boolean;
  targetHp: number;
}

const SHOOT_ACTION_POINT_COST = 1;
const RIFLE_DAMAGE = 3;

export class BattleState {
  readonly grid: Tile[];
  readonly units: Unit[];
  selectedUnitId: string | null = null;
  selectedTargetUnitId: string | null = null;
  hoveredTilePosition: GridPosition | null = null;
  lastShotResult: ShotResult | null = null;
  currentTeam: Team = "player";
  phase: BattlePhase = "selecting";

  private readonly listeners = new Set<BattleStateListener>();
  private selectedMovementCache: PathfindingResult | null = null;
  private readonly movementEvents: MovementEvent[] = [];
  private shotCounter = 0;

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

  get hoveredTile(): Tile | undefined {
    return this.hoveredTilePosition === null ? undefined : getTile(this.grid, this.hoveredTilePosition);
  }

  get aimPreview(): AimPreview | null {
    const selectedUnit = this.selectedUnit;
    if (selectedUnit === undefined || this.selectedTargetUnitId === null) {
      return null;
    }

    return this.getAimPreviewForTarget(this.selectedTargetUnitId);
  }

  selectUnit(unitId: string): void {
    const unit = this.units.find((candidate) => candidate.id === unitId);
    if (unit === undefined || unit.team !== "player" || this.currentTeam !== "player") {
      return;
    }

    this.selectedUnitId = unit.id;
    this.selectedTargetUnitId = null;
    this.phase = "moving";
    this.refreshSelectedMovementCache();
    this.notify();
  }

  previewAimAtUnit(targetUnitId: string): boolean {
    const preview = this.getAimPreviewForTarget(targetUnitId);
    if (preview === null || !preview.visible) {
      return false;
    }

    this.selectedTargetUnitId = targetUnitId;
    this.hoveredTilePosition = null;
    this.phase = "aiming";
    this.notify();
    return true;
  }

  setHoveredTile(position: GridPosition | null): void {
    const currentKey = this.hoveredTilePosition === null ? null : tileKey(this.hoveredTilePosition);
    const nextKey = position === null ? null : tileKey(position);
    if (currentKey === nextKey) {
      return;
    }

    this.hoveredTilePosition = position === null ? null : { ...position };
    if (position !== null) {
      this.selectedTargetUnitId = null;
      if (this.selectedUnit !== undefined) {
        this.phase = "moving";
      }
    }
    this.notify();
  }

  moveSelectedUnit(position: GridPosition): boolean {
    const unit = this.selectedUnit;
    if (unit === undefined || unit.team !== this.currentTeam || unit.actionPoints <= 0) {
      return false;
    }

    return this.moveUnit(unit, position);
  }

  fireAtSelectedTarget(): ShotResult | null {
    const shooter = this.selectedUnit;
    const preview = this.aimPreview;
    if (
      shooter === undefined ||
      preview === null ||
      !preview.visible ||
      shooter.team !== this.currentTeam ||
      shooter.actionPoints < SHOOT_ACTION_POINT_COST
    ) {
      return null;
    }

    const target = this.units.find((unit) => unit.id === preview.targetUnitId);
    if (target === undefined) {
      return null;
    }

    shooter.actionPoints -= SHOOT_ACTION_POINT_COST;
    const roll = this.rollShot();
    const hit = roll <= preview.hitChance;
    const damage = hit ? RIFLE_DAMAGE : 0;

    if (hit) {
      target.hp = Math.max(0, target.hp - damage);
    }

    const result: ShotResult = {
      shooterUnitId: shooter.id,
      targetUnitId: target.id,
      targetName: target.name,
      hitChance: preview.hitChance,
      roll,
      hit,
      damage,
      killed: target.hp === 0,
      targetHp: target.hp,
    };

    if (result.killed) {
      this.removeUnit(target.id);
    }

    this.lastShotResult = result;
    this.selectedTargetUnitId = null;
    this.phase = shooter.actionPoints > 0 ? "moving" : "selecting";
    this.notify();
    return result;
  }

  endTurn(): void {
    this.currentTeam = this.currentTeam === "player" ? "enemy" : "player";
    this.selectedUnitId = null;
    this.selectedTargetUnitId = null;
    this.selectedMovementCache = null;
    this.hoveredTilePosition = null;
    this.phase = "selecting";
    this.resetActionPoints(this.currentTeam);
    this.resetMovementPoints(this.currentTeam);
    this.notify();
  }

  resetActionPoints(team: Team = this.currentTeam): void {
    this.units
      .filter((unit) => unit.team === team)
      .forEach((unit) => {
        unit.actionPoints = unit.maxActionPoints;
      });
  }

  resetMovementPoints(team: Team = this.currentTeam): void {
    this.units
      .filter((unit) => unit.team === team)
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

  getPreviewOriginForSelectedUnit(): GridPosition | undefined {
    const selectedUnit = this.selectedUnit;
    if (selectedUnit === undefined) {
      return undefined;
    }

    const hoveredTile = this.hoveredTile;
    if (hoveredTile !== undefined && this.getPathCostForSelectedUnit(hoveredTile) !== undefined) {
      return { x: hoveredTile.x, y: hoveredTile.y };
    }

    return { ...selectedUnit.position };
  }

  getSightlinesForSelectedUnit(): Sightline[] {
    const origin = this.getPreviewOriginForSelectedUnit();
    if (origin === undefined) {
      return [];
    }

    return this.units
      .filter((unit) => unit.team === "enemy")
      .map((enemy) => calculateSightline(this.grid, origin, enemy));
  }

  getTargetPreviewsForSelectedUnit(): TargetPreview[] {
    const origin = this.getPreviewOriginForSelectedUnit();
    if (origin === undefined) {
      return [];
    }

    const sightlinesByTarget = new Map(
      this.getSightlinesForSelectedUnit().map((sightline) => [sightline.targetUnitId, sightline])
    );

    return this.units
      .filter((unit) => unit.team === "enemy")
      .map((target) => {
        const coverDirection = getCoverDirectionTowardAttacker(origin, target.position);
        const targetTile = getTile(this.grid, target.position);
        const cover = targetTile?.coverSides[coverDirection] ?? 0;
        const visible = Boolean(sightlinesByTarget.get(target.id)?.visible);

        return {
          targetUnitId: target.id,
          visible,
          coverDirection,
          cover,
          flanked: visible && cover === 0,
        };
      });
  }

  getAimPreviewForTarget(targetUnitId: string): AimPreview | null {
    const shooter = this.selectedUnit;
    const target = this.units.find((unit) => unit.id === targetUnitId && unit.team !== shooter?.team);
    const targetPreview = this.getTargetPreviewsForSelectedUnit().find((preview) => preview.targetUnitId === targetUnitId);

    if (shooter === undefined || target === undefined || targetPreview === undefined) {
      return null;
    }

    const origin = this.getPreviewOriginForSelectedUnit() ?? shooter.position;
    const range = getManhattanDistance(origin, target.position);
    const rangeBand = getRangeBand(range);

    return {
      ...targetPreview,
      shooterUnitId: shooter.id,
      targetName: target.name,
      range,
      rangeBand,
      hitChance: calculateHitChance(targetPreview.cover, targetPreview.flanked, rangeBand),
    };
  }

  drainMovementEvents(): MovementEvent[] {
    return this.movementEvents.splice(0);
  }

  runEnemyTurn(): void {
    if (this.currentTeam !== "enemy") {
      return;
    }

    this.units
      .filter((unit) => unit.team === "enemy")
      .forEach((unit) => {
        const nextPosition = this.getEnemyStep(unit);
        if (nextPosition !== undefined) {
          this.moveUnit(unit, nextPosition, false);
        }
      });

    this.endTurn();
  }

  private moveUnit(unit: Unit, position: GridPosition, shouldNotify = true): boolean {
    if (unit.team !== this.currentTeam || unit.actionPoints <= 0 || !this.canMoveUnitTo(unit, position)) {
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
    this.selectedTargetUnitId = null;
    this.refreshSelectedMovementCache();
    this.phase = unit.movementPoints > 0 ? "moving" : "selecting";

    if (shouldNotify) {
      this.notify();
    }

    return true;
  }

  private getEnemyStep(enemy: Unit): GridPosition | undefined {
    const playerUnits = this.units.filter((unit) => unit.team === "player");
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

  private removeUnit(unitId: string): void {
    const unit = this.units.find((candidate) => candidate.id === unitId);
    if (unit !== undefined) {
      const tile = getTile(this.grid, unit.position);
      if (tile?.occupiedBy === unitId) {
        tile.occupiedBy = null;
      }
    }

    const unitIndex = this.units.findIndex((candidate) => candidate.id === unitId);
    if (unitIndex >= 0) {
      this.units.splice(unitIndex, 1);
    }

    if (this.selectedUnitId === unitId) {
      this.selectedUnitId = null;
    }
    if (this.selectedTargetUnitId === unitId) {
      this.selectedTargetUnitId = null;
    }
  }

  private rollShot(): number {
    const roll = ((this.shotCounter * 37 + 17) % 100) + 1;
    this.shotCounter += 1;
    return roll;
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}

function getManhattanDistance(from: GridPosition, to: GridPosition): number {
  return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
}

function getCoverDirectionTowardAttacker(attacker: GridPosition, target: GridPosition): CoverDirection {
  const deltaX = attacker.x - target.x;
  const deltaY = attacker.y - target.y;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX < 0 ? "west" : "east";
  }

  return deltaY < 0 ? "north" : "south";
}

function getRangeBand(range: number): RangeBand {
  if (range <= 4) {
    return "close";
  }

  if (range <= 7) {
    return "normal";
  }

  return "long";
}

function calculateHitChance(cover: number, flanked: boolean, rangeBand: RangeBand): number {
  const coverModifier = flanked ? 20 : cover === 1 ? -20 : cover >= 2 ? -40 : 0;
  const rangeModifier = rangeBand === "close" ? 10 : rangeBand === "long" ? -15 : 0;
  return clamp(65 + coverModifier + rangeModifier, 10, 95);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
