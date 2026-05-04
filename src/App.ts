import { ArcRotateCamera, Engine, Scene, Vector3 } from "@babylonjs/core";
import { BattleState } from "./game/BattleState";
import { installDebugHooks } from "./game/DebugHooks";
import { TurnController } from "./game/TurnController";
import { TacticalScene } from "./render/TacticalScene";
import { Hud } from "./ui/Hud";
import "./style.css";

class App {
  constructor() {
    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.id = "gameCanvas";
    document.body.appendChild(canvas);

    const engine = new Engine(canvas, true);
    const scene = new Scene(engine);
    const camera = new ArcRotateCamera("TacticalCamera", Math.PI / 4, Math.PI / 3, 16, Vector3.Zero(), scene);

    const battleState = new BattleState();
    new TurnController(battleState);
    const tacticalScene = new TacticalScene(scene, canvas, camera, battleState);
    new Hud(battleState);
    installDebugHooks(battleState, scene, (deltaMs) => tacticalScene.update(deltaMs));

    engine.runRenderLoop(() => {
      tacticalScene.update(engine.getDeltaTime());
      scene.render();
    });

    window.addEventListener("resize", () => engine.resize());
  }
}

new App();
