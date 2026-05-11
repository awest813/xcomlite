import { ArcRotateCamera, Engine, Scene, Vector3 } from "@babylonjs/core";
import { defaultMapLayout, voidSovereignsTheme } from "./data/BattleMap";
import type { MapLayout } from "./data/BattleMap";
import { BattleState } from "./game/BattleState";
import {
  applyBattleOutcome,
  clearCampaignSave,
  CREDITS_PER_KILL,
  CREDITS_PER_VICTORY,
  loadCampaign,
  newCampaign,
  saveCampaign,
  XP_PER_KILL,
  XP_PER_MISSION_DEFEAT,
  XP_PER_MISSION_VICTORY,
} from "./game/CampaignState";
import type { BattleOutcome } from "./game/CampaignState";
import { installDebugHooks } from "./game/DebugHooks";
import { setTheme } from "./game/Units";
import { TurnController } from "./game/TurnController";
import type { Campaign } from "./game/types";
import type { TacticalScene } from "./render/TacticalScene";
import { Hud } from "./ui/Hud";
import { buildDebriefHtml, CampaignScreen } from "./ui/CampaignScreen";
import "./style.css";

setTheme(voidSovereignsTheme);

class App {
  private campaign: Campaign;
  private currentLayout: MapLayout = defaultMapLayout;

  private battleState: BattleState | null = null;
  private tacticalScene: TacticalScene | null = null;
  private engine: Engine;
  private scene: Scene;
  private camera: ArcRotateCamera;
  private canvas: HTMLCanvasElement;
  private hud: Hud | null = null;
  private turnController: TurnController | null = null;
  private campaignScreen: CampaignScreen | null = null;
  private mapSwitchQueue: Promise<void> = Promise.resolve();
  private unsubscribeMissionEnd: (() => void) | null = null;
  private missionEndHandled = false;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.id = "gameCanvas";
    document.body.appendChild(this.canvas);

    this.engine = new Engine(this.canvas, true);
    this.scene = new Scene(this.engine);
    this.camera = new ArcRotateCamera("TacticalCamera", Math.PI / 4, Math.PI / 3, 16, Vector3.Zero(), this.scene);

    this.engine.runRenderLoop(() => {
      this.tacticalScene?.update(this.engine.getDeltaTime());
      this.scene.render();
    });

    window.addEventListener("resize", () => this.engine.resize());

    // Load or create campaign
    const saved = loadCampaign();
    this.campaign = saved ?? newCampaign([
      voidSovereignsTheme.playerUnitNames[0],
      voidSovereignsTheme.playerUnitNames[1],
      voidSovereignsTheme.playerUnitNames[2],
    ]);

