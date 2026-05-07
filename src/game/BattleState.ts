import { buildGrid, getNeighbors, getTile } from "./Grid";
import { calculateSightline, type Sightline } from "./LineOfSight";
import { calculateMovement, getPath, tileKey, type PathfindingResult } from "./Pathfinding";
import { createEnemyUnits, createPlayerUnits } from "./Units";
import type { BattlePhase, CoverDirection, GridPosition, MissionResult, MissionType, Team, Tile, Unit } from "./types";

type BattleStateListener = () => void;

export interface ShotEvent {
  shooterPosition: GridPosition;
  targetPosition: GridPosition;
  hit: boolean;
}

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
const OVERWATCH_ACTION_POINT_COST = 1;
const OVERWATCH_HIT_PENALTY = 20;

export class BattleState {
  readonly grid: Tile[];
  readonly units: Unit[];
  selectedUnitId: string | null = null;
  selectedTargetUnitId: string | null = null;
  hoveredTilePosition: GridPosition | null = null;
  lastShotResult: ShotResult | null = null;
  currentTeam: Team = "player";
  phase: BattlePhase = "selecting";
  missionType: MissionType = "eliminate";
  missionResult: MissionResult = "in_progress";
  extractZone: GridPosition | null = { x: 9, y: 9 };

  private readonly listeners = new Set<BattleStateListener>();
  private selectedMovementCache: PathfindingResult | null = null;
  private readonly movementEvents: MovementEvent[] = [];
  private readonly shotEvents: ShotEvent[] = [];
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

