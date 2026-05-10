import { buildGrid, getNeighbors, getTile } from "./Grid";
import { calculateSightline, type Sightline } from "./LineOfSight";
import { calculateMovement, getPath, tileKey, type PathfindingResult } from "./Pathfinding";
import { createEnemyUnits, createPlayerUnits } from "./Units";
import type { MapLayout } from "../data/BattleMap";
import type { Ability, AbilityType, BattlePhase, CoverDirection, GridPosition, MissionResult, MissionType, StatusEffectData, Team, Tile, Unit } from "./types";

type BattleStateListener = () => void;

export interface ShotEvent {
  shooterPosition: GridPosition;
  targetPosition: GridPosition;
  hit: boolean;
}

export interface ExplosionEvent {
  position: GridPosition;
  radius: number;
  damage: number;
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
  damage: number;
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

export interface ExplosionResult {
  position: GridPosition;
  radius: number;
  damage: number;
  unitsHit: { unitId: string; damage: number; killed: boolean }[];
}

const SHOOT_ACTION_POINT_COST = 1;
const OVERWATCH_HIT_PENALTY = 20;
const SUPPRESSION_HIT_PENALTY = 30;
const GRENADE_DAMAGE = 4;
const GRENADE_RADIUS = 2;
const MEDKIT_HEAL = 3;
const FLASHBANG_RADIUS = 2;
const FLASHBANG_DURATION = 1;
const SMOKE_RADIUS = 2;
const PANIC_DAMAGE_WILL = 10;
const WILL_RECOVERY_PER_TURN = 5;

export class BattleState {
  readonly grid: Tile[];
  readonly units: Unit[];
  readonly mapLayout: MapLayout;
  selectedUnitId: string | null = null;
  selectedTargetUnitId: string | null = null;
  hoveredTilePosition: GridPosition | null = null;
  hoveredUnitId: string | null = null;
  lastShotResult: ShotResult | null = null;
  lastExplosionResult: ExplosionResult | null = null;
  currentTeam: Team = "player";
  phase: BattlePhase = "selecting";
  missionType: MissionType = "eliminate";
  missionResult: MissionResult = "in_progress";
  extractZone: GridPosition | null = { x: 9, y: 9, elevation: 0 };
  grenadeTargetTile: GridPosition | null = null;
  selectedAbility: Ability | null = null;

  private readonly listeners = new Set<BattleStateListener>();
  private selectedMovementCache: PathfindingResult | null = null;
  private readonly movementEvents: MovementEvent[] = [];
  private readonly shotEvents: ShotEvent[] = [];
  private readonly explosionEvents: ExplosionEvent[] = [];
  private shotCounter = 0;

  constructor(layout: MapLayout) {
    this.mapLayout = layout;
    this.grid = buildGrid(layout);
    this.units = [...createPlayerUnits(layout.playerStarts), ...createEnemyUnits(layout.enemyStarts)];
    this.units.forEach((unit) => {
      const tile = getTile(this.grid, unit.position);
      if (tile !== undefined) {
        tile.occupiedBy = unit.id;
      }
    });
    this.updateFogOfWar();
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
    this.selectedAbility = null;
    this.grenadeTargetTile = null;
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
    this.selectedAbility = null;
    this.grenadeTargetTile = null;
    this.hoveredTilePosition = null;
    this.hoveredUnitId = null;
    this.phase = "aiming";
    this.notify();
    return true;
  }

  /** Exit aim, grenade target selection, or ability target selection without spending AP. */
  cancelTacticalAction(): void {
    if (this.missionResult !== "in_progress" || this.currentTeam !== "player") {
      return;
    }

    if (this.phase === "aiming") {
      this.selectedTargetUnitId = null;
      this.hoveredTilePosition = null;
      this.hoveredUnitId = null;
      this.restoreMovementPhaseAfterCancel();
      return;
    }

    if (this.phase === "grenade_aiming" || this.phase === "ability_select") {
      this.selectedAbility = null;
      this.grenadeTargetTile = null;
      this.selectedTargetUnitId = null;
      this.hoveredTilePosition = null;
      this.hoveredUnitId = null;
      this.restoreMovementPhaseAfterCancel();
    }
  }

  private restoreMovementPhaseAfterCancel(): void {
    const unit = this.selectedUnit;
    this.phase =
      unit !== undefined && (unit.movementPoints > 0 || unit.actionPoints > 0) ? "moving" : "selecting";
    this.refreshSelectedMovementCache();
    this.notify();
  }

