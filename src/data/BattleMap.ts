import type { CoverSides, GridPosition, MissionType, TerrainType } from "../game/types";

export interface AuthoredTile {
  x: number;
  y: number;
  elevation?: number;
  terrain?: TerrainType;
  walkable?: boolean;
  cover?: number;
  coverSides?: Partial<CoverSides>;
  moveCost?: number;
  blocksSight?: boolean;
}

export interface ThemeConfig {
  name: string;
  playerUnitNames: string[];
  enemyUnitNames: string[];
  mapName: string;
  missionBriefing: string;
}

export interface MapLayout {
  id: string;
  name: string;
  missionType: MissionType;
  objective: string;
  extractZone?: GridPosition;
  width: number;
  height: number;
  playerStarts: GridPosition[];
  enemyStarts: GridPosition[];
  tiles: AuthoredTile[];
}

export const voidSovereignsTheme: ThemeConfig = {
  name: "Void Sovereigns",
  playerUnitNames: ["Sovereign Operative", "Station Tech", "Salvage Runner"],
  enemyUnitNames: ["SecurityBot", "Sovereign Remnant", "Auto-Turret"],
  mapName: "Derelict Station - Sector 7G",
  missionBriefing: "Sovereign remnants are active in the sector. Eliminate all hostiles and secure the area.",
};

export const xcomStrikeTheme: ThemeConfig = {
  name: "XCOM Strike Team",
  playerUnitNames: ["Ranger", "Specialist", "Sharpshooter"],
  enemyUnitNames: ["ADVENT Trooper", "ADVENT Officer", "ADVENT Sniper"],
  mapName: "Operation Neon Dagger",
  missionBriefing: "Eliminate hostile contacts and hold tactical control of the zone.",
};

export const xenonautsResponseTheme: ThemeConfig = {
  name: "Xenonauts Response Team",
  playerUnitNames: ["Rifleman", "Shield Operative", "Precision Marksman"],
  enemyUnitNames: ["Sebillian Scout", "Caesan Rifleman", "Andron Drone"],
  mapName: "Crash Site Recovery",
  missionBriefing: "Secure alien technology and neutralize all surviving hostiles.",
};

export const tacticalThemes: ThemeConfig[] = [voidSovereignsTheme, xcomStrikeTheme, xenonautsResponseTheme];

const stationSector7G: AuthoredTile[] = [
  { x: 0, y: 0, terrain: "rough", moveCost: 2 },
  { x: 1, y: 0, terrain: "rough", moveCost: 2 },
  { x: 8, y: 0, terrain: "rough", moveCost: 2 },
  { x: 9, y: 0, terrain: "rough", moveCost: 2 },
  { x: 0, y: 1, terrain: "rough", moveCost: 2 },
  { x: 9, y: 1, terrain: "rough", moveCost: 2 },

  { x: 4, y: 0, terrain: "road" },
  { x: 5, y: 0, terrain: "road" },
  { x: 4, y: 1, terrain: "road" },
  { x: 5, y: 1, terrain: "road" },
  { x: 4, y: 2, terrain: "road", cover: 1, coverSides: { north: 1, south: 1 }, moveCost: 2 },
  { x: 5, y: 2, terrain: "road", cover: 1, coverSides: { north: 1, south: 1 }, moveCost: 2 },
  { x: 4, y: 3, terrain: "road" },
  { x: 5, y: 3, terrain: "road" },
  { x: 4, y: 4, terrain: "road" },
  { x: 5, y: 4, terrain: "road" },
  { x: 4, y: 6, terrain: "road" },
  { x: 5, y: 6, terrain: "road" },
  { x: 4, y: 7, terrain: "road", cover: 1, coverSides: { north: 1, south: 1 }, moveCost: 2 },
  { x: 5, y: 7, terrain: "road", cover: 1, coverSides: { north: 1, south: 1 }, moveCost: 2 },
  { x: 4, y: 8, terrain: "road" },
  { x: 5, y: 8, terrain: "road" },
  { x: 4, y: 9, terrain: "road" },
  { x: 5, y: 9, terrain: "road" },

  { x: 3, y: 4, terrain: "floor", cover: 2, coverSides: { east: 2, south: 2 }, moveCost: 2, blocksSight: true, elevation: 1 },
  { x: 6, y: 4, terrain: "floor", cover: 2, coverSides: { west: 2, south: 2 }, moveCost: 2, blocksSight: true, elevation: 1 },
  { x: 4, y: 5, terrain: "obstacle", walkable: false, cover: 2, coverSides: { north: 2, east: 2, south: 2, west: 2 }, blocksSight: true },
  { x: 5, y: 5, terrain: "obstacle", walkable: false, cover: 2, coverSides: { north: 2, east: 2, south: 2, west: 2 }, blocksSight: true },
  { x: 2, y: 6, terrain: "floor", cover: 1, coverSides: { north: 1, east: 1 }, moveCost: 2 },
  { x: 7, y: 6, terrain: "floor", cover: 1, coverSides: { north: 1, west: 1 }, moveCost: 2 },

  { x: 0, y: 8, terrain: "rough", moveCost: 2 },
  { x: 1, y: 9, terrain: "rough", moveCost: 2 },
  { x: 8, y: 9, terrain: "rough", moveCost: 2 },
  { x: 9, y: 8, terrain: "rough", moveCost: 2 },

  { x: 2, y: 2, elevation: 1, terrain: "floor", moveCost: 2 },
  { x: 2, y: 3, elevation: 1, terrain: "floor", moveCost: 2 },
  { x: 3, y: 2, elevation: 1, terrain: "floor", moveCost: 2 },
  { x: 3, y: 3, elevation: 1, terrain: "floor", moveCost: 2 },

  { x: 6, y: 7, elevation: 1, terrain: "floor", moveCost: 2 },
  { x: 6, y: 8, elevation: 1, terrain: "floor", moveCost: 2 },
  { x: 7, y: 7, elevation: 1, terrain: "floor", moveCost: 2 },
  { x: 7, y: 8, elevation: 1, terrain: "floor", moveCost: 2 },
];

