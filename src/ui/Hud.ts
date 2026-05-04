import type { BattleState } from "../game/BattleState";

export class Hud {
  private readonly root: HTMLDivElement;
  private readonly teamLabel: HTMLDivElement;
  private readonly selectedLabel: HTMLDivElement;
  private readonly endTurnButton: HTMLButtonElement;

  constructor(private readonly battleState: BattleState) {
    this.root = document.createElement("div");
    this.root.className = "hud";

    this.teamLabel = document.createElement("div");
    this.teamLabel.className = "hud__team";

    this.selectedLabel = document.createElement("div");
    this.selectedLabel.className = "hud__selected";

    this.endTurnButton = document.createElement("button");
    this.endTurnButton.type = "button";
    this.endTurnButton.textContent = "End Turn";
    this.endTurnButton.addEventListener("click", () => this.battleState.endTurn());

    this.root.append(this.teamLabel, this.selectedLabel, this.endTurnButton);
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
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
