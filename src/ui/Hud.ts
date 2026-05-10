import type { BattleState } from "../game/BattleState";
import type { BattlePhase, MissionType } from "../game/types";
import { getTheme } from "../game/Units";

export class Hud {
  private readonly root: HTMLDivElement;
  private readonly missionResultLabel: HTMLDivElement;
  private readonly operationTitle: HTMLDivElement;
  private readonly mapSubtitle: HTMLDivElement;
  private readonly teamPill: HTMLDivElement;
  private readonly turnStrip: HTMLDivElement;
  private readonly phaseStrip: HTMLDivElement;
  private readonly selectedPanel: HTMLDivElement;
  private readonly roster: HTMLDivElement;
  private readonly hoverIntel: HTMLDivElement;
  private readonly tileIntel: HTMLDivElement;
  private readonly sightIntel: HTMLDivElement;
  private readonly aimIntel: HTMLDivElement;
  private readonly shotIntel: HTMLDivElement;
  private readonly explosionIntel: HTMLDivElement;
  private readonly ordersLabel: HTMLDivElement;
  private readonly shortcutsHint: HTMLDivElement;
  private readonly cancelButton: HTMLButtonElement;
  private readonly fireButton: HTMLButtonElement;
  private readonly abilityPanel: HTMLDivElement;
  private readonly overwatchButton: HTMLButtonElement;
  private readonly endTurnButton: HTMLButtonElement;
  private readonly restartButton: HTMLButtonElement;
  private readonly actionsRow: HTMLDivElement;
  private readonly reloadButton: HTMLButtonElement;
  private readonly toastEl: HTMLDivElement;
  private toastHideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly battleState: BattleState) {
    this.root = document.createElement("div");
    this.root.className = "hud";

    this.missionResultLabel = document.createElement("div");
    this.missionResultLabel.className = "hud__mission-banner";
    this.missionResultLabel.style.display = "none";

    const header = document.createElement("header");
    header.className = "hud__header";

    this.operationTitle = document.createElement("div");
    this.operationTitle.className = "hud__operation-title";

    this.mapSubtitle = document.createElement("div");
    this.mapSubtitle.className = "hud__map-subtitle";

    this.teamPill = document.createElement("div");
    this.teamPill.className = "hud__team-pill";

    header.append(this.operationTitle, this.mapSubtitle, this.teamPill);

    const statusRow = document.createElement("div");
    statusRow.className = "hud__status-row";
    this.turnStrip = document.createElement("div");
    this.turnStrip.className = "hud__turn-strip";
    this.phaseStrip = document.createElement("div");
    this.phaseStrip.className = "hud__phase-chip";
    statusRow.append(this.turnStrip, this.phaseStrip);

    const squadSection = this.makeSection("Squad", "hud__section--squad");
    this.roster = document.createElement("div");
    this.roster.className = "hud__roster";
    squadSection.appendChild(this.roster);

    const operatorSection = this.makeSection("Operator", "hud__section--operator");
    this.selectedPanel = document.createElement("div");
    this.selectedPanel.className = "hud__selected-panel";
    operatorSection.appendChild(this.selectedPanel);

    const battlefieldSection = this.makeSection("Battlefield", "hud__section--field");
    this.hoverIntel = document.createElement("div");
    this.hoverIntel.className = "hud__intel hud__intel--hover";
    this.tileIntel = document.createElement("div");
    this.tileIntel.className = "hud__intel hud__intel--tile";
    battlefieldSection.append(this.hoverIntel, this.tileIntel);

    const combatSection = this.makeSection("Combat feed", "hud__section--combat");
    this.sightIntel = document.createElement("div");
    this.sightIntel.className = "hud__intel hud__intel--sight";
    this.aimIntel = document.createElement("div");
    this.aimIntel.className = "hud__intel hud__intel--aim";
    this.shotIntel = document.createElement("div");
    this.shotIntel.className = "hud__intel hud__intel--shot";
    this.explosionIntel = document.createElement("div");
    this.explosionIntel.className = "hud__intel hud__intel--explosion";
    combatSection.append(this.sightIntel, this.aimIntel, this.shotIntel, this.explosionIntel);

    const ordersSection = document.createElement("div");
    ordersSection.className = "hud__section hud__section--orders";
    this.ordersLabel = document.createElement("div");
    this.ordersLabel.className = "hud__orders";
    this.shortcutsHint = document.createElement("div");
    this.shortcutsHint.className = "hud__shortcuts";
    this.shortcutsHint.textContent =
      "1–3 squad · Tab cycle · [ ] rotate camera · L reload · E end · F fire · O overwatch · Esc cancel · R restart";
    ordersSection.append(this.ordersLabel, this.shortcutsHint);

    this.actionsRow = document.createElement("div");
    this.actionsRow.className = "hud__actions";

    this.cancelButton = this.makeActionButton("Cancel", "Esc", ["hud__btn", "hud__btn--ghost", "hud__btn--cancel"], () =>
      this.battleState.cancelTacticalAction()
    );
    this.cancelButton.style.display = "none";

    this.reloadButton = this.makeActionButton("Reload", "L", ["hud__btn", "hud__btn--reload"], () =>
      this.battleState.reloadWeapon()
    );

    this.fireButton = this.makeActionButton("Fire", "F", ["hud__btn", "hud__btn--fire"], () =>
      this.battleState.fireAtSelectedTarget()
    );

    this.abilityPanel = document.createElement("div");
    this.abilityPanel.className = "hud__abilities";

    this.overwatchButton = this.makeActionButton("Overwatch", "O", ["hud__btn", "hud__btn--overwatch"], () =>
      this.battleState.selectAbility("overwatch")
    );

    this.endTurnButton = this.makeActionButton("End turn", "E", ["hud__btn", "hud__btn--primary"], () =>
      this.battleState.endTurn()
    );

    this.restartButton = this.makeActionButton("Restart", "R", ["hud__btn", "hud__btn--ghost"], () =>
      this.battleState.restartMission()
    );
    this.restartButton.style.display = "none";

    this.actionsRow.append(
      this.cancelButton,
      this.reloadButton,
      this.fireButton,
      this.overwatchButton,
      this.endTurnButton,
      this.restartButton
    );

    this.root.append(
      this.missionResultLabel,
      header,
      statusRow,
      squadSection,
      operatorSection,
      battlefieldSection,
      combatSection,
      ordersSection,
      this.abilityPanel,
      this.actionsRow
    );
    document.body.appendChild(this.root);

    this.toastEl = document.createElement("div");
    this.toastEl.className = "tactical-toast";
    document.body.appendChild(this.toastEl);

    this.battleState.subscribe(() => this.render());
    this.render();
  }

  private makeSection(titleText: string, extraClass?: string): HTMLElement {
    const section = document.createElement("section");
    section.className = extraClass ? `hud__section ${extraClass}` : "hud__section";
    const heading = document.createElement("h3");
    heading.className = "hud__section-title";
    heading.textContent = titleText;
    section.appendChild(heading);
    return section;
  }

  private makeActionButton(label: string, shortcut: string, classes: string[], onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = classes.join(" ");
    const labelSpan = document.createElement("span");
    labelSpan.className = "hud__btn-label";
    labelSpan.textContent = label;
    const kbd = document.createElement("kbd");
    kbd.className = "hud__kbd";
    kbd.textContent = shortcut;
    button.append(labelSpan, kbd);
    button.addEventListener("click", onClick);
    return button;
  }

  private showTransientToast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add("is-visible");
    if (this.toastHideTimer !== null) {
      window.clearTimeout(this.toastHideTimer);
    }
    this.toastHideTimer = window.setTimeout(() => {
      this.toastEl.classList.remove("is-visible");
      this.toastHideTimer = null;
    }, 2700);
  }

  private render(): void {
    const feedback = this.battleState.popFeedback();
    if (feedback !== undefined) {
      this.showTransientToast(feedback);
    }

    const theme = getTheme();
    const objective = objectiveLabel(this.battleState.missionType);
    this.operationTitle.textContent = theme.name;
    this.mapSubtitle.textContent = `${this.battleState.mapLayout.name} · ${objective}: ${this.battleState.mapLayout.objective}`;
    this.renderMissionResult();
    this.teamPill.textContent = capitalize(this.battleState.currentTeam);
    this.teamPill.dataset.team = this.battleState.currentTeam;

    this.renderTurnAndPhase();

    this.renderSelectedPanel();
    this.renderHoverIntel();
    this.renderTileIntel();
    this.renderSightIntel();
    this.renderAimIntel();
    this.renderShotIntel();
    this.renderExplosionIntel();
    this.renderOrders();
    this.renderAbilityButtons();
    this.renderRoster();
    this.syncPrimaryActions();
  }

  private renderSelectedPanel(): void {
    this.selectedPanel.replaceChildren();
    const selectedUnit = this.battleState.selectedUnit;

    if (selectedUnit === undefined) {
      const empty = document.createElement("p");
      empty.className = "hud__empty-hint";
      empty.textContent = "Select a soldier from the squad list or battlefield.";
      this.selectedPanel.appendChild(empty);
      return;
    }

    const title = document.createElement("div");
    title.className = "hud__operator-name";
    title.textContent = selectedUnit.name;

    const role = document.createElement("div");
    role.className = "hud__operator-role";
    role.textContent = `${capitalize(selectedUnit.unitClass)} · ${selectedUnit.weapon.name}`;

    const stats = document.createElement("div");
    stats.className = "hud__stat-grid";
    stats.append(
      this.statRow("HP", `${selectedUnit.hp} / ${selectedUnit.maxHp}`, hpBarLevel(selectedUnit.hp, selectedUnit.maxHp)),
      this.statRow("AP", `${selectedUnit.actionPoints} / ${selectedUnit.maxActionPoints}`, ""),
      this.statRow("MP", `${selectedUnit.movementPoints} / ${selectedUnit.maxMovementPoints}`, ""),
      this.statRow("Mag", `${selectedUnit.weapon.ammo} / ${selectedUnit.weapon.clipSize}`, ""),
      this.statRow("Will", `${selectedUnit.will} / ${selectedUnit.maxWill}`, "")
    );

    const kitTitle = document.createElement("div");
    kitTitle.className = "hud__inventory-title";
    kitTitle.textContent = "Kit";

    const kitList = document.createElement("ul");
    kitList.className = "hud__inventory-list";

    if (selectedUnit.inventory.length === 0) {
      const li = document.createElement("li");
      li.className = "hud__inventory-row hud__inventory-row--empty";
      li.textContent = "No expendable gear.";
      kitList.appendChild(li);
    } else {
      for (const item of selectedUnit.inventory) {
        const li = document.createElement("li");
        li.className = "hud__inventory-row";
        li.dataset.category = item.category;

        const itemName = document.createElement("span");
        itemName.className = "hud__inventory-name";
        itemName.textContent = item.name;

        const qty = document.createElement("span");
        qty.className = "hud__inventory-qty";
        qty.textContent = `${item.quantity}/${item.maxQuantity}`;

        li.append(itemName, qty);
        kitList.appendChild(li);
      }
    }

    this.selectedPanel.append(title, role, stats, kitTitle, kitList);
  }

  private statRow(label: string, value: string, hpLevel: string): HTMLElement {
    const row = document.createElement("div");
    row.className = "hud__stat-row";
    const lab = document.createElement("span");
    lab.className = "hud__stat-label";
    lab.textContent = label;
    const valBlock = document.createElement("div");
    valBlock.className = "hud__stat-val-block";
    const val = document.createElement("span");
    val.className = "hud__stat-value";
    val.textContent = value;
    valBlock.appendChild(val);
    if (label === "HP" && hpLevel !== "") {
      const bar = document.createElement("div");
      bar.className = `hud__mini-bar ${hpLevel}`;
      valBlock.appendChild(bar);
    }
    row.append(lab, valBlock);
    return row;
  }

  private renderTurnAndPhase(): void {
    if (this.battleState.missionResult !== "in_progress") {
      this.turnStrip.textContent = "Mission concluded";
      this.turnStrip.dataset.act = "neutral";
      this.phaseStrip.textContent = "";
      return;
    }

    if (this.battleState.currentTeam === "enemy") {
      this.turnStrip.textContent = "Enemy activity";
      this.turnStrip.dataset.act = "enemy";
      this.phaseStrip.textContent = "Hostiles are resolving — watch the board.";
      return;
    }

    this.turnStrip.textContent = "Your turn — Commander";
    this.turnStrip.dataset.act = "player";
    this.phaseStrip.textContent = phaseRibbonCopy(this.battleState.phase);
  }

  private renderOrders(): void {
    const selectedUnit = this.battleState.selectedUnit;

    let orders =
      selectedUnit === undefined
        ? "Select a soldier to plot movement."
        : this.battleState.phase === "grenade_aiming"
          ? "Click a tile to target, then Throw. Esc cancels."
          : this.battleState.phase === "aiming"
            ? "Press Fire or switch targets. Reload (L) if the mag is dry. Esc cancels aim."
            : this.battleState.phase === "ability_select"
              ? "Select a target for the ability. Esc cancels."
              : "Hover tiles for route preview. Click a highlighted tile to move, or a visible enemy to aim.";
    this.ordersLabel.textContent = orders;
  }

  private syncPrimaryActions(): void {
    const selectedUnit = this.battleState.selectedUnit;
    const magDry =
      selectedUnit !== undefined && selectedUnit.weapon.ammo <= 0 && this.battleState.phase === "aiming";

    this.fireButton.disabled =
      selectedUnit === undefined ||
      magDry ||
      selectedUnit.actionPoints < 1 ||
      this.battleState.aimPreview === null ||
      this.battleState.phase !== "aiming";

    const canReload =
      selectedUnit !== undefined &&
      this.battleState.currentTeam === "player" &&
      this.battleState.missionResult === "in_progress" &&
      (this.battleState.phase === "moving" || this.battleState.phase === "selecting") &&
      selectedUnit.weapon.ammo < selectedUnit.weapon.clipSize &&
      selectedUnit.actionPoints >= 1;

    this.reloadButton.disabled = !canReload;
    this.overwatchButton.disabled =
      selectedUnit === undefined ||
      this.battleState.currentTeam !== "player" ||
      selectedUnit.actionPoints < 1 ||
      selectedUnit.isOverwatch ||
      selectedUnit.weapon.ammo <= 0;
    this.endTurnButton.disabled = this.battleState.currentTeam !== "player";

    const showCancel =
      this.battleState.currentTeam === "player" &&
      this.battleState.missionResult === "in_progress" &&
      (this.battleState.phase === "aiming" ||
        this.battleState.phase === "grenade_aiming" ||
        this.battleState.phase === "ability_select");
    this.cancelButton.style.display = showCancel ? "" : "none";
  }

  private renderAbilityButtons(): void {
    this.abilityPanel.replaceChildren();
    const selectedUnit = this.battleState.selectedUnit;
    if (selectedUnit === undefined) {
      return;
    }

    for (const ability of selectedUnit.abilities) {
      if (ability.uses <= 0 || ability.type === "overwatch") {
        continue;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "hud__btn hud__btn--ability";
      const labelSpan = document.createElement("span");
      labelSpan.className = "hud__btn-label";
      labelSpan.textContent = `${ability.name} (${ability.uses})`;
      button.appendChild(labelSpan);
      button.title = ability.description;
      button.disabled = selectedUnit.actionPoints < ability.apCost;
      button.addEventListener("click", () => {
        this.battleState.selectAbility(ability.type);
      });

      this.abilityPanel.appendChild(button);
    }

    if (this.battleState.phase === "grenade_aiming") {
      const throwButton = document.createElement("button");
      throwButton.type = "button";
      throwButton.className = "hud__btn hud__btn--ability hud__btn--throw";
      throwButton.textContent = "Throw";
      throwButton.addEventListener("click", () => {
        const ability = this.battleState.selectedAbility;
        if (ability?.type === "grenade") {
          this.battleState.throwGrenade();
        } else if (ability?.type === "flashbang") {
          this.battleState.throwFlashbang();
        } else if (ability?.type === "smoke") {
          this.battleState.throwSmoke();
        }
      });
      this.abilityPanel.appendChild(throwButton);
    }

    if (this.battleState.phase === "ability_select") {
      const ability = this.battleState.selectedAbility;
      if (ability?.type === "medkit") {
        const healButton = document.createElement("button");
        healButton.type = "button";
        healButton.className = "hud__btn hud__btn--ability hud__btn--heal";
        healButton.textContent = "Use Medkit";
        healButton.addEventListener("click", () => {
          if (this.battleState.selectedUnitId) {
            this.battleState.useMedkit(this.battleState.selectedUnitId);
          }
        });
        this.abilityPanel.appendChild(healButton);
      }
    }
  }

  private renderHoverIntel(): void {
    const hoverId = this.battleState.hoveredUnitId;
    if (hoverId === null) {
      this.hoverIntel.replaceChildren();
      this.hoverIntel.classList.add("is-empty");
      const placeholder = document.createElement("span");
      placeholder.className = "hud__intel-muted";
      placeholder.textContent = "Cursor: —";
      this.hoverIntel.appendChild(placeholder);
      return;
    }

    const unit = this.battleState.units.find((u) => u.id === hoverId);
    if (unit === undefined) {
      this.hoverIntel.textContent = "";
      return;
    }

    this.hoverIntel.classList.remove("is-empty");
    this.hoverIntel.replaceChildren();

    const row = document.createElement("div");
    row.className = "hud__hover-title";

    const badge = document.createElement("span");
    badge.className = `hud__team-tag hud__team-tag--${unit.team}`;
    badge.textContent = unit.team === "player" ? "Ally" : "Hostile";

    const name = document.createElement("span");
    name.textContent = unit.name;

    row.append(badge, name);

    const detail = document.createElement("div");
    detail.className = "hud__hover-detail";
    detail.textContent = `${capitalize(unit.unitClass)} · HP ${unit.hp}/${unit.maxHp} · ${unit.weapon.name}`;

    const hint = document.createElement("div");
    hint.className = "hud__intel-muted hud__hover-hint";
    hint.textContent =
      unit.team === "enemy" && this.battleState.currentTeam === "player"
        ? "Click to preview aim."
        : unit.team === "player"
          ? "Click to select."
          : "";

    this.hoverIntel.append(row, detail);
    if (hint.textContent) {
      this.hoverIntel.appendChild(hint);
    }
  }

  private renderTileIntel(): void {
    const tile = this.battleState.hoveredTile;
    if (tile === undefined) {
      this.tileIntel.classList.add("is-muted");
      this.tileIntel.textContent = "Tile: hover the grid for terrain data.";
      return;
    }

    this.tileIntel.classList.remove("is-muted");
    const pathCost = this.battleState.getPathCostForSelectedUnit(tile);
    const coverLabel = tile.cover === 0 ? "None" : tile.cover === 1 ? "Half" : "Full";
    const pathCostLabel = pathCost === undefined ? "—" : String(pathCost);
    this.tileIntel.textContent = `${tile.x}, ${tile.y} · ${capitalize(tile.terrain)} · Cover ${coverLabel} · Move cost ${tile.moveCost} · Path MP ${pathCostLabel}`;
  }

  private renderSightIntel(): void {
    const sightlines = this.battleState.getSightlinesForSelectedUnit();
    if (this.battleState.selectedUnit === undefined) {
      this.sightIntel.textContent = "LoS: select an operator.";
      return;
    }

    const visibleEnemyNames = sightlines
      .filter((sightline) => sightline.visible)
      .map((sightline) => {
        const target = this.battleState.units.find((u) => u.id === sightline.targetUnitId);
        const preview = this.battleState
          .getTargetPreviewsForSelectedUnit()
          .find((candidate) => candidate.targetUnitId === sightline.targetUnitId);

        if (target === undefined || preview === undefined) {
          return undefined;
        }

        return `${target.name} ${getCoverPreviewLabel(preview.cover)}`;
      })
      .filter((label): label is string => label !== undefined);

    this.sightIntel.textContent =
      visibleEnemyNames.length === 0 ? "LoS: no contacts." : `Visible: ${visibleEnemyNames.join(" · ")}`;
  }

  private renderAimIntel(): void {
    const preview = this.battleState.aimPreview;
    if (preview === null) {
      this.aimIntel.textContent = "Aim: no target selected.";
      return;
    }

    const shooter = this.battleState.selectedUnit;
    if (shooter !== undefined && shooter.weapon.ammo <= 0 && this.battleState.phase === "aiming") {
      this.aimIntel.textContent = `${preview.targetName} · MAG EMPTY — Reload (L), ${preview.hitChance}% preview · ${getCoverPreviewLabel(preview.cover)} · ${capitalize(preview.rangeBand)} · ${preview.damage} dmg`;
      return;
    }

    this.aimIntel.textContent = `${preview.targetName} · ${preview.hitChance}% to hit · ${getCoverPreviewLabel(preview.cover)} · ${capitalize(preview.rangeBand)} · ${preview.damage} dmg · mag ${shooter?.weapon.ammo ?? "—"}/${shooter?.weapon.clipSize ?? "—"}`;
  }

  private renderShotIntel(): void {
    const result = this.battleState.lastShotResult;
    if (result === null) {
      this.shotIntel.textContent = "Last shot: —";
      return;
    }

    const outcome = result.hit
      ? `${result.damage} dmg${result.killed ? " · eliminated" : ` · ${result.targetHp} HP remaining`}`
      : "miss";
    this.shotIntel.textContent = `${result.targetName}: ${outcome} · roll ${result.roll} vs ${result.hitChance}`;
  }

  private renderExplosionIntel(): void {
    const result = this.battleState.lastExplosionResult;
    if (result === null) {
      this.explosionIntel.textContent = "Ordnance: —";
      return;
    }

    const hits = result.unitsHit.map((h) => {
      const unit = this.battleState.units.find((u) => u.id === h.unitId);
      return unit ? `${unit.name} (${h.damage} dmg${h.killed ? ", down" : ""})` : `${h.unitId} (${h.damage} dmg)`;
    }).join(", ");

    this.explosionIntel.textContent = hits ? `Blast: ${hits}` : "Blast: no effect";
  }

  private renderRoster(): void {
    this.roster.replaceChildren();

    this.battleState.units
      .filter((unit) => unit.team === "player")
      .forEach((unit, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = unit.id === this.battleState.selectedUnitId ? "hud__unit is-selected" : "hud__unit";
        button.disabled = this.battleState.currentTeam !== "player";
        button.addEventListener("click", () => this.battleState.selectUnit(unit.id));

        const top = document.createElement("div");
        top.className = "hud__unit-top";

        const shortcut = document.createElement("kbd");
        shortcut.className = "hud__kbd hud__kbd--inline";
        shortcut.textContent = String(index + 1);

        const name = document.createElement("span");
        name.className = "hud__unit-name";
        const statusIcons: string[] = [];
        if (unit.isOverwatch) statusIcons.push("OW");
        if (unit.isSuppressed) statusIcons.push("SUP");
        if (unit.isPanicked) statusIcons.push("!");
        if (unit.statusEffects.some((e) => e.type === "stunned")) statusIcons.push("STUN");
        name.textContent = `${unit.name}${statusIcons.length ? ` · ${statusIcons.join("/")}` : ""}`;

        top.append(shortcut, name);

        const barWrap = document.createElement("div");
        barWrap.className = "hud__unit-hp-track";
        const barFill = document.createElement("div");
        barFill.className = "hud__unit-hp-fill";
        const ratio = unit.maxHp === 0 ? 0 : unit.hp / unit.maxHp;
        barFill.style.width = `${Math.round(ratio * 100)}%`;

        barWrap.appendChild(barFill);

        const stats = document.createElement("div");
        stats.className = "hud__unit-stats";
        stats.textContent = `HP ${unit.hp}/${unit.maxHp} · MP ${unit.movementPoints}/${unit.maxMovementPoints} · Will ${unit.will}/${unit.maxWill}`;

        button.append(top, barWrap, stats);
        this.roster.appendChild(button);
      });
  }

  private renderMissionResult(): void {
    const result = this.battleState.missionResult;
    if (result === "in_progress") {
      this.missionResultLabel.style.display = "none";
      this.missionResultLabel.classList.remove("hud__mission-banner--win", "hud__mission-banner--loss");
      this.restartButton.style.display = "none";
      this.endTurnButton.style.display = "";
      return;
    }

    this.missionResultLabel.style.display = "";
    this.restartButton.style.display = "";
    this.endTurnButton.style.display = "none";
    this.missionResultLabel.classList.toggle("hud__mission-banner--win", result === "victory");
    this.missionResultLabel.classList.toggle("hud__mission-banner--loss", result === "defeat");

    const extractWin =
      this.battleState.missionType === "extract" &&
      result === "victory" &&
      this.battleState.extractZone !== null;

    const message =
      result === "victory"
        ? extractWin
          ? "EXTRACTION COMPLETE — squad secured."
          : "ENGAGEMENT WON — sector clear."
        : "SQUAD LOST — mission abort.";
    this.missionResultLabel.textContent = message;
  }

  dispose(): void {
    if (this.toastHideTimer !== null) {
      window.clearTimeout(this.toastHideTimer);
    }
    this.toastEl.remove();
    this.root.remove();
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getCoverPreviewLabel(cover: number): string {
  if (cover <= 0) {
    return "flanked";
  }

  if (cover === 1) {
    return "half cover";
  }

  return "full cover";
}

function hpBarLevel(hp: number, maxHp: number): string {
  const ratio = maxHp === 0 ? 0 : hp / maxHp;
  if (ratio >= 0.66) return "is-high";
  if (ratio >= 0.33) return "is-mid";
  return "is-low";
}

function phaseRibbonCopy(phase: BattlePhase): string {
  switch (phase) {
    case "selecting":
      return "Awaiting orders — pick an operative.";
    case "moving":
      return "Movement — blue tiles are reachable.";
    case "aiming":
      return "Targeting — confirm shot or cancel.";
    case "grenade_aiming":
      return "Ordinance — paint impact, then Throw.";
    case "ability_select":
      return "Ability — choose a valid ally.";
    default:
      return "";
  }
}

function objectiveLabel(missionType: MissionType): string {
  return missionType === "extract" ? "Extract" : "Eliminate";
}
