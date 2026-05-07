import type { BattleState } from "../game/BattleState";

export class Hud {
  private readonly root: HTMLDivElement;
  private readonly teamLabel: HTMLDivElement;
  private readonly selectedLabel: HTMLDivElement;
  private readonly roster: HTMLDivElement;
  private readonly tileIntel: HTMLDivElement;
  private readonly sightIntel: HTMLDivElement;
  private readonly aimIntel: HTMLDivElement;
  private readonly shotIntel: HTMLDivElement;
  private readonly explosionIntel: HTMLDivElement;
  private readonly ordersLabel: HTMLDivElement;
  private readonly fireButton: HTMLButtonElement;
  private readonly abilityPanel: HTMLDivElement;
  private readonly overwatchButton: HTMLButtonElement;
  private readonly endTurnButton: HTMLButtonElement;
  private readonly restartButton: HTMLButtonElement;
  private readonly missionResultLabel: HTMLDivElement;

  constructor(private readonly battleState: BattleState) {
    this.root = document.createElement("div");
    this.root.className = "hud";

    this.teamLabel = document.createElement("div");
    this.teamLabel.className = "hud__team";

    this.selectedLabel = document.createElement("div");
    this.selectedLabel.className = "hud__selected";

    this.roster = document.createElement("div");
    this.roster.className = "hud__roster";

    this.tileIntel = document.createElement("div");
    this.tileIntel.className = "hud__tile";

    this.sightIntel = document.createElement("div");
    this.sightIntel.className = "hud__sight";

    this.aimIntel = document.createElement("div");
    this.aimIntel.className = "hud__aim";

    this.shotIntel = document.createElement("div");
    this.shotIntel.className = "hud__shot";

    this.explosionIntel = document.createElement("div");
    this.explosionIntel.className = "hud__explosion";

    this.ordersLabel = document.createElement("div");
    this.ordersLabel.className = "hud__orders";

    this.fireButton = document.createElement("button");
    this.fireButton.type = "button";
    this.fireButton.className = "hud__fire";
    this.fireButton.textContent = "Fire";
    this.fireButton.addEventListener("click", () => this.battleState.fireAtSelectedTarget());

    this.abilityPanel = document.createElement("div");
    this.abilityPanel.className = "hud__abilities";

    this.overwatchButton = document.createElement("button");
    this.overwatchButton.type = "button";
    this.overwatchButton.className = "hud__overwatch";
    this.overwatchButton.textContent = "Overwatch";
    this.overwatchButton.addEventListener("click", () => this.battleState.selectAbility("overwatch"));

    this.endTurnButton = document.createElement("button");
    this.endTurnButton.type = "button";
    this.endTurnButton.textContent = "End Turn";
    this.endTurnButton.addEventListener("click", () => this.battleState.endTurn());

    this.restartButton = document.createElement("button");
    this.restartButton.type = "button";
    this.restartButton.className = "hud__restart";
    this.restartButton.textContent = "Restart";
    this.restartButton.addEventListener("click", () => this.battleState.restartMission());
    this.restartButton.style.display = "none";

    this.missionResultLabel = document.createElement("div");
    this.missionResultLabel.className = "hud__mission-result";
    this.missionResultLabel.style.display = "none";

    this.root.append(
      this.missionResultLabel,
      this.teamLabel,
      this.selectedLabel,
      this.roster,
      this.tileIntel,
      this.sightIntel,
      this.aimIntel,
      this.shotIntel,
      this.explosionIntel,
      this.ordersLabel,
      this.abilityPanel,
      this.fireButton,
      this.overwatchButton,
      this.endTurnButton,
      this.restartButton
    );
    document.body.appendChild(this.root);

    this.battleState.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const selectedUnit = this.battleState.selectedUnit;
    this.renderMissionResult();
    this.teamLabel.textContent = `Team: ${capitalize(this.battleState.currentTeam)}`;
    this.selectedLabel.textContent =
      selectedUnit === undefined
        ? "Selected: None"
        : `${selectedUnit.name} (${selectedUnit.unitClass}) | HP ${selectedUnit.hp}/${selectedUnit.maxHp} | AP ${selectedUnit.actionPoints}/${selectedUnit.maxActionPoints} | MP ${selectedUnit.movementPoints}/${selectedUnit.maxMovementPoints} | Will ${selectedUnit.will}/${selectedUnit.maxWill}`;
    this.ordersLabel.textContent =
      selectedUnit === undefined
        ? "Select a soldier to plot movement."
        : this.battleState.phase === "grenade_aiming"
          ? "Click a tile to target, then press Throw."
          : this.battleState.phase === "aiming"
            ? "Press Fire to shoot, or click another enemy to switch target."
            : this.battleState.phase === "ability_select"
              ? "Select a target for the ability."
              : "Hover tiles to preview route. Click a highlighted tile to move, or click a visible enemy to aim.";
    this.fireButton.disabled =
      selectedUnit === undefined || selectedUnit.actionPoints < 1 || this.battleState.aimPreview === null || this.battleState.phase !== "aiming";
    this.overwatchButton.disabled =
      selectedUnit === undefined || this.battleState.currentTeam !== "player" || selectedUnit.actionPoints < 1 || selectedUnit.isOverwatch;
    this.endTurnButton.disabled = this.battleState.currentTeam !== "player";
    this.renderAbilities(selectedUnit);
    this.renderTileIntel();
    this.renderSightIntel();
    this.renderAimIntel();
    this.renderShotIntel();
    this.renderExplosionIntel();
    this.renderRoster();
  }

