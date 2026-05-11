import { buildGrid, getNeighbors, getTile } from "./Grid";
import { calculateSightline, type Sightline } from "./LineOfSight";
import { calculateMovement, getPath, tileKey, type PathfindingResult } from "./Pathfinding";
import { createEnemyUnits, createPlayerUnits, createPlayerUnitsFromCampaign } from "./Units";
import {
  calculateHitChance,
  getCoverDirectionTowardAttacker,
  getManhattanDistance,
  getRangeBand,
  getUnitActionLockMessage,
  isUnitIncapacitated,
  GRENADE_DAMAGE,
  GRENADE_RADIUS,
  OVERWATCH_HIT_PENALTY,
  RELOAD_ACTION_POINT_COST,
  SHOOT_ACTION_POINT_COST,
  SMOKE_HIT_PENALTY,
  type RangeBand,
} from "./CombatUtils";
import { EnemyAI } from "./EnemyAI";
import type { MapLayout } from "../data/BattleMap";
import type { Ability, AbilityType, BattlePhase, CampaignUnit, CoverDirection, GridPosition, MissionResult, MissionType, StatusEffectData, Team, Tile, Unit } from "./types";
import type { UnitBattleOutcome } from "./CampaignState";

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
  smokeObscured: boolean;
}

export type { RangeBand } from "./CombatUtils";

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

