import {
  ArcRotateCamera,
  AbstractMesh,
  Color3,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PointerEventTypes,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import { GRID_HEIGHT, GRID_WIDTH } from "../game/Grid";
import type { BattleState } from "../game/BattleState";
import type { GridPosition } from "../game/types";

declare global {
  interface Window {
    tactical_hover_path?: GridPosition[];
  }
}

type MeshMetadata =
  | { kind: "tile"; position: GridPosition }
  | { kind: "unit"; unitId: string };

const TILE_SIZE = 1;
const UNIT_MOVE_SPEED_TILES_PER_SECOND = 5;

interface UnitAnimation {
  waypoints: Vector3[];
  waypointIndex: number;
}

export class TacticalScene {
  private readonly tileMeshes = new Map<string, Mesh>();
  private readonly unitMeshes = new Map<string, Mesh>();
  private readonly tileMaterial: StandardMaterial;
  private readonly blockedTileMaterial: StandardMaterial;
  private readonly reachableMaterial: StandardMaterial;
  private readonly pathPreviewMaterial: StandardMaterial;
  private readonly selectedMaterial: StandardMaterial;
  private readonly halfCoverMaterial: StandardMaterial;
  private readonly fullCoverMaterial: StandardMaterial;
  private readonly playerMaterial: StandardMaterial;
  private readonly enemyMaterial: StandardMaterial;
  private hoveredPath: GridPosition[] = [];
  private readonly unitAnimations = new Map<string, UnitAnimation>();

  constructor(
    private readonly scene: Scene,
    canvas: HTMLCanvasElement,
    private readonly camera: ArcRotateCamera,
    private readonly battleState: BattleState
  ) {
    this.tileMaterial = this.createMaterial("tile-material", new Color3(0.22, 0.28, 0.24));
    this.blockedTileMaterial = this.createMaterial("blocked-tile-material", new Color3(0.18, 0.2, 0.19));
    this.reachableMaterial = this.createMaterial("reachable-material", new Color3(0.42, 0.65, 0.48));
    this.pathPreviewMaterial = this.createMaterial("path-preview-material", new Color3(0.78, 0.72, 0.36));
    this.pathPreviewMaterial.emissiveColor = new Color3(0.16, 0.14, 0.04);
    this.selectedMaterial = this.createMaterial("selected-material", new Color3(0.38, 0.52, 0.8));
    this.halfCoverMaterial = this.createMaterial("half-cover-material", new Color3(0.53, 0.47, 0.36));
    this.fullCoverMaterial = this.createMaterial("full-cover-material", new Color3(0.38, 0.38, 0.36));
    this.playerMaterial = this.createMaterial("player-material", new Color3(0.18, 0.42, 0.85));
    this.enemyMaterial = this.createMaterial("enemy-material", new Color3(0.78, 0.18, 0.16));

    this.setupCamera(canvas);
    this.setupLighting();
    this.renderGrid();
    this.renderUnits();
    this.setupPicking(canvas);
    this.battleState.subscribe(() => this.syncScene());
    this.syncScene();
  }

  private setupCamera(canvas: HTMLCanvasElement): void {
    this.camera.alpha = Math.PI / 4;
    this.camera.beta = Math.PI / 3;
    this.camera.radius = 15;
    this.camera.target = new Vector3(0, 0, 0);
    this.camera.lowerBetaLimit = 0.45;
    this.camera.upperBetaLimit = 1.35;
    this.camera.lowerRadiusLimit = 9;
    this.camera.upperRadiusLimit = 22;
    this.camera.attachControl(canvas, true);
  }

  private setupLighting(): void {
    const light = new HemisphericLight("tactical-light", new Vector3(0.4, 1, 0.3), this.scene);
    light.intensity = 0.85;
    this.scene.clearColor.set(0.04, 0.05, 0.055, 1);
  }

  private renderGrid(): void {
    this.battleState.grid.forEach((tile) => {
      const mesh = MeshBuilder.CreateBox(
        this.tileKey(tile),
        { width: 0.94, height: 0.06, depth: 0.94 },
        this.scene
      );
      mesh.position = this.toWorldPosition(tile, 0);
      mesh.material = tile.walkable ? this.tileMaterial : this.blockedTileMaterial;
      mesh.metadata = { kind: "tile", position: { x: tile.x, y: tile.y } } satisfies MeshMetadata;
      this.tileMeshes.set(this.tileKey(tile), mesh);

      if (tile.cover > 0) {
        const coverHeight = tile.cover >= 2 ? 0.74 : 0.38;
        const coverMesh = MeshBuilder.CreateBox(
          `cover-${tile.x}-${tile.y}`,
          { width: 0.62, height: coverHeight, depth: 0.22 },
          this.scene
        );
        coverMesh.position = this.toWorldPosition(tile, coverHeight / 2 + 0.04);
        coverMesh.material = tile.cover >= 2 ? this.fullCoverMaterial : this.halfCoverMaterial;
        coverMesh.isPickable = false;
      }
    });
  }

  private renderUnits(): void {
    this.battleState.units.forEach((unit) => {
      const mesh = MeshBuilder.CreateCylinder(
        unit.id,
        { diameterTop: 0.48, diameterBottom: 0.62, height: 0.75, tessellation: 18 },
        this.scene
      );
      mesh.position = this.toWorldPosition(unit.position, 0.42);
      mesh.material = unit.team === "player" ? this.playerMaterial : this.enemyMaterial;
      mesh.metadata = { kind: "unit", unitId: unit.id } satisfies MeshMetadata;
      this.unitMeshes.set(unit.id, mesh);
    });
  }

  private setupPicking(canvas: HTMLCanvasElement): void {
    canvas.addEventListener("click", () => {
      const mesh = this.scene.pick(this.scene.pointerX, this.scene.pointerY)?.pickedMesh;
      this.handlePickedMesh(mesh);
    });

    this.scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type !== PointerEventTypes.POINTERPICK) {
        if (pointerInfo.type === PointerEventTypes.POINTERMOVE) {
          const pickedMesh = this.scene.pick(this.scene.pointerX, this.scene.pointerY)?.pickedMesh;
          this.updateHoveredPath(pickedMesh);
        }
        return;
      }

      const mesh = pointerInfo.pickInfo?.pickedMesh ?? this.scene.pick(this.scene.pointerX, this.scene.pointerY)?.pickedMesh;
      this.handlePickedMesh(mesh);
    });
  }

  private handlePickedMesh(mesh: AbstractMesh | null | undefined): void {
      const metadata = mesh?.metadata as MeshMetadata | undefined;
      if (metadata?.kind === "unit") {
        this.battleState.selectUnit(metadata.unitId);
        return;
      }

      if (metadata?.kind === "tile") {
        this.battleState.moveSelectedUnit(metadata.position);
        this.hoveredPath = [];
        window.tactical_hover_path = [];
        this.syncTileHighlights();
      }
  }

  update(deltaMs: number): void {
    this.startQueuedMovementAnimations();
    this.updateMovementAnimations(deltaMs);
  }

  private updateHoveredPath(mesh: AbstractMesh | null | undefined): void {
    const metadata = mesh?.metadata as MeshMetadata | undefined;
    const nextPath = metadata?.kind === "tile" ? this.battleState.getPathForSelectedUnit(metadata.position) : [];

    if (this.arePathsEqual(this.hoveredPath, nextPath)) {
      return;
    }

    this.hoveredPath = nextPath;
    window.tactical_hover_path = nextPath;
    this.syncTileHighlights();
  }

  private syncScene(): void {
    this.startQueuedMovementAnimations();
    this.syncUnitPositions();
    this.syncTileHighlights();
  }

  private syncUnitPositions(): void {
    this.battleState.units.forEach((unit) => {
      const mesh = this.unitMeshes.get(unit.id);
      if (mesh !== undefined && !this.unitAnimations.has(unit.id)) {
        mesh.position = this.toWorldPosition(unit.position, 0.42);
      }
    });
  }

  private startQueuedMovementAnimations(): void {
    this.battleState.drainMovementEvents().forEach((event) => {
      const waypoints = event.path.map((position) => this.toWorldPosition(position, 0.42));
      if (waypoints.length < 2) {
        return;
      }

      const mesh = this.unitMeshes.get(event.unitId);
      if (mesh !== undefined) {
        mesh.position = waypoints[0].clone();
      }

      this.unitAnimations.set(event.unitId, {
        waypoints,
        waypointIndex: 1,
      });
    });
  }

  private updateMovementAnimations(deltaMs: number): void {
    const maxDistance = UNIT_MOVE_SPEED_TILES_PER_SECOND * (deltaMs / 1000);

    this.unitAnimations.forEach((animation, unitId) => {
      const mesh = this.unitMeshes.get(unitId);
      if (mesh === undefined) {
        this.unitAnimations.delete(unitId);
        return;
      }

      let remainingDistance = maxDistance;
      while (remainingDistance > 0 && animation.waypointIndex < animation.waypoints.length) {
        const target = animation.waypoints[animation.waypointIndex];
        const distanceToTarget = Vector3.Distance(mesh.position, target);

        if (distanceToTarget <= remainingDistance) {
          mesh.position = target.clone();
          animation.waypointIndex += 1;
          remainingDistance -= distanceToTarget;
        } else {
          const direction = target.subtract(mesh.position).normalize();
          mesh.position = mesh.position.add(direction.scale(remainingDistance));
          remainingDistance = 0;
        }
      }

      if (animation.waypointIndex >= animation.waypoints.length) {
        const unit = this.battleState.units.find((candidate) => candidate.id === unitId);
        if (unit !== undefined) {
          mesh.position = this.toWorldPosition(unit.position, 0.42);
        }
        this.unitAnimations.delete(unitId);
      }
    });
  }

  private syncTileHighlights(): void {
    const selectedUnit = this.battleState.selectedUnit;
    const reachableTiles = new Set(
      selectedUnit === undefined ? [] : this.battleState.getReachableTiles(selectedUnit).map((tile) => this.tileKey(tile))
    );
    const pathTiles = new Set(this.hoveredPath.map((position) => this.tileKey(position)));

    this.battleState.grid.forEach((tile) => {
      const mesh = this.tileMeshes.get(this.tileKey(tile));
      if (mesh === undefined) {
        return;
      }

      if (selectedUnit?.position.x === tile.x && selectedUnit.position.y === tile.y) {
        mesh.material = this.selectedMaterial;
      } else if (pathTiles.has(this.tileKey(tile))) {
        mesh.material = this.pathPreviewMaterial;
      } else if (reachableTiles.has(this.tileKey(tile))) {
        mesh.material = this.reachableMaterial;
      } else {
        mesh.material = tile.walkable ? this.tileMaterial : this.blockedTileMaterial;
      }
    });
  }

  private arePathsEqual(currentPath: GridPosition[], nextPath: GridPosition[]): boolean {
    return (
      currentPath.length === nextPath.length &&
      currentPath.every((position, index) => position.x === nextPath[index].x && position.y === nextPath[index].y)
    );
  }

  private createMaterial(name: string, color: Color3): StandardMaterial {
    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = color;
    material.specularColor = new Color3(0.08, 0.08, 0.08);
    return material;
  }

  private toWorldPosition(position: GridPosition, y: number): Vector3 {
    const offsetX = ((GRID_WIDTH - 1) * TILE_SIZE) / 2;
    const offsetZ = ((GRID_HEIGHT - 1) * TILE_SIZE) / 2;
    return new Vector3(position.x * TILE_SIZE - offsetX, y, position.y * TILE_SIZE - offsetZ);
  }

  private tileKey(tile: GridPosition): string {
    return `tile-${tile.x}-${tile.y}`;
  }
}
