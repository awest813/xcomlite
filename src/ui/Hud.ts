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
  private readonly ordersLabel: HTMLDivElement;
  private readonly fireButton: HTMLButtonElement;
  private readonly endTurnButton: HTMLButtonElement;

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

    this.ordersLabel = document.createElement("div");
    this.ordersLabel.className = "hud__orders";

    this.fireButton = document.createElement("button");
    this.fireButton.type = "button";
    this.fireButton.className = "hud__fire";
    this.fireButton.textContent = "Fire";
    this.fireButton.addEventListener("click", () => this.battleState.fireAtSelectedTarget());

    this.endTurnButton = document.createElement("button");
    this.endTurnButton.type = "button";
    this.endTurnButton.textContent = "End Turn";
    this.endTurnButton.addEventListener("click", () => this.battleState.endTurn());

    this.root.append(
      this.teamLabel,
      this.selectedLabel,
      this.roster,
      this.tileIntel,
      this.sightIntel,
      this.aimIntel,
      this.shotIntel,
      this.ordersLabel,
      this.fireButton,
      this.endTurnButton
    );
    document.body.appendChild(this.root);

    this.battleState.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const selectedUnit = this.battleState.selectedUnit;
    this.teamLabel.textContent = `Team: ${capitalize(this.battleState.currentTeam)}`;
    this.selectedLabel.textContent =
      selectedUnit === undefined
        ? "Selected: None"
        : `${selectedUnit.name} | HP ${selectedUnit.hp}/${selectedUnit.maxHp} | AP ${selectedUnit.actionPoints}/${selectedUnit.maxActionPoints} | MP ${selectedUnit.movementPoints}/${selectedUnit.maxMovementPoints}`;
    this.ordersLabel.textContent =
      selectedUnit === undefined
        ? "Select a soldier to plot movement."
        : this.battleState.aimPreview === null
          ? "Hover tiles to preview route. Click a highlighted tile to move, or click a visible enemy to aim."
          : "Fire to resolve the shot, or pick another tile or soldier to cancel aim.";
    this.fireButton.disabled =
      selectedUnit === undefined || selectedUnit.actionPoints <= 0 || this.battleState.aimPreview === null;
    this.renderTileIntel();
    this.renderSightIntel();
    this.renderAimIntel();
    this.renderShotIntel();
    this.renderRoster();
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

    this.aimIntel.textContent = `Aim ${preview.targetName} | ${preview.hitChance}% | ${getCoverPreviewLabel(preview.cover)} | ${capitalize(preview.rangeBand)} range`;
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
        name.textContent = unit.name;

        const stats = document.createElement("span");
        stats.className = "hud__unit-stats";
        stats.textContent = `HP ${unit.hp}/${unit.maxHp}  MP ${unit.movementPoints}/${unit.maxMovementPoints}`;

        button.append(name, stats);
        this.roster.appendChild(button);
      });
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
