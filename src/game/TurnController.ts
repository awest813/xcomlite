import type { BattleState } from "./BattleState";

const ENEMY_TURN_DELAY_MS = 450;

export class TurnController {
  private enemyTurnQueued = false;

  constructor(private readonly battleState: BattleState) {
    this.battleState.subscribe(() => this.queueEnemyTurn());
  }

  private queueEnemyTurn(): void {
    if (this.battleState.currentTeam !== "enemy" || this.enemyTurnQueued) {
      return;
    }

    this.enemyTurnQueued = true;
    window.setTimeout(() => {
      this.enemyTurnQueued = false;
      this.battleState.runEnemyTurn();
    }, ENEMY_TURN_DELAY_MS);
  }
}
