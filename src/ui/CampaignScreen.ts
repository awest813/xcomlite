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
  private selectedMapId: string = mapLayouts[0]?.id ?? "";
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
    const title = document.createElement("div");
    title.className = "campaign-screen__title";
    title.textContent = "VOID SOVEREIGNS — COMMAND";
    const meta = document.createElement("div");
    meta.className = "campaign-screen__meta";
    const credits = document.createElement("span");
    credits.className = "campaign-screen__credits";
    credits.textContent = `⬡ ${campaign.credits} CREDITS`;
    const missions = document.createElement("span");
    missions.className = "campaign-screen__missions";
    missions.textContent = `MISSIONS COMPLETED: ${campaign.missionsCompleted}`;
    meta.append(credits, missions);
    header.append(title, meta);
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
    launchBtn.textContent = mapLayouts.length === 0 ? "No Missions Available" : "Deploy ▶";
    launchBtn.disabled = mapLayouts.length === 0;
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

    const header = document.createElement("div");
    header.className = "campaign-screen__unit-header";

    const icon = document.createElement("span");
    icon.className = "campaign-screen__unit-icon";
    icon.textContent = CLASS_ICON[cu.unitClass] ?? "·";

    const name = document.createElement("span");
    name.className = "campaign-screen__unit-name";
    name.textContent = cu.name;

    const unitClass = document.createElement("span");
    unitClass.className = "campaign-screen__unit-class";
    unitClass.textContent = cu.unitClass.toUpperCase();

    const levelBadge = document.createElement("span");
    levelBadge.className = "campaign-screen__level-badge";
    levelBadge.textContent = `LVL ${level}`;

    header.append(icon, name, unitClass, levelBadge);

    if (cu.isInjured) {
      const injuryBadge = document.createElement("span");
      injuryBadge.className = "campaign-screen__badge campaign-screen__badge--injured";
      injuryBadge.textContent = `INJURED (${cu.injuryMissionsLeft} ${pluralize(cu.injuryMissionsLeft, "mission")})`;
      header.appendChild(injuryBadge);
    }

    const stats = document.createElement("div");
    stats.className = "campaign-screen__unit-stats";

    const kills = document.createElement("span");
    kills.append("Kills: ");
    const killsValue = document.createElement("b");
    killsValue.textContent = String(cu.totalKills);
    kills.appendChild(killsValue);
    const missions = document.createElement("span");
    missions.append("Missions: ");
    const missionsValue = document.createElement("b");
    missionsValue.textContent = String(cu.missionsCompleted);
    missions.appendChild(missionsValue);
    stats.append(kills, missions);

    const xpRow = document.createElement("div");
    xpRow.className = "campaign-screen__xp-row";

    const xpTrack = document.createElement("div");
    xpTrack.className = "campaign-screen__xp-bar-track";
    const xpFill = document.createElement("div");
    xpFill.className = "campaign-screen__xp-bar-fill";
    xpFill.style.width = `${xpPercent}%`;
    xpTrack.appendChild(xpFill);

    const xpText = document.createElement("span");
    xpText.className = "campaign-screen__xp-label";
    xpText.textContent = xpLabel;

    xpRow.append(xpTrack, xpText);
    card.append(header, stats, xpRow);

    return card;
  }

  private buildMissionsPanel(campaign: Campaign): HTMLDivElement {
    const panel = document.createElement("div");
    panel.className = "campaign-screen__panel campaign-screen__panel--missions";

    const title = document.createElement("div");
    title.className = "campaign-screen__panel-title";
    title.textContent = "AVAILABLE MISSIONS";
    panel.appendChild(title);

    if (mapLayouts.length === 0) {
      const empty = document.createElement("div");
      empty.className = "campaign-screen__mission-objective";
      empty.textContent = "No mission layouts are available.";
      panel.appendChild(empty);
      return panel;
    }

    for (const layout of mapLayouts) {
      const card = this.buildMissionCard(layout, campaign);
      panel.appendChild(card);
    }

    return panel;
  }

  private buildMissionCard(layout: MapLayout, campaign: Campaign): HTMLButtonElement {
    const card = document.createElement("button");
    card.type = "button";
    const isCompleted = campaign.completedMapIds.includes(layout.id);
    const isSelected = layout.id === this.selectedMapId;

    card.className = "campaign-screen__mission-card";
    if (isSelected) {
      card.classList.add("campaign-screen__mission-card--selected");
    }
    if (isCompleted) {
      card.classList.add("campaign-screen__mission-card--completed");
    }

    card.setAttribute("aria-pressed", String(isSelected));

    const typeLabel = layout.missionType === "extract" ? "EXTRACT" : "ELIMINATE";
    const header = document.createElement("div");
    header.className = "campaign-screen__mission-header";
    const name = document.createElement("span");
    name.className = "campaign-screen__mission-name";
    name.textContent = layout.name;
    const type = document.createElement("span");
    type.className = `campaign-screen__mission-type campaign-screen__mission-type--${layout.missionType}`;
    type.textContent = typeLabel;
    header.append(name, type);
    if (isCompleted) {
      const done = document.createElement("span");
      done.className = "campaign-screen__badge campaign-screen__badge--done";
      done.textContent = "✓ COMPLETE";
      header.appendChild(done);
    }
    const objective = document.createElement("div");
    objective.className = "campaign-screen__mission-objective";
    objective.textContent = layout.objective;
    card.append(header, objective);

    card.addEventListener("click", () => {
      this.selectedMapId = layout.id;
      // Refresh selection styling without full re-render
      const allCards = this.root.querySelectorAll(".campaign-screen__mission-card");
      allCards.forEach((c) => {
        c.classList.remove("campaign-screen__mission-card--selected");
        if (c instanceof HTMLButtonElement) {
          c.setAttribute("aria-pressed", "false");
        }
      });
      card.classList.add("campaign-screen__mission-card--selected");
      card.setAttribute("aria-pressed", "true");
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
  const linesHtml = unitLines.map((l) => `<div class="campaign-screen__debrief-line">${escapeHtml(l)}</div>`).join("");
  return `
    <div class="${resultClass}">
      <div class="campaign-screen__debrief-title">${resultText} — ${escapeHtml(mapName)}</div>
      <div class="campaign-screen__debrief-credits">Credits earned: +${creditsEarned}</div>
      ${linesHtml}
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
