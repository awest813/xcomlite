import { ArcRotateCamera, Engine, Scene, Vector3 } from "@babylonjs/core";
import { voidSovereignsTheme, mapLayouts, defaultMapLayout } from "./data/BattleMap";
import { BattleState } from "./game/BattleState";
import { installDebugHooks } from "./game/DebugHooks";
import { setTheme } from "./game/Units";
import { TurnController } from "./game/TurnController";
import { TacticalScene } from "./render/TacticalScene";
import { Hud } from "./ui/Hud";
import "./style.css";

setTheme(voidSovereignsTheme);

class App {
  private battleState: BattleState | null = null;
  private tacticalScene: TacticalScene | null = null;
  private engine: Engine;
  private scene: Scene;
  private camera: ArcRotateCamera;
  private canvas: HTMLCanvasElement;
  private hud: Hud | null = null;
  private turnController: TurnController | null = null;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.id = "gameCanvas";
    document.body.appendChild(this.canvas);

    this.engine = new Engine(this.canvas, true);
    this.scene = new Scene(this.engine);
    this.camera = new ArcRotateCamera("TacticalCamera", Math.PI / 4, Math.PI / 3, 16, Vector3.Zero(), this.scene);

    this.loadMap(defaultMapLayout);
    this.createMapSelector();

    window.addEventListener("resize", () => this.engine.resize());
  }

  private loadMap(layout: typeof defaultMapLayout): void {
    this.battleState?.grid.forEach((tile) => { tile.occupiedBy = null; });

    this.battleState = new BattleState(layout);
    if (this.turnController) {
      this.turnController.dispose();
    }
    this.turnController = new TurnController(this.battleState);

    if (this.tacticalScene) {
      this.tacticalScene.dispose();
    }
    this.tacticalScene = new TacticalScene(this.scene, this.canvas, this.camera, this.battleState);

    if (this.hud) {
      this.hud.dispose();
    }
    this.hud = new Hud(this.battleState);

    installDebugHooks(this.battleState, this.scene, (deltaMs) => this.tacticalScene!.update(deltaMs));

    this.engine.runRenderLoop(() => {
      this.tacticalScene!.update(this.engine.getDeltaTime());
      this.scene.render();
    });
  }

  private createMapSelector(): void {
    const selector = document.createElement("div");
    selector.className = "map-selector";

    const label = document.createElement("span");
    label.textContent = "Map: ";
    label.style.marginRight = "8px";
    label.style.color = "#a0a0a0";
    selector.appendChild(label);

    for (const layout of mapLayouts) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = layout.name;
      button.className = "map-selector__button";
      button.addEventListener("click", () => {
        this.loadMap(layout);
      });
      selector.appendChild(button);
    }

    document.body.appendChild(selector);
  }
}

new App();