    this.showCampaignScreen();
  }

  // ——— Campaign HQ screen ———

  private showCampaignScreen(debriefHtml?: string): void {
    this.hideBattleUI();
    this.campaignScreen?.dispose();
    this.campaignScreen = new CampaignScreen(
      this.campaign,
      (layout) => this.launchMission(layout),
      () => this.startNewCampaign(),
      debriefHtml,
    );
  }

  private startNewCampaign(): void {
    clearCampaignSave();
    this.campaign = newCampaign([
      voidSovereignsTheme.playerUnitNames[0],
      voidSovereignsTheme.playerUnitNames[1],
      voidSovereignsTheme.playerUnitNames[2],
    ]);
    this.showCampaignScreen();
  }

  // ——— Mission launch ———

  private launchMission(layout: MapLayout): void {
    this.currentLayout = layout;
    this.campaignScreen?.dispose();
    this.campaignScreen = null;
    this.showBattleUI();
    this.enqueueLoadMap(layout, this.campaign.units);
  }

  private hideBattleUI(): void {
    this.canvas.style.display = "none";

    if (this.hud) {
      this.hud.dispose();
      this.hud = null;
    }
    if (this.turnController) {
      this.turnController.dispose();
      this.turnController = null;
    }
    if (this.tacticalScene) {
      this.tacticalScene.dispose();
      this.tacticalScene = null;
    }
    this.battleState = null;
  }

  private showBattleUI(): void {
    this.canvas.style.display = "block";
  }

  // ——— Mission loading ———

  private enqueueLoadMap(layout: MapLayout, campaignUnits = this.campaign.units): void {
    this.mapSwitchQueue = this.mapSwitchQueue.then(() => this.performLoadMap(layout, campaignUnits)).catch((err) => {
      console.error(err);
    });
  }

  private async performLoadMap(layout: MapLayout, campaignUnits = this.campaign.units): Promise<void> {
    this.battleState?.grid.forEach((tile) => {
      tile.occupiedBy = null;
    });

    this.battleState = new BattleState(layout, campaignUnits);

    if (this.turnController) {
      this.turnController.dispose();
    }
    this.turnController = new TurnController(this.battleState);

    if (this.tacticalScene) {
      this.tacticalScene.dispose();
      this.tacticalScene = null;
    }

    const { TacticalScene } = await import("./render/TacticalScene");
    this.tacticalScene = new TacticalScene(this.scene, this.canvas, this.camera, this.battleState);

    if (this.hud) {
      this.hud.dispose();
    }
    this.hud = new Hud(this.battleState);

    installDebugHooks(this.battleState, this.scene, (deltaMs) => {
      this.tacticalScene?.update(deltaMs);
    });

    // Unsubscribe from any previous battle, then watch this one for mission end.
    this.unsubscribeMissionEnd?.();
    this.missionEndHandled = false;
    const capturedState = this.battleState;
    this.unsubscribeMissionEnd = this.battleState.subscribe(() => {
      if (capturedState.missionResult !== "in_progress") {
        this.onMissionEnded(capturedState);
      }
    });
  }

  // ——— Mission end → campaign update ———

  private onMissionEnded(bs: BattleState): void {
    if (this.missionEndHandled) {
      return;
    }
    // Guard: only handle for the currently active battle instance.
    if (bs !== this.battleState) {
      return;
    }
    this.missionEndHandled = true;

    const victory = bs.missionResult === "victory";
    const campaignUnitIds = this.campaign.units.map((cu) => cu.id);
    const unitOutcomes = bs.extractBattleResults(campaignUnitIds);

    const outcome: BattleOutcome = {
      victory,
      mapId: this.currentLayout.id,
      unitOutcomes,
    };

    // Compute credits earned for debrief display
    const totalKills = unitOutcomes.reduce((sum, o) => sum + o.kills, 0);
    const creditsEarned = totalKills * CREDITS_PER_KILL + (victory ? CREDITS_PER_VICTORY : 0);

    const debriefLines = this.campaign.units.map((cu, i) => {
      const uo = unitOutcomes[i];
      if (uo === undefined) {
        return `${cu.name}: data unavailable`;
      }
      const killXp = uo.kills * XP_PER_KILL;
      const missionXp = uo.survived ? (victory ? XP_PER_MISSION_VICTORY : XP_PER_MISSION_DEFEAT) : 0;
      const status = uo.survived ? (uo.hpFraction <= 0.5 ? "INJURED" : "OK") : "KIA";
      return `${cu.name}: ${uo.kills} kill${uo.kills !== 1 ? "s" : ""} · +${killXp + missionXp} XP · ${status}`;
    });

    this.campaign = applyBattleOutcome(this.campaign, outcome);
    saveCampaign(this.campaign);

    const debriefHtml = buildDebriefHtml(
      victory,
      this.currentLayout.name,
      creditsEarned,
      debriefLines,
    );

    // Delay so the HUD result banner is visible briefly before transition
    setTimeout(() => {
      // If the player restarted the mission during the delay, bail out.
      if (bs.missionResult === "in_progress") {
        this.missionEndHandled = false;
        return;
      }
      this.showCampaignScreen(debriefHtml);
    }, 2500);
  }
}

new App();

