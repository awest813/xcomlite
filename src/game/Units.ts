import { voidSovereignsTheme, type ThemeConfig } from "../data/BattleMap";
import type { Ability, GridPosition, InventoryItem, Unit, WeaponProfile } from "./types";

let currentTheme: ThemeConfig = voidSovereignsTheme;

const CONSUMABLE_INVENTORY_META: Partial<
  Record<Ability["type"], { name: string; category: InventoryItem["category"] }>
> = {
  grenade: { name: "Frag grenade", category: "explosive" },
  medkit: { name: "Field medkit", category: "medical" },
  flashbang: { name: "Flashbang", category: "explosive" },
  smoke: { name: "Smoke grenade", category: "utility" },
};

function buildConsumableInventory(unitId: string, abilities: Ability[]): InventoryItem[] {
  const items: InventoryItem[] = [];

  for (const ability of abilities) {
    const meta = CONSUMABLE_INVENTORY_META[ability.type];
    if (meta === undefined) {
      continue;
    }

    items.push({
      id: `${unitId}-inv-${ability.type}`,
      name: meta.name,
      category: meta.category,
      quantity: ability.uses,
      maxQuantity: ability.maxUses,
      linkedAbility: ability.type,
    });
  }

  return items;
}

export function setTheme(theme: ThemeConfig): void {
  currentTheme = theme;
}

export function getTheme(): ThemeConfig {
  return currentTheme;
}

const weapons: Record<string, WeaponProfile> = {
  rifle: { type: "rifle", name: "Assault Rifle", damage: 3, range: 12, aimBonus: 0, clipSize: 6, ammo: 6 },
  pistol: { type: "pistol", name: "Sidearm", damage: 2, range: 6, aimBonus: 10, clipSize: 12, ammo: 12 },
  shotgun: { type: "shotgun", name: "Shotgun", damage: 5, range: 5, aimBonus: -10, clipSize: 4, ammo: 4 },
  sniper: { type: "sniper", name: "Sniper Rifle", damage: 6, range: 20, aimBonus: 15, clipSize: 2, ammo: 2 },
  heavy: { type: "heavy", name: "Heavy Cannon", damage: 4, range: 10, aimBonus: -5, clipSize: 4, ammo: 4 },
};

function createAbility(type: Ability["type"], uses: number): Ability {
  const abilityMap: Record<Ability["type"], Omit<Ability, "uses" | "maxUses">> = {
    grenade: { type: "grenade", name: "Grenade", description: "Area damage (3 radius)", apCost: 1 },
    medkit: { type: "medkit", name: "Medkit", description: "Heal 3 HP", apCost: 1 },
    flashbang: { type: "flashbang", name: "Flashbang", description: "Stun enemies (2 radius)", apCost: 1 },
    smoke: { type: "smoke", name: "Smoke", description: "Blanket an area with smoke, reducing hit chance", apCost: 1 },
    overwatch: { type: "overwatch", name: "Overwatch", description: "Fire at moving enemies", apCost: 1 },
    suppression: { type: "suppression", name: "Suppression", description: "Reduce enemy accuracy", apCost: 1 },
  };
  const base = abilityMap[type];
  return { ...base, uses, maxUses: uses };
}

function createUnit(id: string, name: string, team: Unit["team"], position: GridPosition, unitClass: Unit["unitClass"], weaponType: string, abilityTypes: Ability["type"][]): Unit {
  const abilities = abilityTypes.map((t) => createAbility(t, t === "overwatch" || t === "suppression" ? 99 : 2));

  return {
    id,
    name,
    unitClass,
    team,
    hp: unitClass === "heavy" ? 8 : 6,
    maxHp: unitClass === "heavy" ? 8 : 6,
    actionPoints: 2,
    maxActionPoints: 2,
    movementPoints: unitClass === "heavy" ? 4 : 6,
    maxMovementPoints: unitClass === "heavy" ? 4 : 6,
    position,
    isOverwatch: false,
    isSuppressed: false,
    isPanicked: false,
    weapon: { ...weapons[weaponType] },
    abilities,
    inventory: buildConsumableInventory(id, abilities),
    statusEffects: [],
    will: unitClass === "sniper" ? 40 : 50,
    maxWill: unitClass === "sniper" ? 40 : 50,
    kills: 0,
  };
}

export function createPlayerUnits(starts: GridPosition[]): Unit[] {
  return [
    createUnit("player-1", currentTheme.playerUnitNames[0], "player", starts[0] ?? { x: 1, y: 1, elevation: 0 }, "assault", "rifle", ["grenade", "flashbang"]),
    createUnit("player-2", currentTheme.playerUnitNames[1], "player", starts[1] ?? { x: 2, y: 2, elevation: 0 }, "support", "rifle", ["medkit", "smoke"]),
    createUnit("player-3", currentTheme.playerUnitNames[2], "player", starts[2] ?? { x: 1, y: 3, elevation: 0 }, "sniper", "sniper", ["grenade", "smoke"]),
  ];
}

export function createEnemyUnits(starts: GridPosition[]): Unit[] {
  return [
    createUnit("enemy-1", currentTheme.enemyUnitNames[0], "enemy", starts[0] ?? { x: 8, y: 6, elevation: 0 }, "heavy", "heavy", ["grenade"]),
    createUnit("enemy-2", currentTheme.enemyUnitNames[1], "enemy", starts[1] ?? { x: 7, y: 7, elevation: 0 }, "assault", "rifle", ["flashbang"]),
    createUnit("enemy-3", currentTheme.enemyUnitNames[2], "enemy", starts[2] ?? { x: 8, y: 8, elevation: 0 }, "sniper", "sniper", ["smoke"]),
  ];
}