const MEDKIT_HEAL = 3;
const FLASHBANG_RADIUS = 2;
const FLASHBANG_DURATION = 1;
const SMOKE_RADIUS = 2;
const SMOKE_DURATION = 2;
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
  missionType: MissionType;
  missionResult: MissionResult = "in_progress";
  extractZone: GridPosition | null;
  grenadeTargetTile: GridPosition | null = null;
  selectedAbility: Ability | null = null;
  selectedAbilityTargetUnitId: string | null = null;
  /** Consumed by HUD as a one-shot toast message. */
  pendingFeedback: string | null = null;
  turnNumber = 1;

  private readonly listeners = new Set<BattleStateListener>();
  private selectedMovementCache: PathfindingResult | null = null;
  private readonly movementEvents: MovementEvent[] = [];
  private readonly shotEvents: ShotEvent[] = [];
  private readonly explosionEvents: ExplosionEvent[] = [];

  constructor(layout: MapLayout, campaignUnits?: CampaignUnit[]) {
    this.mapLayout = layout;
    this.missionType = layout.missionType;
    this.extractZone = layout.extractZone ?? null;
    this.grid = buildGrid(layout);
    const playerUnits = campaignUnits !== undefined
      ? createPlayerUnitsFromCampaign(campaignUnits, layout.playerStarts)
      : createPlayerUnits(layout.playerStarts);
    this.units = [...playerUnits, ...createEnemyUnits(layout.enemyStarts)];
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

    if (isUnitIncapacitated(unit)) {
      this.pushFeedback(getUnitActionLockMessage(unit));
      return;
    }

    this.selectedUnitId = unit.id;
    this.selectedTargetUnitId = null;
    this.selectedAbility = null;
    this.selectedAbilityTargetUnitId = null;
    this.grenadeTargetTile = null;
    this.phase = "moving";
    this.refreshSelectedMovementCache();
    this.notify();
  }

  previewAimAtUnit(targetUnitId: string): boolean {
    const preview = this.getAimPreviewForTarget(targetUnitId);
    if (preview === null || !preview.visible) {
      this.pushFeedback("No shot — blocked or out of sight.");
      return false;
    }

    this.selectedTargetUnitId = targetUnitId;
    this.selectedAbility = null;
    this.selectedAbilityTargetUnitId = null;
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
      this.selectedAbilityTargetUnitId = null;
      this.restoreMovementPhaseAfterCancel();
      return;
    }

    if (this.phase === "grenade_aiming" || this.phase === "ability_select") {
      this.selectedAbility = null;
      this.grenadeTargetTile = null;
      this.selectedTargetUnitId = null;
      this.selectedAbilityTargetUnitId = null;
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
      this.selectedAbilityTargetUnitId = null;
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
      this.pushFeedback("Cannot move right now.");
      return false;
    }

    if (isUnitIncapacitated(unit)) {
      this.pushFeedback(getUnitActionLockMessage(unit));
      return false;
    }

    if (this.phase !== "moving") {
      this.pushFeedback("Cancel targeting to move.");
      return false;
    }

    const moved = this.moveUnit(unit, position);
    if (!moved) {
      this.pushFeedback("Unreachable tile.");
    }
    return moved;
  }

  reloadWeapon(): boolean {
    if (this.missionResult !== "in_progress" || this.currentTeam !== "player") {
      return false;
    }

    const unit = this.selectedUnit;
    if (unit === undefined) {
      this.pushFeedback("Select a soldier first.");
      return false;
    }

    if (isUnitIncapacitated(unit)) {
      this.pushFeedback(getUnitActionLockMessage(unit));
      return false;
    }

    if (this.phase !== "moving" && this.phase !== "selecting") {
      this.pushFeedback("Finish or cancel targeting before reloading.");
      return false;
    }

    if (unit.weapon.ammo >= unit.weapon.clipSize) {
      this.pushFeedback("Magazine is full.");
      return false;
    }

    if (unit.actionPoints < RELOAD_ACTION_POINT_COST) {
      this.pushFeedback("Need 1 AP to reload.");
      return false;
    }

    unit.actionPoints -= RELOAD_ACTION_POINT_COST;
    unit.weapon.ammo = unit.weapon.clipSize;
    this.phase =
      unit.movementPoints > 0 || unit.actionPoints > 0 ? "moving" : "selecting";
    this.refreshSelectedMovementCache();
    this.notify();
    return true;
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

    if (isUnitIncapacitated(shooter)) {
      this.pushFeedback(getUnitActionLockMessage(shooter));
      return null;
    }

    if (this.phase !== "aiming") {
      return null;
    }

    if (shooter.weapon.ammo <= 0) {
      this.pushFeedback("Magazine empty — reload.");
      return null;
    }

    const origin = this.getPreviewOriginForSelectedUnit() ?? shooter.position;
    const result = this.resolveShot(shooter, preview.targetUnitId, origin);
    if (result !== null) {
      this.selectedTargetUnitId = null;
      this.phase = shooter.actionPoints > 0 ? "moving" : "selecting";
    }
    this.notify();
    return result;
  }

  pushFeedback(message: string): void {
    this.pendingFeedback = message;
    this.notify();
  }

  popFeedback(): string | undefined {
    if (this.pendingFeedback === null) {
      return undefined;
    }
    const message = this.pendingFeedback;
    this.pendingFeedback = null;
    return message;
  }

  selectAbility(abilityType: AbilityType): boolean {
    const unit = this.selectedUnit;
    if (unit === undefined || unit.team !== "player" || this.currentTeam !== "player") {
      return false;
    }

    if (isUnitIncapacitated(unit)) {
      this.pushFeedback(getUnitActionLockMessage(unit));
      return false;
    }

    const ability = unit.abilities.find((a) => a.type === abilityType && a.uses > 0);
    if (ability === undefined) {
      return false;
    }

    this.selectedAbility = ability;
    this.selectedTargetUnitId = null;
    this.selectedAbilityTargetUnitId = null;

    if (abilityType === "grenade" || abilityType === "flashbang" || abilityType === "smoke") {
      this.phase = "grenade_aiming";
    } else if (abilityType === "medkit") {
      this.phase = "ability_select";
    } else if (abilityType === "overwatch") {
      return this.enterOverwatch();
    } else if (abilityType === "suppression") {
      this.phase = "ability_select";
    }

    this.notify();
    return true;
  }

  selectAbilityTarget(unitId: string): boolean {
    const actingUnit = this.selectedUnit;
    const ability = this.selectedAbility;
    if (
      actingUnit === undefined ||
      this.currentTeam !== "player" ||
      this.phase !== "ability_select" ||
      ability === null
    ) {
      return false;
    }

    if (ability.type === "suppression") {
      const target = this.units.find((candidate) => candidate.id === unitId);
      if (target === undefined || target.team === actingUnit.team) {
        this.pushFeedback("Suppression requires an enemy target.");
        return false;
      }
      this.selectedAbilityTargetUnitId = target.id;
      this.notify();
      return true;
    }

    if (ability.type !== "medkit") {
      return false;
    }

    const target = this.units.find((candidate) => candidate.id === unitId);
    if (target === undefined || target.team !== actingUnit.team) {
      this.pushFeedback("Medkit requires an ally target.");
      return false;
    }

    this.selectedAbilityTargetUnitId = target.id;
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
    this.syncInventoryFromAbility(unit, ability.type);

    const result = this.createExplosion({ x: target.x, y: target.y, elevation: target.elevation }, GRENADE_RADIUS, GRENADE_DAMAGE);
    this.lastExplosionResult = result;
    this.explosionEvents.push({ position: { x: target.x, y: target.y, elevation: target.elevation }, radius: GRENADE_RADIUS, damage: GRENADE_DAMAGE });

    this.selectedAbility = null;
    this.selectedAbilityTargetUnitId = null;
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

    if (getManhattanDistance(unit.position, target.position) > 3) {
      this.pushFeedback("Target out of medkit range (3).");
      return false;
    }

    if (target.hp >= target.maxHp) {
      this.pushFeedback("Target is already at full health.");
      return false;
    }

    unit.actionPoints -= ability.apCost;
    ability.uses -= 1;
    this.syncInventoryFromAbility(unit, ability.type);
    target.hp = Math.min(target.maxHp, target.hp + MEDKIT_HEAL);

    this.selectedAbility = null;
    this.selectedAbilityTargetUnitId = null;
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
    this.syncInventoryFromAbility(unit, ability.type);

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
    this.selectedAbilityTargetUnitId = null;
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
    this.syncInventoryFromAbility(unit, ability.type);

    const tilesInRange = this.getTilesInRadius({ x: target.x, y: target.y, elevation: target.elevation }, SMOKE_RADIUS);
    tilesInRange.forEach((tile) => {
      tile.smokeTurns = Math.max(tile.smokeTurns, SMOKE_DURATION);
    });

    this.lastExplosionResult = { position: { x: target.x, y: target.y, elevation: target.elevation }, radius: SMOKE_RADIUS, damage: 0, unitsHit: [] };
    this.explosionEvents.push({ position: { x: target.x, y: target.y, elevation: target.elevation }, radius: SMOKE_RADIUS, damage: 0 });

    this.selectedAbility = null;
    this.selectedAbilityTargetUnitId = null;
    this.phase = unit.actionPoints > 0 ? "moving" : "selecting";
    this.pushFeedback("Smoke deployed — shots through the cloud lose accuracy.");
    this.notify();
    return this.lastExplosionResult;
  }

  suppressEnemy(targetUnitId: string): boolean {
    const unit = this.selectedUnit;
    const target = this.units.find((u) => u.id === targetUnitId);

    if (unit === undefined || target === undefined || this.selectedAbility === null) {
      return false;
    }

    if (this.selectedAbility.type !== "suppression") {
      return false;
    }

    if (target.team === unit.team) {
      this.pushFeedback("Suppression must target an enemy.");
      return false;
    }

    if (unit.actionPoints < this.selectedAbility.apCost) {
      this.pushFeedback("Need 1 AP to suppress.");
      return false;
    }

    const sightline = calculateSightline(this.grid, unit.position, target);
    if (!sightline.visible) {
      this.pushFeedback("Target must be in line of sight to suppress.");
      return false;
    }

    if (target.isSuppressed) {
      this.pushFeedback(`${target.name} is already suppressed.`);
      return false;
    }

    unit.actionPoints -= this.selectedAbility.apCost;
    target.isSuppressed = true;

    this.selectedAbility = null;
    this.selectedAbilityTargetUnitId = null;
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
      unit.isOverwatch ||
      isUnitIncapacitated(unit)
    ) {
      return false;
    }

    if (unit.weapon.ammo <= 0) {
      this.pushFeedback("Magazine empty — reload before overwatch.");
      return false;
    }

    unit.actionPoints -= SHOOT_ACTION_POINT_COST;
    unit.isOverwatch = true;
    this.selectedTargetUnitId = null;
    this.selectedAbility = null;
    this.selectedAbilityTargetUnitId = null;
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

    if (shooter.weapon.ammo <= 0) {
      return null;
    }

    shooter.actionPoints -= SHOOT_ACTION_POINT_COST;
    shooter.weapon.ammo -= 1;
    return this.executeShot(shooter, target, preview.hitChance, preview.damage);
  }

  /** @internal Used by EnemyAI. */
  executeShot(shooter: Unit, target: Unit, hitChance: number, weaponDamage: number): ShotResult {
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
      shooter.kills += 1;
      this.removeUnit(target.id);
      this.checkPanicOnDeath(target);
    }

    this.lastShotResult = result;
    this.shotEvents.push({ shooterPosition: shooterPos, targetPosition: targetPos, hit: result.hit });
    this.notify();
    return result;
  }

  /** @internal Used by EnemyAI. */
  createExplosion(position: GridPosition, radius: number, damage: number): ExplosionResult {
    const unitsInRange = this.getUnitsInRadius(position, radius);
    const unitsHit: { unitId: string; damage: number; killed: boolean }[] = [];
    const fallenUnits: Unit[] = [];

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
          fallenUnits.push(unit);
        }

        unitsHit.push({ unitId: unit.id, damage: actualDamage, killed: unit.hp === 0 });
      }
    }

    fallenUnits.forEach((unit) => this.checkPanicOnDeath(unit));

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

    target.will = Math.max(0, target.will - PANIC_DAMAGE_WILL);

    if (target.will <= 0) {
      target.isPanicked = true;
      target.statusEffects.push({ type: "panicked", duration: 1, value: 0 });
    }
  }

  private checkPanicOnDeath(casualty: Unit): void {
    const allies = this.units.filter(
      (u) => u.id !== casualty.id && u.team === casualty.team && !u.isPanicked
    );
    for (const ally of allies) {
      const distance = getManhattanDistance(casualty.position, ally.position);
      if (distance <= 3) {
        this.checkPanic(ally, casualty);
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
    const smokeObscured = this.isSightlineObscured(sightline);
    const hitChance = calculateHitChance(
      cover,
      flanked,
      rangeBand,
      shooter.weapon.aimBonus,
      shooter.isSuppressed,
      smokeObscured ? SMOKE_HIT_PENALTY : 0
    );

    return {
      targetUnitId: target.id,
      visible: true,
      coverDirection,
      cover,
      flanked,
      smokeObscured,
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

    this.turnNumber += 1;
    this.currentTeam = this.currentTeam === "player" ? "enemy" : "player";
    this.selectedUnitId = null;
    this.selectedTargetUnitId = null;
    this.selectedAbility = null;
    this.selectedAbilityTargetUnitId = null;
    this.grenadeTargetTile = null;
    this.selectedMovementCache = null;
    this.hoveredTilePosition = null;
    this.hoveredUnitId = null;
    this.phase = "selecting";
    this.resetActionPoints(this.currentTeam);
    this.resetMovementPoints(this.currentTeam);
    this.clearOverwatch(this.currentTeam);
    this.applyTurnStartActionLocks(this.currentTeam);
    this.decaySmokeClouds();
    // Do NOT clear enemy suppression here — it should persist through the enemy turn.
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

    if (this.missionType === "eliminate" && enemyUnits.length === 0) {
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
      tile.smokeTurns = 0;
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
    this.selectedAbilityTargetUnitId = null;
    this.grenadeTargetTile = null;
    this.hoveredTilePosition = null;
    this.hoveredUnitId = null;
    this.lastShotResult = null;
    this.lastExplosionResult = null;
    this.currentTeam = "player";
    this.phase = "selecting";
    this.missionType = this.mapLayout.missionType;
    this.extractZone = this.mapLayout.extractZone ?? null;
    this.missionResult = "in_progress";
    this.selectedMovementCache = null;
    this.movementEvents.length = 0;
    this.shotEvents.length = 0;
    this.explosionEvents.length = 0;
    this.pendingFeedback = null;
    this.turnNumber = 1;
    this.notify();
  }

  /**
   * Extract per-unit outcomes for campaign result processing.
   * Called after missionResult is no longer "in_progress".
   * For units that died during the mission their outcome is inferred from the
   * original campaign roster, so the caller must pass the ids to track.
   */
  extractBattleResults(campaignUnitIds: string[]): UnitBattleOutcome[] {
    return campaignUnitIds.map((unitId) => {
      const liveUnit = this.units.find((u) => u.id === unitId);
      if (liveUnit !== undefined) {
        return {
          unitId,
          kills: liveUnit.kills,
          hpFraction: liveUnit.maxHp > 0 ? liveUnit.hp / liveUnit.maxHp : 0,
          survived: true,
        };
      }
      // Unit was eliminated during the mission.
      return { unitId, kills: 0, hpFraction: 0, survived: false };
    });
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

  private applyTurnStartActionLocks(team: Team): void {
    this.units
      .filter((unit) => unit.team === team && isUnitIncapacitated(unit))
      .forEach((unit) => {
        unit.actionPoints = 0;
        unit.movementPoints = 0;
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
          smokeObscured: visible && this.isSightlineObscured(sightlinesByTarget.get(target.id)),
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
      hitChance: calculateHitChance(
        targetPreview.cover,
        targetPreview.flanked,
        rangeBand,
        shooter.weapon.aimBonus,
        shooter.isSuppressed,
        targetPreview.smokeObscured ? SMOKE_HIT_PENALTY : 0
      ),
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

    new EnemyAI(this).run();

    this.processStatusEffects("enemy");
    this.recoverWill("enemy");
    this.clearSuppression("enemy");
    this.currentTeam = "player";
    this.resetActionPoints("player");
    this.resetMovementPoints("player");
    this.clearOverwatch("player");
    this.applyTurnStartActionLocks("player");
    this.decaySmokeClouds();
    this.phase = "selecting";
    this.selectedUnitId = null;
    this.selectedTargetUnitId = null;
    this.selectedAbility = null;
    this.selectedAbilityTargetUnitId = null;
    this.grenadeTargetTile = null;
    this.selectedMovementCache = null;
    this.hoveredTilePosition = null;
    this.hoveredUnitId = null;
    this.checkMissionResult();
    this.notify();
    this.updateFogOfWar();
  }

  /** @internal Used by EnemyAI. */
  moveUnit(unit: Unit, position: GridPosition, shouldNotify = true): boolean {
    if (
      unit.team !== this.currentTeam ||
      unit.actionPoints <= 0 ||
      isUnitIncapacitated(unit) ||
      !this.canMoveUnitTo(unit, position)
    ) {
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
    this.selectedAbilityTargetUnitId = null;
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
      (u) =>
        u.team !== movingUnit.team &&
        u.isOverwatch &&
        u.actionPoints >= SHOOT_ACTION_POINT_COST &&
        u.weapon.ammo > 0
    );

    for (const reactiveUnit of overwatchUnits) {
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
          inventory: [],
          statusEffects: [],
          will: 50,
          maxWill: 50,
          kills: 0,
        });

        if (sightline.visible) {
          if (reactiveUnit.weapon.ammo <= 0) {
            break;
          }

          const coverDirection = getCoverDirectionTowardAttacker(reactiveUnit.position, movingUnit.position);
          const targetTile = getTile(this.grid, movingUnit.position);
          const cover = targetTile?.coverSides[coverDirection] ?? 0;
          const flanked = cover === 0;
          const range = getManhattanDistance(reactiveUnit.position, movingUnit.position);
          const rangeBand = getRangeBand(range);
          const hitChance = Math.max(10, calculateHitChance(cover, flanked, rangeBand, reactiveUnit.weapon.aimBonus, false) - OVERWATCH_HIT_PENALTY);

          reactiveUnit.actionPoints -= SHOOT_ACTION_POINT_COST;
          reactiveUnit.weapon.ammo -= 1;
          reactiveUnit.isOverwatch = false;

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

  /** @internal Used by EnemyAI. */
  syncInventoryFromAbility(unit: Unit, abilityType: AbilityType): void {
    const ability = unit.abilities.find((a) => a.type === abilityType);
    const entry = unit.inventory.find((i) => i.linkedAbility === abilityType);
    if (ability !== undefined && entry !== undefined) {
      entry.quantity = ability.uses;
    }
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
    return Math.floor(Math.random() * 100) + 1;
  }

  private decaySmokeClouds(): void {
    this.grid.forEach((tile) => {
      if (tile.smokeTurns > 0) {
        tile.smokeTurns -= 1;
      }
    });
  }

  private isSightlineObscured(sightline: Sightline | undefined): boolean {
    if (sightline === undefined) {
      return false;
    }

    return sightline.path.some((position, index) => index > 0 && (getTile(this.grid, position)?.smokeTurns ?? 0) > 0);
  }

  /** @internal Used by EnemyAI to record an explosion in the event queue. */
  addExplosionEvent(event: ExplosionEvent): void {
    this.explosionEvents.push(event);
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
        const distance = getManhattanDistance(unit.position, tile);
        if (distance > sightRadius) {
          continue;
        }

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
          inventory: [],
          statusEffects: [],
          will: 50,
          maxWill: 50,
          kills: 0,
        });
        if (sightline.visible) {
          tile.fogState = "visible";
        }
      }
    }
  }

  /** @internal Used by EnemyAI. */
  notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}