    return this.resolveShot(shooter, preview.targetUnitId);
  }

  enterOverwatch(): boolean {
    const unit = this.selectedUnit;
    if (
      unit === undefined ||
      unit.team !== this.currentTeam ||
      unit.actionPoints < OVERWATCH_ACTION_POINT_COST ||
      unit.isOverwatch
    ) {
      return false;
    }

    unit.actionPoints -= OVERWATCH_ACTION_POINT_COST;
    unit.isOverwatch = true;
    this.selectedTargetUnitId = null;
    this.phase = unit.actionPoints > 0 ? "moving" : "selecting";
    this.notify();
    return true;
  }

  private resolveShot(shooter: Unit, targetUnitId: string): ShotResult | null {
    const target = this.units.find((unit) => unit.id === targetUnitId);
    if (target === undefined) {
      return null;
    }

    const preview = this.getAimPreviewForTargetFromPosition(shooter.position, targetUnitId);
    if (preview === null || !preview.visible) {
      return null;
    }

    shooter.actionPoints -= SHOOT_ACTION_POINT_COST;
    return this.executeShot(shooter, target, preview.hitChance);
  }

  private executeShot(shooter: Unit, target: Unit, hitChance: number): ShotResult {
    const shooterPos = { ...shooter.position };
    const targetPos = { ...target.position };

    const roll = this.rollShot();
    const hit = roll <= hitChance;
    const damage = hit ? RIFLE_DAMAGE : 0;

    if (hit) {
      target.hp = Math.max(0, target.hp - damage);
    }

    const result: ShotResult = {
      shooterUnitId: shooter.id,
      targetUnitId: target.id,
      targetName: target.name,
      hitChance,
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
    this.shotEvents.push({ shooterPosition: shooterPos, targetPosition: targetPos, hit: result.hit });
    this.notify();
    return result;
  }

  private getAimPreviewForTargetFromPosition(fromPosition: GridPosition, targetUnitId: string): AimPreview | null {
    const shooter = this.units.find((u) => u.position.x === fromPosition.x && u.position.y === fromPosition.y && u.team === this.currentTeam);
    const target = this.units.find((unit) => unit.id === targetUnitId && unit.team !== shooter?.team);
    if (shooter === undefined || target === undefined) {
      return null;
    }

    const sightline = calculateSightline(this.grid, fromPosition, target);
    if (!sightline.visible) {
      return null;
    }

    const coverDirection = getCoverDirectionTowardAttacker(fromPosition, target.position);
    const targetTile = getTile(this.grid, target.position);
    const cover = targetTile?.coverSides[coverDirection] ?? 0;
    const flanked = cover === 0;

    const range = getManhattanDistance(fromPosition, target.position);
    const rangeBand = getRangeBand(range);
    const hitChance = calculateHitChance(cover, flanked, rangeBand);

    return {
      targetUnitId: target.id,
      visible: true,
      coverDirection,
      cover,
      flanked,
      shooterUnitId: shooter.id,
      targetName: target.name,
      range,
      rangeBand,
      hitChance,
    };
  }

  endTurn(): void {
    if (this.missionResult !== "in_progress") {
      return;
    }

    this.currentTeam = this.currentTeam === "player" ? "enemy" : "player";
    this.selectedUnitId = null;
    this.selectedTargetUnitId = null;
    this.selectedMovementCache = null;
    this.hoveredTilePosition = null;
    this.phase = "selecting";
    this.resetActionPoints(this.currentTeam);
    this.resetMovementPoints(this.currentTeam);
    this.clearOverwatch(this.currentTeam === "player" ? "enemy" : "player");
    this.checkMissionResult();
    this.notify();
  }

  checkMissionResult(): void {
    if (this.missionResult !== "in_progress") {
      return;
    }

    const playerUnits = this.units.filter((u) => u.team === "player");
    const enemyUnits = this.units.filter((u) => u.team === "enemy");

    if (enemyUnits.length === 0) {
      this.missionResult = "victory";
      return;
    }

    if (playerUnits.length === 0) {
      this.missionResult = "defeat";
      return;
    }

    if (this.missionType === "extract" && this.extractZone !== null) {
      const unitOnExtract = playerUnits.find(
        (u) => u.position.x === this.extractZone!.x && u.position.y === this.extractZone!.y
      );
      if (unitOnExtract !== undefined) {
        this.missionResult = "victory";
      }
    }
  }

  restartMission(): void {
    this.grid.forEach((tile) => {
      tile.occupiedBy = null;
    });

    this.units.length = 0;
    const newUnits = [...createPlayerUnits(), ...createEnemyUnits()];
    newUnits.forEach((unit) => {
      this.units.push(unit);
      const tile = getTile(this.grid, unit.position);
      if (tile !== undefined) {
        tile.occupiedBy = unit.id;
      }
    });

    this.selectedUnitId = null;
    this.selectedTargetUnitId = null;
    this.hoveredTilePosition = null;
    this.lastShotResult = null;
    this.currentTeam = "player";
    this.phase = "selecting";
    this.missionResult = "in_progress";
    this.selectedMovementCache = null;
    this.movementEvents.length = 0;
    this.shotEvents.length = 0;
    this.shotCounter = 0;
    this.notify();
  }

  clearOverwatch(team: Team): void {
    this.units
      .filter((unit) => unit.team === team)
      .forEach((unit) => {
        unit.isOverwatch = false;
      });
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

  drainShotEvents(): ShotEvent[] {
    return this.shotEvents.splice(0);
  }

  runEnemyTurn(): void {
    if (this.currentTeam !== "enemy") {
      return;
    }

    const enemyUnits = this.units.filter((unit) => unit.team === "enemy");

    for (const enemy of enemyUnits) {
      if (!this.units.some((u) => u.id === enemy.id)) {
        continue;
      }

      const actionResult = this.runEnemyAction(enemy);
      if (actionResult === "done") {
        break;
      }
    }

    this.endTurn();
  }

  private runEnemyAction(enemy: Unit): "continue" | "done" {
    const playerUnits = this.units.filter((unit) => unit.team === "player");
    if (playerUnits.length === 0) {
      return "done";
    }

    const visibleTargets = this.getVisiblePlayerTargets(enemy, playerUnits);

    if (visibleTargets.length > 0 && enemy.actionPoints >= SHOOT_ACTION_POINT_COST) {
      const flankedTargets = visibleTargets.filter((t) => t.flanked);
      const target = flankedTargets.length > 0 ? flankedTargets[0] : visibleTargets[0];
      return this.enemyShootAtTarget(enemy, target);
    }

    if (enemy.actionPoints > 0) {
      const moveResult = this.enemyMoveToBetterPosition(enemy, playerUnits, visibleTargets);
      if (moveResult) {
        return "continue";
      }
    }

    return "continue";
  }

  private getVisiblePlayerTargets(enemy: Unit, playerUnits: Unit[]): TargetPreview[] {
    return playerUnits
      .map((target) => {
        const sightline = calculateSightline(this.grid, enemy.position, target);
        if (!sightline.visible) {
          return null;
        }

        const coverDirection = getCoverDirectionTowardAttacker(enemy.position, target.position);
        const targetTile = getTile(this.grid, target.position);
        const cover = targetTile?.coverSides[coverDirection] ?? 0;

        return {
          targetUnitId: target.id,
          visible: true,
          coverDirection,
          cover,
          flanked: cover === 0,
        };
      })
      .filter((t): t is TargetPreview => t !== null);
  }

  private enemyShootAtTarget(enemy: Unit, target: TargetPreview): "continue" | "done" {
    const targetUnit = this.units.find((u) => u.id === target.targetUnitId);
    if (targetUnit === undefined) {
      return "continue";
    }

    const range = getManhattanDistance(enemy.position, targetUnit.position);
    const rangeBand = getRangeBand(range);
    const hitChance = calculateHitChance(target.cover, target.flanked, rangeBand);

    const shooterPos = { ...enemy.position };
    const targetPos = { ...targetUnit.position };

    enemy.actionPoints -= SHOOT_ACTION_POINT_COST;
    const roll = this.rollShot();
    const hit = roll <= hitChance;
    const damage = hit ? RIFLE_DAMAGE : 0;

    if (hit) {
      targetUnit.hp = Math.max(0, targetUnit.hp - damage);
    }

    const result: ShotResult = {
      shooterUnitId: enemy.id,
      targetUnitId: targetUnit.id,
      targetName: targetUnit.name,
      hitChance,
      roll,
      hit,
      damage,
      killed: targetUnit.hp === 0,
      targetHp: targetUnit.hp,
    };

    if (result.killed) {
      this.removeUnit(targetUnit.id);
    }

    this.lastShotResult = result;
    this.shotEvents.push({ shooterPosition: shooterPos, targetPosition: targetPos, hit: result.hit });
    this.notify();

    if (this.units.filter((u) => u.team === "player").length === 0) {
      return "done";
    }

    return "continue";
  }

  private enemyMoveToBetterPosition(enemy: Unit, playerUnits: Unit[], visibleTargets: TargetPreview[]): boolean {
    const nearestPlayer = [...playerUnits].sort((a, b) => {
      return getManhattanDistance(enemy.position, a.position) - getManhattanDistance(enemy.position, b.position);
    })[0];

    if (nearestPlayer === undefined) {
      return false;
    }

    if (visibleTargets.length > 0 && enemy.actionPoints >= SHOOT_ACTION_POINT_COST) {
      return false;
    }

    const nextTile = getNeighbors(this.grid, enemy.position)
      .filter((tile) => this.canMoveUnitTo(enemy, tile))
      .sort((a, b) => {
        const distA = getManhattanDistance(a, nearestPlayer.position);
        const distB = getManhattanDistance(b, nearestPlayer.position);
        if (distA !== distB) {
          return distA - distB;
        }
        const tileA = getTile(this.grid, a);
        const tileB = getTile(this.grid, b);
        return (tileB?.cover ?? 0) - (tileA?.cover ?? 0);
      })[0];

    if (nextTile === undefined) {
      return false;
    }

    this.moveUnit(enemy, { x: nextTile.x, y: nextTile.y }, true);
    return true;
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

    this.triggerOverwatchShots(unit, path);

    this.phase = unit.movementPoints > 0 ? "moving" : "selecting";

    if (shouldNotify) {
      this.notify();
    }

    return true;
  }

  private triggerOverwatchShots(movingUnit: Unit, path: GridPosition[]): void {
    const overwatchUnits = this.units.filter(
      (u) => u.team !== movingUnit.team && u.isOverwatch && u.actionPoints >= SHOOT_ACTION_POINT_COST
    );

    for (const overwatchUnit of overwatchUnits) {
      let triggered = false;
      for (const step of path) {
        if (triggered) {
          break;
        }

        const sightline = calculateSightline(this.grid, overwatchUnit.position, {
          id: "temp",
          name: "temp",
          team: movingUnit.team,
          hp: 1,
          maxHp: 1,
          actionPoints: 0,
          maxActionPoints: 0,
          movementPoints: 0,
          maxMovementPoints: 0,
          position: step,
          isOverwatch: false,
        });

        if (sightline.visible) {
          const coverDirection = getCoverDirectionTowardAttacker(overwatchUnit.position, movingUnit.position);
          const targetTile = getTile(this.grid, movingUnit.position);
          const cover = targetTile?.coverSides[coverDirection] ?? 0;
          const flanked = cover === 0;
          const range = getManhattanDistance(overwatchUnit.position, movingUnit.position);
          const rangeBand = getRangeBand(range);
          const hitChance = Math.max(10, calculateHitChance(cover, flanked, rangeBand) - OVERWATCH_HIT_PENALTY);

          overwatchUnit.actionPoints -= SHOOT_ACTION_POINT_COST;
          overwatchUnit.isOverwatch = false;

          this.executeShot(overwatchUnit, movingUnit, hitChance);
          triggered = true;
        }
      }
    }
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