const abandonedOutpost: AuthoredTile[] = [
  { x: 0, y: 0, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 1, y: 0, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 2, y: 0, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 7, y: 0, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 8, y: 0, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 9, y: 0, terrain: "obstacle", walkable: false, blocksSight: true },

  { x: 0, y: 1, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 9, y: 1, terrain: "obstacle", walkable: false, blocksSight: true },

  { x: 3, y: 1, terrain: "road" },
  { x: 4, y: 1, terrain: "road" },
  { x: 5, y: 1, terrain: "road" },
  { x: 6, y: 1, terrain: "road" },

  { x: 0, y: 2, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 9, y: 2, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 3, y: 2, terrain: "floor", cover: 1, coverSides: { east: 1 }, moveCost: 2 },
  { x: 6, y: 2, terrain: "floor", cover: 1, coverSides: { west: 1 }, moveCost: 2 },

  { x: 0, y: 3, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 9, y: 3, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 4, y: 3, terrain: "floor", elevation: 1, moveCost: 2 },
  { x: 5, y: 3, terrain: "floor", elevation: 1, moveCost: 2 },

  { x: 0, y: 4, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 9, y: 4, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 2, y: 4, terrain: "floor", cover: 2, coverSides: { north: 2, south: 2 }, moveCost: 2 },
  { x: 7, y: 4, terrain: "floor", cover: 2, coverSides: { north: 2, south: 2 }, moveCost: 2 },

  { x: 0, y: 5, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 9, y: 5, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 4, y: 5, terrain: "floor", elevation: 1, moveCost: 2 },
  { x: 5, y: 5, terrain: "floor", elevation: 1, moveCost: 2 },

  { x: 0, y: 6, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 9, y: 6, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 3, y: 6, terrain: "floor", cover: 1, coverSides: { east: 1 }, moveCost: 2 },
  { x: 6, y: 6, terrain: "floor", cover: 1, coverSides: { west: 1 }, moveCost: 2 },

  { x: 0, y: 7, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 9, y: 7, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 3, y: 7, terrain: "road" },
  { x: 4, y: 7, terrain: "road" },
  { x: 5, y: 7, terrain: "road" },
  { x: 6, y: 7, terrain: "road" },

  { x: 0, y: 8, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 1, y: 8, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 2, y: 8, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 7, y: 8, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 8, y: 8, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 9, y: 8, terrain: "obstacle", walkable: false, blocksSight: true },

  { x: 0, y: 9, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 1, y: 9, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 2, y: 9, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 7, y: 9, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 8, y: 9, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 9, y: 9, terrain: "obstacle", walkable: false, blocksSight: true },
];

