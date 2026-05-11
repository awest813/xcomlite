import type { Campaign, CampaignUnit } from "../game/types";
import type { MapLayout } from "../data/BattleMap";
import { mapLayouts } from "../data/BattleMap";
import { xpProgress } from "../game/CampaignState";

export type LaunchMissionCallback = (layout: MapLayout) => void;

/** Returns `singular` when count is 1, otherwise `plural` (defaults to `singular + "s"`). */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

const CLASS_ICON: Record<string, string> = {
  assault: "⚔",
  support: "✚",
  sniper: "◎",
  heavy: "◉",
};

export class CampaignScreen {
  private readonly root: HTMLDivElement;
  private selectedMapId: string = mapLayouts[0].id;
  private onLaunch: LaunchMissionCallback;
  private onNewCampaign: () => void;

  constructor(
    campaign: Campaign,
    onLaunch: LaunchMissionCallback,
    onNewCampaign: () => void,
    debriefHtml?: string
  ) {
    this.onLaunch = onLaunch;
    this.onNewCampaign = onNewCampaign;

    this.root = document.createElement("div");
    this.root.className = "campaign-screen";

    // Header
    const header = document.createElement("div");
    header.className = "campaign-screen__header";
    header.innerHTML = `
      <div class="campaign-screen__title">VOID SOVEREIGNS — COMMAND</div>
      <div class="campaign-screen__meta">
        <span class="campaign-screen__credits">⬡ ${campaign.credits} CREDITS</span>
        <span class="campaign-screen__missions">MISSIONS COMPLETED: ${campaign.missionsCompleted}</span>
      </div>
    `;
    this.root.appendChild(header);

    // Debrief (if coming from a completed mission)
    if (debriefHtml !== undefined) {
      const debrief = document.createElement("div");
      debrief.className = "campaign-screen__debrief";
      debrief.innerHTML = debriefHtml;
      this.root.appendChild(debrief);
    }

    // Two-column layout
    const columns = document.createElement("div");
    columns.className = "campaign-screen__columns";

    columns.appendChild(this.buildSquadPanel(campaign.units));
    columns.appendChild(this.buildMissionsPanel(campaign));

    this.root.appendChild(columns);

    // Footer actions
    const footer = document.createElement("div");
    footer.className = "campaign-screen__footer";

    const newBtn = document.createElement("button");
    newBtn.className = "campaign-screen__btn campaign-screen__btn--secondary";
    newBtn.textContent = "New Campaign";
    newBtn.addEventListener("click", () => this.onNewCampaign());

    const launchBtn = document.createElement("button");
    launchBtn.id = "campaign-launch-btn";
    launchBtn.className = "campaign-screen__btn campaign-screen__btn--primary";
    launchBtn.textContent = "Deploy ▶";
    launchBtn.addEventListener("click", () => {
      const layout = mapLayouts.find((m) => m.id === this.selectedMapId);
      if (layout !== undefined) {
        this.onLaunch(layout);
      }
    });

    footer.append(newBtn, launchBtn);
    this.root.appendChild(footer);

    document.body.appendChild(this.root);
  }

  private buildSquadPanel(units: CampaignUnit[]): HTMLDivElement {
    const panel = document.createElement("div");
    panel.className = "campaign-screen__panel campaign-screen__panel--squad";

    const title = document.createElement("div");
    title.className = "campaign-screen__panel-title";
    title.textContent = "SQUAD ROSTER";
    panel.appendChild(title);

    for (const cu of units) {
      panel.appendChild(this.buildUnitCard(cu));
    }

    return panel;
  }