  setHoveredUnit(unitId: string | null): void {
    if (this.hoveredUnitId === unitId) {
      return;
    }

    this.hoveredUnitId = unitId;
    this.notify();
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
        const throwTypes: AbilityType[] = ["grenade", "flashbang", "smoke"];
        this.phase = this.selectedAbility !== null && throwTypes.includes(this.selectedAbility.type)
          ? "grenade_aiming"
          : "moving";
      }
    }
    this.notify();
  }

  moveSelectedUnit(position: GridPosition): boolean {
    const unit = this.selectedUnit;
    if (unit === undefined || unit.team !== this.currentTeam || unit.actionPoints <= 0) {
      return false;
    }

    if (this.phase !== "moving") {
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

    if (this.phase !== "aiming") {
      return null;
    }

    const origin = this.getPreviewOriginForSelectedUnit() ?? shooter.position;
    const result = this.resolveShot(shooter, preview.targetUnitId, origin);
    this.selectedTargetUnitId = null;
    this.phase = shooter.actionPoints > 0 ? "moving" : "selecting";
    this.notify();
    return result;
  }

  selectAbility(abilityType: AbilityType): boolean {
    const unit = this.selectedUnit;
    if (unit === undefined || unit.team !== "player" || this.currentTeam !== "player") {
      return false;
    }

    const ability = unit.abilities.find((a) => a.type === abilityType && a.uses > 0);
    if (ability === undefined) {
      return false;
    }

    this.selectedAbility = ability;
    this.selectedTargetUnitId = null;

    if (abilityType === "grenade" || abilityType === "flashbang" || abilityType === "smoke") {
      this.phase = "grenade_aiming";
    } else if (abilityType === "medkit") {
      this.phase = "ability_select";
    } else if (abilityType === "overwatch") {
      return this.enterOverwatch();
    } else if (abilityType === "suppression") {
      return this.enterSuppression();
    }

    this.notify();
    return true;
  }

  throwGrenade(): ExplosionResult | null {
    const unit = this.selectedUnit;
    const target = this.hoveredTile;

    if (unit === undefined || target === undefined || this.selectedAbility === undefined) {
      return null;
    }

    const ability = this.selectedAbility!;

    if (ability.type !== "grenade") {
      return null;
    }

    if (unit.actionPoints < ability.apCost) {
      return null;
    }

    unit.actionPoints -= ability.apCost;
    ability.uses -= 1;

    const result = this.createExplosion({ x: target.x, y: target.y, elevation: target.elevation }, GRENADE_RADIUS, GRENADE_DAMAGE);
    this.lastExplosionResult = result;
    this.explosionEvents.push({ position: { x: target.x, y: target.y, elevation: target.elevation }, radius: GRENADE_RADIUS, damage: GRENADE_DAMAGE });

    this.selectedAbility = null;
    this.phase = unit.actionPoints > 0 ? "moving" : "selecting";
    this.notify();
    return result;
  }

  useMedkit(targetUnitId: string): boolean {
    const unit = this.selectedUnit;
    const target = this.units.find((u) => u.id === targetUnitId);

    if (unit === undefined || target === undefined || this.selectedAbility === undefined) {
      return false;
    }

    const ability = this.selectedAbility!;

    if (ability.type !== "medkit") {
      return false;
    }

    if (unit.actionPoints < ability.apCost) {
      return false;
    }

    if (target.team !== unit.team) {
      return false;
    }

    if (target.hp >= target.maxHp) {
      return false;
    }

    unit.actionPoints -= ability.apCost;
    ability.uses -= 1;
    target.hp = Math.min(target.maxHp, target.hp + MEDKIT_HEAL);

    this.selectedAbility = null;
    this.phase = unit.actionPoints > 0 ? "moving" : "selecting";
    this.notify();
    return true;
  }

  throwFlashbang(): ExplosionResult | null {
    const unit = this.selectedUnit;
    const target = this.hoveredTile;

    if (unit === undefined || target === undefined || this.selectedAbility === undefined) {
      return null;
    }

    const ability = this.selectedAbility!;

    if (ability.type !== "flashbang") {
      return null;
    }

    if (unit.actionPoints < ability.apCost) {
      return null;
    }

    unit.actionPoints -= ability.apCost;
    ability.uses -= 1;

    const enemiesInRange = this.getUnitsInRadius({ x: target.x, y: target.y, elevation: target.elevation }, FLASHBANG_RADIUS);
    const stunnedUnits: { unitId: string; damage: number; killed: boolean }[] = [];

    for (const enemy of enemiesInRange) {
      if (enemy.team !== unit.team) {
        enemy.statusEffects.push({ type: "stunned", duration: FLASHBANG_DURATION, value: 0 });
        stunnedUnits.push({ unitId: enemy.id, damage: 0, killed: false });
      }
    }

    this.lastExplosionResult = { position: { x: target.x, y: target.y, elevation: target.elevation }, radius: FLASHBANG_RADIUS, damage: 0, unitsHit: stunnedUnits };
    this.explosionEvents.push({ position: { x: target.x, y: target.y, elevation: target.elevation }, radius: FLASHBANG_RADIUS, damage: 0 });

    this.selectedAbility = null;
    this.phase = unit.actionPoints > 0 ? "moving" : "selecting";
    this.notify();
    return this.lastExplosionResult;
  }

  throwSmoke(): ExplosionResult | null {
    const unit = this.selectedUnit;
    const target = this.hoveredTile;

    if (unit === undefined || target === undefined || this.selectedAbility === undefined) {
      return null;
    }

    const ability = this.selectedAbility!;

    if (ability.type !== "smoke") {
      return null;
    }

    if (unit.actionPoints < ability.apCost) {
      return null;
    }

    unit.actionPoints -= ability.apCost;
    ability.uses -= 1;

    const tilesInRange = this.getTilesInRadius({ x: target.x, y: target.y, elevation: target.elevation }, SMOKE_RADIUS);
    for (const tile of tilesInRange) {
      if (tile.cover === 0) {
        tile.cover = 2;
        tile.coverSides = { north: 2, east: 2, south: 2, west: 2 };
        tile.destructible = true;
      }
    }

    this.lastExplosionResult = { position: { x: target.x, y: target.y, elevation: target.elevation }, radius: SMOKE_RADIUS, damage: 0, unitsHit: [] };
    this.explosionEvents.push({ position: { x: target.x, y: target.y, elevation: target.elevation }, radius: SMOKE_RADIUS, damage: 0 });

    this.selectedAbility = null;
    this.phase = unit.actionPoints > 0 ? "moving" : "selecting";
    this.notify();
    return this.lastExplosionResult;
  }

  enterSuppression(): boolean {
    const unit = this.selectedUnit;

    if (unit === undefined || this.selectedAbility === undefined) {
      return false;
    }

    const ability = this.selectedAbility!;

    if (ability.type !== "suppression") {
      return false;
    }

    if (unit.actionPoints < ability.apCost) {
      return false;
    }

    unit.actionPoints -= ability.apCost;
    unit.isSuppressed = true;
    this.selectedAbility = null;
    this.phase = unit.actionPoints > 0 ? "moving" : "selecting";
    this.notify();
    return true;
  }

  enterOverwatch(): boolean {
    const unit = this.selectedUnit;
    if (
      unit === undefined ||
      unit.team !== this.currentTeam ||
      unit.actionPoints < SHOOT_ACTION_POINT_COST ||
      unit.isOverwatch
    ) {
      return false;
    }

    unit.actionPoints -= SHOOT_ACTION_POINT_COST;
    unit.isOverwatch = true;
    this.selectedTargetUnitId = null;
    this.selectedAbility = null;
    this.phase = unit.actionPoints > 0 ? "moving" : "selecting";
    this.notify();
    return true;
  }

  private resolveShot(shooter: Unit, targetUnitId: string, originOverride?: GridPosition): ShotResult | null {
    const target = this.units.find((unit) => unit.id === targetUnitId);
    if (target === undefined) {
      return null;
    }

    const origin = originOverride ?? shooter.position;
    const preview = this.getAimPreviewForTargetFromPosition(origin, targetUnitId);
    if (preview === null || !preview.visible) {
      return null;
    }

    shooter.actionPoints -= SHOOT_ACTION_POINT_COST;
    return this.executeShot(shooter, target, preview.hitChance, preview.damage);
  }

  private executeShot(shooter: Unit, target: Unit, hitChance: number, weaponDamage: number): ShotResult {
    const shooterPos = { ...shooter.position };
    const targetPos = { ...target.position };

    const roll = this.rollShot();
    const hit = roll <= hitChance;
    const damage = hit ? weaponDamage : 0;

    if (hit) {
      target.hp = Math.max(0, target.hp - damage);
      this.damageCoverAt(target.position);
      this.checkPanic(target, shooter);
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
      this.checkPanicOnDeath(shooter);
    }

    this.lastShotResult = result;
    this.shotEvents.push({ shooterPosition: shooterPos, targetPosition: targetPos, hit: result.hit });
    this.notify();
    return result;
  }

  private createExplosion(position: GridPosition, radius: number, damage: number): ExplosionResult {
    const unitsInRange = this.getUnitsInRadius(position, radius);
    const unitsHit: { unitId: string; damage: number; killed: boolean }[] = [];

    for (const unit of unitsInRange) {
      const distance = getManhattanDistance(position, unit.position);
      const falloff = distance === 0 ? 1 : distance === 1 ? 0.75 : 0.5;
      const actualDamage = Math.round(damage * falloff);

      if (actualDamage > 0) {
        unit.hp = Math.max(0, unit.hp - actualDamage);
        this.damageCoverAt(unit.position);
        this.checkPanic(unit, null);

        if (unit.hp === 0) {
          this.removeUnit(unit.id);
        }

        unitsHit.push({ unitId: unit.id, damage: actualDamage, killed: unit.hp === 0 });
      }
    }

    return { position, radius, damage, unitsHit };
  }

  private damageCoverAt(position: GridPosition): void {
    const tile = getTile(this.grid, position);
    if (tile === undefined) {
      return;
    }

    for (const neighbor of getNeighbors(this.grid, position)) {
      if (neighbor.cover > 0) {
        neighbor.cover = Math.max(0, neighbor.cover - 1);
        if (neighbor.cover === 0) {
          neighbor.coverSides = { north: 0, east: 0, south: 0, west: 0 };
          neighbor.destructible = false;
        }
      }
    }

    if (tile.destructible && tile.cover > 0) {
      tile.cover = Math.max(0, tile.cover - 1);
      if (tile.cover === 0) {
        tile.coverSides = { north: 0, east: 0, south: 0, west: 0 };
        tile.destructible = false;
      }
    }
  }

  private checkPanic(target: Unit, _shooter: Unit | null): void {
    if (target.isPanicked) {
      return;
    }

    target.will -= PANIC_DAMAGE_WILL;

    if (target.will <= 0) {
      target.isPanicked = true;
      target.statusEffects.push({ type: "panicked", duration: 1, value: 0 });
    }
  }

  private checkPanicOnDeath(shooter: Unit): void {
    const allies = this.units.filter((u) => u.team !== shooter.team && !u.isPanicked);
    for (const ally of allies) {
      const distance = getManhattanDistance(shooter.position, ally.position);
      if (distance <= 3) {
        this.checkPanic(ally, shooter);
      }
    }
  }

  private getUnitsInRadius(center: GridPosition, radius: number): Unit[] {
    return this.units.filter((unit) => {
      const distance = getManhattanDistance(center, unit.position);
      return distance <= radius;
    });
  }

  private getTilesInRadius(center: GridPosition, radius: number): Tile[] {
    return this.grid.filter((tile) => {
      const distance = getManhattanDistance(center, tile);
      return distance <= radius;
    });
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
    const hitChance = calculateHitChance(cover, flanked, rangeBand, shooter.weapon.aimBonus, shooter.isSuppressed);

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
      damage: shooter.weapon.damage,
    };
  }

  endTurn(): void {
    if (this.missionResult !== "in_progress") {
      return;
    }

    if (this.currentTeam !== "player") {
      return;
    }

    this.processStatusEffects(this.currentTeam);
    this.recoverWill(this.currentTeam);

    this.currentTeam = this.currentTeam === "player" ? "enemy" : "player";
    this.selectedUnitId = null;
    this.selectedTargetUnitId = null;
    this.selectedAbility = null;
    this.grenadeTargetTile = null;
    this.selectedMovementCache = null;
    this.hoveredTilePosition = null;
    this.hoveredUnitId = null;
    this.phase = "selecting";
    this.resetActionPoints(this.currentTeam);
    this.resetMovementPoints(this.currentTeam);
    this.clearOverwatch(this.currentTeam);
    this.clearSuppression(this.currentTeam);
    this.checkMissionResult();
    this.notify();
    this.updateFogOfWar();
  }

  private processStatusEffects(team: Team): void {
    for (const unit of this.units) {
      if (unit.team !== team) {
        continue;
      }
      const newEffects: StatusEffectData[] = [];
      for (const effect of unit.statusEffects) {
        if (effect.type === "stunned") {
          if (effect.duration > 0) {
            effect.duration -= 1;
            if (effect.duration > 0) {
              newEffects.push(effect);
            }
          }
        } else if (effect.type === "burning") {
          unit.hp = Math.max(0, unit.hp - effect.value);
          effect.duration -= 1;
          if (effect.duration > 0 && unit.hp > 0) {
            newEffects.push(effect);
          }
        } else if (effect.type === "panicked") {
          effect.duration -= 1;
          if (effect.duration > 0) {
            newEffects.push(effect);
          } else {
            unit.isPanicked = false;
          }
        } else {
          newEffects.push(effect);
        }
      }
      unit.statusEffects = newEffects;
    }
  }

  private recoverWill(team: Team): void {
    this.units
      .filter((u) => u.team === team)
      .forEach((u) => {
        u.will = Math.min(u.maxWill, u.will + WILL_RECOVERY_PER_TURN);
      });
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
    const newUnits = [...createPlayerUnits(this.mapLayout.playerStarts), ...createEnemyUnits(this.mapLayout.enemyStarts)];
    newUnits.forEach((unit) => {
      this.units.push(unit);
      const tile = getTile(this.grid, unit.position);
      if (tile !== undefined) {
        tile.occupiedBy = unit.id;
      }
    });

    this.selectedUnitId = null;
    this.selectedTargetUnitId = null;
    this.selectedAbility = null;
    this.grenadeTargetTile = null;
    this.hoveredTilePosition = null;
    this.hoveredUnitId = null;
    this.lastShotResult = null;
    this.lastExplosionResult = null;
    this.currentTeam = "player";
    this.phase = "selecting";
    this.missionResult = "in_progress";
    this.selectedMovementCache = null;
    this.movementEvents.length = 0;
    this.shotEvents.length = 0;
    this.explosionEvents.length = 0;
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

  clearSuppression(team: Team): void {
    this.units
      .filter((unit) => unit.team === team)
      .forEach((unit) => {
        unit.isSuppressed = false;
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
      return { x: hoveredTile.x, y: hoveredTile.y, elevation: hoveredTile.elevation };
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
      hitChance: calculateHitChance(targetPreview.cover, targetPreview.flanked, rangeBand, shooter.weapon.aimBonus, shooter.isSuppressed),
      damage: shooter.weapon.damage,
    };
  }

  drainMovementEvents(): MovementEvent[] {
    return this.movementEvents.splice(0);
  }

  drainShotEvents(): ShotEvent[] {
    return this.shotEvents.splice(0);
  }

  drainExplosionEvents(): ExplosionEvent[] {
    return this.explosionEvents.splice(0);
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

      if (enemy.statusEffects.some((e) => e.type === "stunned")) {
        continue;
      }

      const actionResult = this.runEnemyAction(enemy);
      if (actionResult === "done") {
        break;
      }
    }

    this.processStatusEffects("enemy");
    this.recoverWill("enemy");
    this.currentTeam = "player";
    this.resetActionPoints("player");
    this.resetMovementPoints("player");
    this.clearOverwatch("player");
    this.clearSuppression("player");
    this.phase = "selecting";
    this.selectedUnitId = null;
    this.selectedTargetUnitId = null;
    this.selectedAbility = null;
    this.grenadeTargetTile = null;
    this.selectedMovementCache = null;
    this.hoveredTilePosition = null;
    this.hoveredUnitId = null;
    this.checkMissionResult();
    this.notify();
    this.updateFogOfWar();
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
    const hitChance = calculateHitChance(target.cover, target.flanked, rangeBand, enemy.weapon.aimBonus, enemy.isSuppressed);

    const shooterPos = { ...enemy.position };
    const targetPos = { ...targetUnit.position };

    enemy.actionPoints -= SHOOT_ACTION_POINT_COST;
    const roll = this.rollShot();
    const hit = roll <= hitChance;
    const damage = hit ? enemy.weapon.damage : 0;

    if (hit) {
      targetUnit.hp = Math.max(0, targetUnit.hp - damage);
      this.damageCoverAt(targetUnit.position);
      this.checkPanic(targetUnit, enemy);
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
      this.checkPanicOnDeath(enemy);
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

    this.moveUnit(enemy, { x: nextTile.x, y: nextTile.y, elevation: nextTile.elevation }, true);
    return true;
  }

  private moveUnit(unit: Unit, position: GridPosition, shouldNotify = true): boolean {
    if (unit.team !== this.currentTeam || unit.actionPoints <= 0 || !this.canMoveUnitTo(unit, position)) {
      return false;
    }

    const movement = this.getMovementForUnit(unit);
    const path = getPath(movement, this.grid, unit.position, position);
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
    this.selectedAbility = null;
    this.refreshSelectedMovementCache();

    this.triggerOverwatchShots(unit, path);

    this.phase = unit.movementPoints > 0 ? "moving" : "selecting";

    if (shouldNotify) {
      this.notify();
      this.updateFogOfWar();
    }

    return true;
  }

  private triggerOverwatchShots(movingUnit: Unit, path: GridPosition[]): void {
    const overwatchUnits = this.units.filter(
      (u) => u.team !== movingUnit.team && u.isOverwatch && u.actionPoints >= SHOOT_ACTION_POINT_COST
    );

    const suppressionUnits = this.units.filter(
      (u) => u.team !== movingUnit.team && u.isSuppressed && u.actionPoints >= SHOOT_ACTION_POINT_COST
    );

    for (const reactiveUnit of [...overwatchUnits, ...suppressionUnits]) {
      let triggered = false;
      for (const step of path) {
        if (triggered) {
          break;
        }

        const sightline = calculateSightline(this.grid, reactiveUnit.position, {
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
          isSuppressed: false,
          isPanicked: false,
          unitClass: "assault",
          weapon: reactiveUnit.weapon,
          abilities: [],
          statusEffects: [],
          will: 50,
          maxWill: 50,
        });

        if (sightline.visible) {
          const coverDirection = getCoverDirectionTowardAttacker(reactiveUnit.position, movingUnit.position);
          const targetTile = getTile(this.grid, movingUnit.position);
          const cover = targetTile?.coverSides[coverDirection] ?? 0;
          const flanked = cover === 0;
          const range = getManhattanDistance(reactiveUnit.position, movingUnit.position);
          const rangeBand = getRangeBand(range);
          const penalty = reactiveUnit.isSuppressed ? SUPPRESSION_HIT_PENALTY : OVERWATCH_HIT_PENALTY;
          const hitChance = Math.max(10, calculateHitChance(cover, flanked, rangeBand, reactiveUnit.weapon.aimBonus, false) - penalty);

          reactiveUnit.actionPoints -= SHOOT_ACTION_POINT_COST;
          if (reactiveUnit.isOverwatch) {
            reactiveUnit.isOverwatch = false;
          }

          this.executeShot(reactiveUnit, movingUnit, hitChance, reactiveUnit.weapon.damage);
          triggered = true;
        }
      }
    }
  }

  private getPathForUnit(unit: Unit, destination: GridPosition): GridPosition[] {
    return getPath(this.getMovementForUnit(unit), this.grid, unit.position, destination);
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

  private updateFogOfWar(): void {
    this.grid.forEach((tile) => {
      if (tile.fogState === "visible") {
        tile.fogState = "explored";
      }
    });

    const playerUnits = this.units.filter((u) => u.team === "player");
    for (const unit of playerUnits) {
      const sightRadius = unit.unitClass === "sniper" ? 6 : 5;
      for (const tile of this.grid) {
        if (tile.fogState === "hidden") {
          const distance = getManhattanDistance(unit.position, tile);
          if (distance <= sightRadius) {
            const sightline = calculateSightline(this.grid, unit.position, {
              id: "temp",
              name: "temp",
              team: "enemy",
              hp: 1,
              maxHp: 1,
              actionPoints: 0,
              maxActionPoints: 0,
              movementPoints: 0,
              maxMovementPoints: 0,
              position: { x: tile.x, y: tile.y, elevation: tile.elevation },
              isOverwatch: false,
              isSuppressed: false,
              isPanicked: false,
              unitClass: "assault",
              weapon: unit.weapon,
              abilities: [],
              statusEffects: [],
              will: 50,
              maxWill: 50,
            });
            if (sightline.visible) {
              tile.fogState = "visible";
            }
          }
        }
      }
    }
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

function calculateHitChance(cover: number, flanked: boolean, rangeBand: RangeBand, aimBonus: number = 0, isSuppressed: boolean = false): number {
  const coverModifier = flanked ? 20 : cover === 1 ? -20 : cover >= 2 ? -40 : 0;
  const rangeModifier = rangeBand === "close" ? 10 : rangeBand === "long" ? -15 : 0;
  const suppressionModifier = isSuppressed ? -20 : 0;
  return clamp(65 + coverModifier + rangeModifier + aimBonus + suppressionModifier, 10, 95);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