const voidRift: AuthoredTile[] = [
  { x: 0, y: 0, terrain: "rough", moveCost: 2 },
  { x: 1, y: 0, terrain: "rough", moveCost: 2 },
  { x: 2, y: 0, terrain: "rough", moveCost: 2 },
  { x: 7, y: 0, terrain: "rough", moveCost: 2 },
  { x: 8, y: 0, terrain: "rough", moveCost: 2 },
  { x: 9, y: 0, terrain: "rough", moveCost: 2 },

  { x: 0, y: 1, terrain: "rough", moveCost: 2 },
  { x: 9, y: 1, terrain: "rough", moveCost: 2 },
  { x: 4, y: 1, terrain: "floor", elevation: 1, moveCost: 2 },
  { x: 5, y: 1, terrain: "floor", elevation: 1, moveCost: 2 },

  { x: 0, y: 2, terrain: "rough", moveCost: 2 },
  { x: 9, y: 2, terrain: "rough", moveCost: 2 },
  { x: 3, y: 2, terrain: "floor", cover: 1, coverSides: { south: 1 }, moveCost: 2 },
  { x: 6, y: 2, terrain: "floor", cover: 1, coverSides: { south: 1 }, moveCost: 2 },

  { x: 0, y: 3, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 1, y: 3, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 8, y: 3, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 9, y: 3, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 4, y: 3, terrain: "floor", elevation: 2, moveCost: 3 },
  { x: 5, y: 3, terrain: "floor", elevation: 2, moveCost: 3 },

  { x: 0, y: 4, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 1, y: 4, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 8, y: 4, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 9, y: 4, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 2, y: 4, terrain: "floor", cover: 2, coverSides: { east: 2 }, moveCost: 2 },
  { x: 7, y: 4, terrain: "floor", cover: 2, coverSides: { west: 2 }, moveCost: 2 },

  { x: 0, y: 5, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 1, y: 5, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 8, y: 5, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 9, y: 5, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 2, y: 5, terrain: "floor", cover: 2, coverSides: { east: 2 }, moveCost: 2 },
  { x: 7, y: 5, terrain: "floor", cover: 2, coverSides: { west: 2 }, moveCost: 2 },

  { x: 0, y: 6, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 1, y: 6, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 8, y: 6, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 9, y: 6, terrain: "obstacle", walkable: false, blocksSight: true },
  { x: 4, y: 6, terrain: "floor", elevation: 2, moveCost: 3 },
  { x: 5, y: 6, terrain: "floor", elevation: 2, moveCost: 3 },

  { x: 0, y: 7, terrain: "rough", moveCost: 2 },
  { x: 9, y: 7, terrain: "rough", moveCost: 2 },
  { x: 3, y: 7, terrain: "floor", cover: 1, coverSides: { north: 1 }, moveCost: 2 },
  { x: 6, y: 7, terrain: "floor", cover: 1, coverSides: { north: 1 }, moveCost: 2 },

  { x: 0, y: 8, terrain: "rough", moveCost: 2 },
  { x: 9, y: 8, terrain: "rough", moveCost: 2 },
  { x: 4, y: 8, terrain: "floor", elevation: 1, moveCost: 2 },
  { x: 5, y: 8, terrain: "floor", elevation: 1, moveCost: 2 },

  { x: 0, y: 9, terrain: "rough", moveCost: 2 },
  { x: 1, y: 9, terrain: "rough", moveCost: 2 },
  { x: 2, y: 9, terrain: "rough", moveCost: 2 },
  { x: 7, y: 9, terrain: "rough", moveCost: 2 },
  { x: 8, y: 9, terrain: "rough", moveCost: 2 },
  { x: 9, y: 9, terrain: "rough", moveCost: 2 },
];

export const mapLayouts: MapLayout[] = [
  {
    id: "station-7g",
    name: "Derelict Station 7G",
    missionType: "eliminate",
    objective: "Eliminate all active Sovereign remnants.",
    width: 10,
    height: 10,
    playerStarts: [{ x: 1, y: 1, elevation: 0 }, { x: 2, y: 2, elevation: 0 }, { x: 1, y: 3, elevation: 0 }],
    enemyStarts: [{ x: 8, y: 6, elevation: 0 }, { x: 7, y: 7, elevation: 0 }, { x: 8, y: 8, elevation: 0 }],
    tiles: stationSector7G,
  },
  {
    id: "abandoned-outpost",
    name: "Abandoned Outpost",
    missionType: "eliminate",
    objective: "Clear the outpost and keep the squad alive.",
    width: 10,
    height: 10,
    playerStarts: [{ x: 1, y: 4, elevation: 0 }, { x: 2, y: 5, elevation: 0 }, { x: 1, y: 6, elevation: 0 }],
    enemyStarts: [{ x: 8, y: 3, elevation: 0 }, { x: 7, y: 4, elevation: 0 }, { x: 8, y: 5, elevation: 0 }],
    tiles: abandonedOutpost,
  },
  {
    id: "void-rift",
    name: "Void Rift",
    missionType: "extract",
    objective: "Reach the extraction beacon at the far side of the rift.",
    extractZone: { x: 5, y: 9, elevation: 0 },
    width: 10,
    height: 10,
    playerStarts: [{ x: 4, y: 0, elevation: 0 }, { x: 5, y: 0, elevation: 0 }, { x: 4, y: 1, elevation: 0 }],
    enemyStarts: [{ x: 4, y: 8, elevation: 0 }, { x: 5, y: 8, elevation: 0 }, { x: 5, y: 9, elevation: 0 }],
    tiles: voidRift,
  },
];

export const defaultMapLayout = mapLayouts[0];