  private buildUnitCard(cu: CampaignUnit): HTMLDivElement {
    const card = document.createElement("div");
    card.className = "campaign-screen__unit-card";
    if (cu.isInjured) {
      card.classList.add("campaign-screen__unit-card--injured");
    }

    const { level, current, needed } = xpProgress(cu.xp);
    const xpPercent = needed > 0 ? Math.round((current / needed) * 100) : 100;
    const xpLabel = level >= 5 ? "MAX" : `${current} / ${needed} XP`;

    const injuryBadge = cu.isInjured
      ? `<span class="campaign-screen__badge campaign-screen__badge--injured">INJURED (${cu.injuryMissionsLeft} ${pluralize(cu.injuryMissionsLeft, "mission")})</span>`
      : "";

    card.innerHTML = `
      <div class="campaign-screen__unit-header">
        <span class="campaign-screen__unit-icon">${CLASS_ICON[cu.unitClass] ?? "·"}</span>
        <span class="campaign-screen__unit-name">${cu.name}</span>
        <span class="campaign-screen__unit-class">${cu.unitClass.toUpperCase()}</span>
        <span class="campaign-screen__level-badge">LVL ${level}</span>
        ${injuryBadge}
      </div>
      <div class="campaign-screen__unit-stats">
        <span>Kills: <b>${cu.totalKills}</b></span>
        <span>Missions: <b>${cu.missionsCompleted}</b></span>
      </div>
      <div class="campaign-screen__xp-row">
        <div class="campaign-screen__xp-bar-track">
          <div class="campaign-screen__xp-bar-fill" style="width:${xpPercent}%"></div>
        </div>
        <span class="campaign-screen__xp-label">${xpLabel}</span>
      </div>
    `;

    return card;
  }

  private buildMissionsPanel(campaign: Campaign): HTMLDivElement {
    const panel = document.createElement("div");
    panel.className = "campaign-screen__panel campaign-screen__panel--missions";

    const title = document.createElement("div");
    title.className = "campaign-screen__panel-title";
    title.textContent = "AVAILABLE MISSIONS";
    panel.appendChild(title);

    for (const layout of mapLayouts) {
      const card = this.buildMissionCard(layout, campaign);
      panel.appendChild(card);
    }

    return panel;
  }

  private buildMissionCard(layout: MapLayout, campaign: Campaign): HTMLDivElement {
    const card = document.createElement("div");
    const isCompleted = campaign.completedMapIds.includes(layout.id);
    const isSelected = layout.id === this.selectedMapId;

    card.className = "campaign-screen__mission-card";
    if (isSelected) {
      card.classList.add("campaign-screen__mission-card--selected");
    }
    if (isCompleted) {
      card.classList.add("campaign-screen__mission-card--completed");
    }

    const typeLabel = layout.missionType === "extract" ? "EXTRACT" : "ELIMINATE";
    const completedBadge = isCompleted ? `<span class="campaign-screen__badge campaign-screen__badge--done">✓ COMPLETE</span>` : "";

    card.innerHTML = `
      <div class="campaign-screen__mission-header">
        <span class="campaign-screen__mission-name">${layout.name}</span>
        <span class="campaign-screen__mission-type campaign-screen__mission-type--${layout.missionType}">${typeLabel}</span>
        ${completedBadge}
      </div>
      <div class="campaign-screen__mission-objective">${layout.objective}</div>
    `;

    card.addEventListener("click", () => {
      this.selectedMapId = layout.id;
      // Refresh selection styling without full re-render
      const allCards = this.root.querySelectorAll(".campaign-screen__mission-card");
      allCards.forEach((c) => c.classList.remove("campaign-screen__mission-card--selected"));
      card.classList.add("campaign-screen__mission-card--selected");
    });

    return card;
  }

  dispose(): void {
    this.root.remove();
  }
}

/** Build a debrief HTML string from battle results to pass into the next CampaignScreen. */
export function buildDebriefHtml(
  victory: boolean,
  mapName: string,
  creditsEarned: number,
  unitLines: string[]
): string {
  const resultClass = victory ? "campaign-screen__debrief--victory" : "campaign-screen__debrief--defeat";
  const resultText = victory ? "MISSION SUCCESS" : "MISSION FAILED";
  const linesHtml = unitLines.map((l) => `<div class="campaign-screen__debrief-line">${l}</div>`).join("");
  return `
    <div class="${resultClass}">
      <div class="campaign-screen__debrief-title">${resultText} — ${mapName}</div>
      <div class="campaign-screen__debrief-credits">Credits earned: +${creditsEarned}</div>
      ${linesHtml}
    </div>
  `;
}
