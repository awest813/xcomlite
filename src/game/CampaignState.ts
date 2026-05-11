import type { Campaign, CampaignUnit, UnitClass } from "./types";

const SAVE_KEY = "xcomlite_campaign_v1";
const VERSION = 1;

// ——— XP / credits constants ———

export const XP_PER_KILL = 50;
export const XP_PER_MISSION_VICTORY = 150;
export const XP_PER_MISSION_DEFEAT = 25;
export const CREDITS_PER_KILL = 20;
export const CREDITS_PER_VICTORY = 100;

/** XP total required to reach each level (index = level 1–5). */
export const LEVEL_XP_THRESHOLDS: number[] = [0, 0, 150, 350, 600, 900];

// ——— Level helpers ———

export function getLevel(xp: number): number {
  for (let l = 5; l >= 2; l--) {
    if (xp >= LEVEL_XP_THRESHOLDS[l]) {
      return l;
    }
  }
  return 1;
}

export interface LevelBoosts {
  maxHpBonus: number;
  aimBonus: number;
  maxApBonus: number;
}

export function getLevelBoosts(level: number): LevelBoosts {
  return {
    maxHpBonus: Math.floor((level - 1) * 1.5),
    aimBonus: (level - 1) * 5,
    maxApBonus: level >= 3 ? 1 : 0,
  };
}

/** Returns progress toward the next level for display. */
export function xpProgress(xp: number): { level: number; current: number; needed: number } {
  const level = getLevel(xp);
  if (level >= 5) {
    const cap = LEVEL_XP_THRESHOLDS[5];
    return { level, current: cap, needed: cap };
  }
  const floor = LEVEL_XP_THRESHOLDS[level];
  const ceil = LEVEL_XP_THRESHOLDS[level + 1];
  return { level, current: xp - floor, needed: ceil - floor };
}

// ——— Factory ———

function defaultCampaignUnit(id: string, name: string, unitClass: UnitClass): CampaignUnit {
  return {
    id,
    name,
    unitClass,
    xp: 0,
    level: 1,
    totalKills: 0,
    missionsCompleted: 0,
    isInjured: false,
    injuryMissionsLeft: 0,
    hpFraction: 1.0,
  };
}

export function newCampaign(playerUnitNames: [string, string, string]): Campaign {
  return {
    version: VERSION,
    credits: 0,
    units: [
      defaultCampaignUnit("player-1", playerUnitNames[0], "assault"),
      defaultCampaignUnit("player-2", playerUnitNames[1], "support"),
      defaultCampaignUnit("player-3", playerUnitNames[2], "sniper"),
    ],
    missionsCompleted: 0,
    completedMapIds: [],
  };
}

// ——— Outcome processing ———

export interface UnitBattleOutcome {
  unitId: string;
  kills: number;
  hpFraction: number;
  survived: boolean;
}

export interface BattleOutcome {
  victory: boolean;
  mapId: string;
  unitOutcomes: UnitBattleOutcome[];
}

export function applyBattleOutcome(campaign: Campaign, outcome: BattleOutcome): Campaign {
  const updatedUnits: CampaignUnit[] = campaign.units.map((cu) => {
    const uo = outcome.unitOutcomes.find((o) => o.unitId === cu.id);
    if (uo === undefined) {
      return cu;
    }

    const killXp = uo.kills * XP_PER_KILL;
    const missionXp = uo.survived ? (outcome.victory ? XP_PER_MISSION_VICTORY : XP_PER_MISSION_DEFEAT) : 0;
    const newXp = cu.xp + killXp + missionXp;
    const newLevel = getLevel(newXp);

    const injured = uo.survived && uo.hpFraction <= 0.5;

    return {
      ...cu,
      xp: newXp,
      level: newLevel,
      totalKills: cu.totalKills + uo.kills,
      missionsCompleted: cu.missionsCompleted + (uo.survived ? 1 : 0),
      isInjured: injured,
      injuryMissionsLeft: injured ? 1 : 0,
      // Dead units fully recover for the next mission; injured units carry their damage.
      hpFraction: uo.survived ? Math.max(uo.hpFraction, 0.1) : 1.0,
    };
  });

  const totalKills = outcome.unitOutcomes.reduce((sum, o) => sum + o.kills, 0);
  const creditsEarned = totalKills * CREDITS_PER_KILL + (outcome.victory ? CREDITS_PER_VICTORY : 0);

  const newCompletedMapIds =
    outcome.victory && !campaign.completedMapIds.includes(outcome.mapId)
      ? [...campaign.completedMapIds, outcome.mapId]
      : campaign.completedMapIds;

  return {
    ...campaign,
    credits: campaign.credits + creditsEarned,
    units: updatedUnits,
    missionsCompleted: campaign.missionsCompleted + (outcome.victory ? 1 : 0),
    completedMapIds: newCompletedMapIds,
  };
}

// ——— Persistence ———

export function saveCampaign(campaign: Campaign): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(campaign));
  } catch {
    // Storage may be unavailable in some environments.
  }
}

export function loadCampaign(): Campaign | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw === null) {
      return null;
    }
    const parsed = JSON.parse(raw) as Campaign;
    if (parsed.version !== VERSION) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearCampaignSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Ignore.
  }
}
