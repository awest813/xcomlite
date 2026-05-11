export type Team = "player" | "enemy";

export type BattlePhase = "selecting" | "moving" | "aiming" | "grenade_aiming" | "ability_select";

export type MissionResult = "in_progress" | "victory" | "defeat";

export type MissionType = "eliminate" | "extract";

export type TerrainType = "floor" | "road" | "rough" | "obstacle";

export type CoverDirection = "north" | "east" | "south" | "west";

export type CoverSides = Record<CoverDirection, number>;

export type WeaponType = "rifle" | "pistol" | "shotgun" | "sniper" | "heavy";

export type UnitClass = "assault" | "support" | "heavy" | "sniper";

export type AbilityType = "grenade" | "medkit" | "flashbang" | "smoke" | "overwatch" | "suppression";

export type InventoryCategory = "explosive" | "medical" | "utility";

export interface InventoryItem {
  id: string;
  name: string;
  category: InventoryCategory;
  quantity: number;
  maxQuantity: number;
  linkedAbility: AbilityType;
}

export type StatusEffect = "burning" | "stunned" | "poisoned" | "panicked";

export interface StatusEffectData {
  type: StatusEffect;
  duration: number;
  value: number;
}

export interface WeaponProfile {
  type: WeaponType;
  name: string;
  damage: number;
  range: number;
  aimBonus: number;
  clipSize: number;
  ammo: number;
}

export interface Ability {
  type: AbilityType;
  name: string;
  description: string;
  apCost: number;
  uses: number;
  maxUses: number;
}

export interface GridPosition {
  x: number;
  y: number;
  elevation: number;
}

export type FogState = "hidden" | "explored" | "visible";

export interface Tile extends GridPosition {
  terrain: TerrainType;
  walkable: boolean;
  cover: number;
  coverSides: CoverSides;
  moveCost: number;
  blocksSight: boolean;
  occupiedBy: string | null;
  destructible: boolean;
  smokeTurns: number;
  fogState: FogState;
}

export interface Unit {
  id: string;
  name: string;
  unitClass: UnitClass;
  team: Team;
  hp: number;
  maxHp: number;
  actionPoints: number;
  maxActionPoints: number;
  movementPoints: number;
  maxMovementPoints: number;
  position: GridPosition;
  isOverwatch: boolean;
  isSuppressed: boolean;
  isPanicked: boolean;
  weapon: WeaponProfile;
  abilities: Ability[];
  inventory: InventoryItem[];
  statusEffects: StatusEffectData[];
  will: number;
  maxWill: number;
  kills: number;
}