  private renderAbilities(unit: typeof this.battleState.selectedUnit): void {
    this.abilityPanel.replaceChildren();
    if (unit === undefined) {
      return;
    }

    for (const ability of unit.abilities) {
      if (ability.uses <= 0 || ability.type === "overwatch") {
        continue;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "hud__ability";
      button.textContent = `${ability.name} (${ability.uses})`;
      button.title = ability.description;
      button.disabled = unit.actionPoints < ability.apCost;
      button.addEventListener("click", () => {
        this.battleState.selectAbility(ability.type);
      });

      this.abilityPanel.appendChild(button);
    }

    if (this.battleState.phase === "grenade_aiming") {
      const throwButton = document.createElement("button");
      throwButton.type = "button";
      throwButton.className = "hud__ability hud__ability--throw";
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
        healButton.className = "hud__ability hud__ability--heal";
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

  private renderTileIntel(): void {
    const tile = this.battleState.hoveredTile;
    if (tile === undefined) {
      this.tileIntel.textContent = "Tile: None";
      return;
    }

    const pathCost = this.battleState.getPathCostForSelectedUnit(tile);
    const coverLabel = tile.cover === 0 ? "None" : tile.cover === 1 ? "Half" : "Full";
    const pathCostLabel = pathCost === undefined ? "-" : String(pathCost);
    this.tileIntel.textContent = `Tile ${tile.x},${tile.y} | ${capitalize(tile.terrain)} | Cover ${coverLabel} | Move ${tile.moveCost} | Path ${pathCostLabel}`;
  }

  private renderSightIntel(): void {
    const sightlines = this.battleState.getSightlinesForSelectedUnit();
    if (this.battleState.selectedUnit === undefined) {
      this.sightIntel.textContent = "Sight: Select a soldier";
      return;
    }

    const visibleEnemyNames = sightlines
      .filter((sightline) => sightline.visible)
      .map((sightline) => {
        const target = this.battleState.units.find((unit) => unit.id === sightline.targetUnitId);
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
      visibleEnemyNames.length === 0 ? "Sight: No visible enemies" : `Sight: ${visibleEnemyNames.join(", ")}`;
  }

  private renderAimIntel(): void {
    const preview = this.battleState.aimPreview;
    if (preview === null) {
      this.aimIntel.textContent = "Aim: No target";
      return;
    }

    this.aimIntel.textContent = `Aim ${preview.targetName} | ${preview.hitChance}% | ${getCoverPreviewLabel(preview.cover)} | ${capitalize(preview.rangeBand)} range | DMG ${preview.damage}`;
  }

  private renderShotIntel(): void {
    const result = this.battleState.lastShotResult;
    if (result === null) {
      this.shotIntel.textContent = "Shot: None";
      return;
    }

    const outcome = result.hit
      ? `${result.damage} damage${result.killed ? " | killed" : ` | ${result.targetHp} HP left`}`
      : "miss";
    this.shotIntel.textContent = `Shot: ${result.targetName} | ${outcome} | roll ${result.roll}/${result.hitChance}`;
  }

  private renderExplosionIntel(): void {
    const result = this.battleState.lastExplosionResult;
    if (result === null) {
      this.explosionIntel.textContent = "Explosion: None";
      return;
    }

    const hits = result.unitsHit.map((h) => {
      const unit = this.battleState.units.find((u) => u.id === h.unitId);
      return unit ? `${unit.name} (${h.damage} dmg${h.killed ? ", killed" : ""})` : `${h.unitId} (${h.damage} dmg)`;
    }).join(", ");

    this.explosionIntel.textContent = hits ? `Explosion: ${hits}` : "Explosion: No units hit";
  }

  private renderRoster(): void {
    this.roster.replaceChildren();

    this.battleState.units
      .filter((unit) => unit.team === "player")
      .forEach((unit) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = unit.id === this.battleState.selectedUnitId ? "hud__unit is-selected" : "hud__unit";
        button.disabled = this.battleState.currentTeam !== "player";
        button.addEventListener("click", () => this.battleState.selectUnit(unit.id));

        const name = document.createElement("span");
        name.className = "hud__unit-name";
        const statusIcons: string[] = [];
        if (unit.isOverwatch) statusIcons.push("[OW]");
        if (unit.isSuppressed) statusIcons.push("[SUP]");
        if (unit.isPanicked) statusIcons.push("[PANIC]");
        if (unit.statusEffects.some((e) => e.type === "stunned")) statusIcons.push("[STUN]");
        name.textContent = `${unit.name} ${statusIcons.join(" ")}`;

        const stats = document.createElement("span");
        stats.className = "hud__unit-stats";
        stats.textContent = `HP ${unit.hp}/${unit.maxHp}  MP ${unit.movementPoints}/${unit.maxMovementPoints}  Will ${unit.will}/${unit.maxWill}`;

        button.append(name, stats);
        this.roster.appendChild(button);
      });
  }

  private renderMissionResult(): void {
    const result = this.battleState.missionResult;
    if (result === "in_progress") {
      this.missionResultLabel.style.display = "none";
      this.restartButton.style.display = "none";
      this.endTurnButton.style.display = "";
      return;
    }

    this.missionResultLabel.style.display = "";
    this.restartButton.style.display = "";
    this.endTurnButton.style.display = "none";

    const message = result === "victory"
      ? "MISSION COMPLETE - All hostiles eliminated!"
      : "MISSION FAILED - Squad wiped out!";
    this.missionResultLabel.textContent = message;
    this.missionResultLabel.style.color = result === "victory" ? "#4ade80" : "#f87171";
    this.missionResultLabel.style.fontSize = "1.2em";
    this.missionResultLabel.style.fontWeight = "bold";
    this.missionResultLabel.style.textAlign = "center";
    this.missionResultLabel.style.padding = "8px";
  }

  dispose(): void {
    this.root.remove();
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getCoverPreviewLabel(cover: number): string {
  if (cover <= 0) {
    return "(flanked)";
  }

  if (cover === 1) {
    return "(half cover)";
  }

  return "(full cover)";
}
