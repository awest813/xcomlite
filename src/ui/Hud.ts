import type { BattleState } from "../game/BattleState";

export class Hud {
  private readonly root: HTMLDivElement;
  private readonly teamLabel: HTMLDivElement;
  private readonly selectedLabel: HTMLDivElement;
  private readonly actionHint: HTMLDivElement;
  private readonly endTurnButton: HTMLButtonElement;
  private readonly resultOverlay: HTMLDivElement;

  constructor(private readonly battleState: BattleState) {
    this.root = document.createElement("div");
    this.root.className = "hud";

    this.teamLabel = document.createElement("div");
    this.teamLabel.className = "hud__team";

    this.selectedLabel = document.createElement("div");
    this.selectedLabel.className = "hud__selected";

    this.actionHint = document.createElement("div");
    this.actionHint.className = "hud__hint";

    this.endTurnButton = document.createElement("button");
    this.endTurnButton.type = "button";
    this.endTurnButton.textContent = "End Turn";
    this.endTurnButton.addEventListener("click", () => this.battleState.endTurn());

    this.root.append(this.teamLabel, this.selectedLabel, this.actionHint, this.endTurnButton);
    document.body.appendChild(this.root);

    this.resultOverlay = document.createElement("div");
    this.resultOverlay.className = "result-overlay";
    this.resultOverlay.style.display = "none";
    document.body.appendChild(this.resultOverlay);

    this.battleState.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const selectedUnit = this.battleState.selectedUnit;
    const result = this.battleState.getBattleResult();

    this.teamLabel.textContent = `Team: ${capitalize(this.battleState.currentTeam)}`;

    if (selectedUnit === undefined) {
      this.selectedLabel.textContent = "Selected: None";
      this.actionHint.textContent = "";
    } else {
      this.selectedLabel.textContent =
        `${selectedUnit.name} | HP ${selectedUnit.hp}/${selectedUnit.maxHp} | AP ${selectedUnit.actionPoints}/${selectedUnit.maxActionPoints} | MP ${selectedUnit.movementPoints}/${selectedUnit.maxMovementPoints}`;

      const attackable = this.battleState.getAttackableUnits(selectedUnit);
      if (attackable.length > 0 && selectedUnit.actionPoints > 0) {
        this.actionHint.textContent = `${attackable.length} enem${attackable.length === 1 ? "y" : "ies"} in range — click to shoot`;
      } else if (selectedUnit.actionPoints <= 0) {
        this.actionHint.textContent = "Out of AP — move or end turn";
      } else {
        this.actionHint.textContent = "No enemies in range";
      }
    }

    if (result !== "ongoing") {
      this.resultOverlay.style.display = "flex";
      this.resultOverlay.textContent = result === "victory" ? "VICTORY" : "DEFEAT";
      this.resultOverlay.className = `result-overlay result-overlay--${result}`;
      this.endTurnButton.disabled = true;
    }
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
