import {
  ArcRotateCamera,
  AbstractMesh,
  Color3,
  HemisphericLight,
  LinesMesh,
  Mesh,
  MeshBuilder,
  PointerEventTypes,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import { GRID_HEIGHT, GRID_WIDTH } from "../game/Grid";
import type { BattleState } from "../game/BattleState";
import type { GridPosition, Tile } from "../game/types";

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
  private readonly unitHealthBars = new Map<string, Mesh>();
  private readonly unitSelectionRings = new Map<string, Mesh>();
  private readonly enemySightMarkers = new Map<string, Mesh>();
  private readonly pathMarkerMeshes: Mesh[] = [];
  private readonly sightlineMeshes: LinesMesh[] = [];
  private readonly floorTileMaterial: StandardMaterial;
  private readonly roadTileMaterial: StandardMaterial;
  private readonly roughTileMaterial: StandardMaterial;
  private readonly blockedTileMaterial: StandardMaterial;
  private readonly reachableMaterial: StandardMaterial;
  private readonly pathPreviewMaterial: StandardMaterial;
  private readonly selectedMaterial: StandardMaterial;
  private readonly halfCoverMaterial: StandardMaterial;
  private readonly fullCoverMaterial: StandardMaterial;
  private readonly playerBaseMaterial: StandardMaterial;
  private readonly enemyBaseMaterial: StandardMaterial;
  private readonly playerMaterial: StandardMaterial;
  private readonly enemyMaterial: StandardMaterial;
  private readonly healthBackMaterial: StandardMaterial;
  private readonly healthFillMaterial: StandardMaterial;
  private readonly selectionRingMaterial: StandardMaterial;
  private readonly pathMarkerMaterial: StandardMaterial;
  private readonly roadStripeMaterial: StandardMaterial;
  private readonly visibleEnemyMarkerMaterial: StandardMaterial;
  private readonly flankedEnemyMarkerMaterial: StandardMaterial;
  private readonly aimedEnemyMarkerMaterial: StandardMaterial;
  private readonly hiddenEnemyMarkerMaterial: StandardMaterial;
  private hoveredPath: GridPosition[] = [];
  private readonly unitAnimations = new Map<string, UnitAnimation>();

  constructor(
    private readonly scene: Scene,
    canvas: HTMLCanvasElement,
    private readonly camera: ArcRotateCamera,
    private readonly battleState: BattleState
  ) {
    this.floorTileMaterial = this.createMaterial("floor-tile-material", new Color3(0.25, 0.32, 0.29));
    this.roadTileMaterial = this.createMaterial("road-tile-material", new Color3(0.2, 0.22, 0.23));
    this.roughTileMaterial = this.createMaterial("rough-tile-material", new Color3(0.32, 0.34, 0.25));
    this.blockedTileMaterial = this.createMaterial("blocked-tile-material", new Color3(0.14, 0.15, 0.15));
    this.reachableMaterial = this.createMaterial("reachable-material", new Color3(0.34, 0.58, 0.48));
    this.pathPreviewMaterial = this.createMaterial("path-preview-material", new Color3(0.78, 0.69, 0.28));
    this.pathPreviewMaterial.emissiveColor = new Color3(0.12, 0.1, 0.02);
    this.selectedMaterial = this.createMaterial("selected-material", new Color3(0.24, 0.49, 0.78));
    this.halfCoverMaterial = this.createMaterial("half-cover-material", new Color3(0.58, 0.5, 0.34));
    this.fullCoverMaterial = this.createMaterial("full-cover-material", new Color3(0.38, 0.39, 0.37));
    this.playerBaseMaterial = this.createMaterial("player-base-material", new Color3(0.09, 0.2, 0.36));
    this.enemyBaseMaterial = this.createMaterial("enemy-base-material", new Color3(0.35, 0.08, 0.07));
    this.playerMaterial = this.createMaterial("player-material", new Color3(0.17, 0.52, 0.95));
    this.enemyMaterial = this.createMaterial("enemy-material", new Color3(0.82, 0.18, 0.14));
    this.healthBackMaterial = this.createMaterial("health-back-material", new Color3(0.07, 0.08, 0.08));
    this.healthFillMaterial = this.createMaterial("health-fill-material", new Color3(0.26, 0.86, 0.42));
    this.selectionRingMaterial = this.createMaterial("selection-ring-material", new Color3(0.38, 0.78, 1));
    this.pathMarkerMaterial = this.createMaterial("path-marker-material", new Color3(0.96, 0.82, 0.24));
    this.roadStripeMaterial = this.createMaterial("road-stripe-material", new Color3(0.5, 0.52, 0.48));
    this.visibleEnemyMarkerMaterial = this.createMaterial("visible-enemy-marker-material", new Color3(1, 0.62, 0.16));
    this.flankedEnemyMarkerMaterial = this.createMaterial("flanked-enemy-marker-material", new Color3(1, 0.18, 0.12));
    this.aimedEnemyMarkerMaterial = this.createMaterial("aimed-enemy-marker-material", new Color3(1, 0.93, 0.3));
    this.hiddenEnemyMarkerMaterial = this.createMaterial("hidden-enemy-marker-material", new Color3(0.31, 0.33, 0.34));
    this.selectionRingMaterial.emissiveColor = new Color3(0.1, 0.28, 0.42);
    this.pathMarkerMaterial.emissiveColor = new Color3(0.18, 0.13, 0.01);
    this.visibleEnemyMarkerMaterial.emissiveColor = new Color3(0.22, 0.1, 0.01);
    this.flankedEnemyMarkerMaterial.emissiveColor = new Color3(0.22, 0.03, 0.02);
    this.aimedEnemyMarkerMaterial.emissiveColor = new Color3(0.3, 0.22, 0.04);

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
      mesh.material = this.getBaseTileMaterial(tile);
      mesh.metadata = { kind: "tile", position: { x: tile.x, y: tile.y } } satisfies MeshMetadata;
      this.tileMeshes.set(this.tileKey(tile), mesh);

      if (tile.terrain === "road") {
        const stripeMesh = MeshBuilder.CreateBox(
          `road-stripe-${tile.x}-${tile.y}`,
          { width: 0.08, height: 0.012, depth: 0.62 },
          this.scene
        );
        stripeMesh.position = this.toWorldPosition(tile, 0.048);
        stripeMesh.material = this.roadStripeMaterial;
        stripeMesh.isPickable = false;
      }

      if (tile.cover > 0) {
        this.renderCover(tile);
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

      const base = MeshBuilder.CreateCylinder(
        `${unit.id}-base`,
        { diameter: 0.82, height: 0.08, tessellation: 24 },
        this.scene
      );
      base.parent = mesh;
      base.position.y = -0.38;
      base.material = unit.team === "player" ? this.playerBaseMaterial : this.enemyBaseMaterial;
      base.isPickable = false;

      const head = MeshBuilder.CreateSphere(`${unit.id}-head`, { diameter: 0.36, segments: 12 }, this.scene);
      head.parent = mesh;
      head.position.y = 0.52;
      head.material = unit.team === "player" ? this.playerMaterial : this.enemyMaterial;
      head.isPickable = false;

      const selectionRing = MeshBuilder.CreateTorus(
        `${unit.id}-selection-ring`,
        { diameter: 1.0, thickness: 0.04, tessellation: 32 },
        this.scene
      );
      selectionRing.parent = mesh;
      selectionRing.position.y = -0.43;
      selectionRing.rotation.x = Math.PI / 2;
      selectionRing.material = this.selectionRingMaterial;
      selectionRing.isPickable = false;
      selectionRing.isVisible = false;
      this.unitSelectionRings.set(unit.id, selectionRing);

      const healthBack = MeshBuilder.CreateBox(
        `${unit.id}-health-back`,
        { width: 0.72, height: 0.08, depth: 0.06 },
        this.scene
      );
      healthBack.parent = mesh;
      healthBack.position = new Vector3(0, 0.9, -0.12);
      healthBack.material = this.healthBackMaterial;
      healthBack.isPickable = false;

      const healthFill = MeshBuilder.CreateBox(
        `${unit.id}-health-fill`,
        { width: 0.68, height: 0.055, depth: 0.07 },
        this.scene
      );
      healthFill.parent = mesh;
      healthFill.position = new Vector3(0, 0.9, -0.08);
      healthFill.material = this.healthFillMaterial;
      healthFill.isPickable = false;
      this.unitHealthBars.set(unit.id, healthFill);

      if (unit.team === "enemy") {
        const sightMarker = MeshBuilder.CreateTorus(
          `${unit.id}-sight-marker`,
          { diameter: 0.9, thickness: 0.045, tessellation: 24 },
          this.scene
        );
        sightMarker.parent = mesh;
        sightMarker.position.y = -0.34;
        sightMarker.rotation.x = Math.PI / 2;
        sightMarker.material = this.hiddenEnemyMarkerMaterial;
        sightMarker.isPickable = false;
        sightMarker.isVisible = false;
        this.enemySightMarkers.set(unit.id, sightMarker);
      }
    });
  }

  private renderCover(tile: Tile): void {
    const sides = Object.entries(tile.coverSides).filter(([, cover]) => cover > 0);
    if (sides.length === 0) {
      this.renderLegacyCover(tile);
      return;
    }

    sides.forEach(([direction, cover]) => {
      const isHorizontal = direction === "north" || direction === "south";
      const isFullCover = cover >= 2;
      const width = isHorizontal ? 0.72 : isFullCover ? 0.22 : 0.16;
      const depth = isHorizontal ? (isFullCover ? 0.22 : 0.16) : 0.72;
      const height = isFullCover ? 0.82 : 0.34;
      const coverMesh = MeshBuilder.CreateBox(
        `cover-${tile.x}-${tile.y}-${direction}`,
        { width, height, depth },
        this.scene
      );

      const position = this.toWorldPosition(tile, height / 2 + 0.05);
      if (direction === "north") {
        position.z -= 0.33;
      } else if (direction === "south") {
        position.z += 0.33;
      } else if (direction === "east") {
        position.x += 0.33;
      } else {
        position.x -= 0.33;
      }

      coverMesh.position = position;
      coverMesh.material = isFullCover ? this.fullCoverMaterial : this.halfCoverMaterial;
      coverMesh.isPickable = false;
    });
  }

  private renderLegacyCover(tile: Tile): void {
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
        const unit = this.battleState.units.find((candidate) => candidate.id === metadata.unitId);
        if (unit?.team === "enemy") {
          this.battleState.previewAimAtUnit(metadata.unitId);
        } else {
          this.battleState.selectUnit(metadata.unitId);
        }
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
    const hoveredTile = metadata?.kind === "tile" ? metadata.position : null;
    const nextPath = hoveredTile === null ? [] : this.battleState.getPathForSelectedUnit(hoveredTile);

    if (this.arePathsEqual(this.hoveredPath, nextPath)) {
      this.battleState.setHoveredTile(hoveredTile);
      return;
    }

    this.hoveredPath = nextPath;
    window.tactical_hover_path = nextPath;
    this.battleState.setHoveredTile(hoveredTile);
    this.syncTileHighlights();
  }

  private syncScene(): void {
    this.startQueuedMovementAnimations();
    this.removeMissingUnitMeshes();
    this.syncUnitPositions();
    this.syncUnitOverlays();
    this.syncTileHighlights();
    this.syncSightlinePreview();
  }

  private removeMissingUnitMeshes(): void {
    const activeUnitIds = new Set(this.battleState.units.map((unit) => unit.id));

    this.unitMeshes.forEach((mesh, unitId) => {
      if (activeUnitIds.has(unitId)) {
        return;
      }

      mesh.getChildMeshes().forEach((child) => child.dispose());
      mesh.dispose();
      this.unitMeshes.delete(unitId);
      this.unitHealthBars.delete(unitId);
      this.unitSelectionRings.delete(unitId);
      this.enemySightMarkers.delete(unitId);
      this.unitAnimations.delete(unitId);
    });
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
        mesh.material = this.getBaseTileMaterial(tile);
      }
    });

    this.syncPathMarkers();
  }

  private syncUnitOverlays(): void {
    this.battleState.units.forEach((unit) => {
      const selectionRing = this.unitSelectionRings.get(unit.id);
      if (selectionRing !== undefined) {
        selectionRing.isVisible = unit.id === this.battleState.selectedUnitId;
      }

      const healthFill = this.unitHealthBars.get(unit.id);
      if (healthFill !== undefined) {
        const hpRatio = unit.maxHp === 0 ? 0 : unit.hp / unit.maxHp;
        healthFill.scaling.x = Math.max(0.04, hpRatio);
        healthFill.position.x = -0.34 + 0.34 * hpRatio;
      }
    });

    this.syncEnemySightMarkers();
  }

  private syncEnemySightMarkers(): void {
    const sightlines = this.battleState.getSightlinesForSelectedUnit();
    const sightlineByEnemy = new Map(sightlines.map((sightline) => [sightline.targetUnitId, sightline]));
    const previewByEnemy = new Map(
      this.battleState.getTargetPreviewsForSelectedUnit().map((preview) => [preview.targetUnitId, preview])
    );

    this.enemySightMarkers.forEach((marker, unitId) => {
      const sightline = sightlineByEnemy.get(unitId);
      const preview = previewByEnemy.get(unitId);
      marker.isVisible = sightline !== undefined;
      if (this.battleState.selectedTargetUnitId === unitId) {
        marker.material = this.aimedEnemyMarkerMaterial;
      } else if (preview?.flanked) {
        marker.material = this.flankedEnemyMarkerMaterial;
      } else {
        marker.material = sightline?.visible ? this.visibleEnemyMarkerMaterial : this.hiddenEnemyMarkerMaterial;
      }
    });
  }

  private syncPathMarkers(): void {
    while (this.pathMarkerMeshes.length < this.hoveredPath.length) {
      const marker = MeshBuilder.CreateCylinder(
        `path-marker-${this.pathMarkerMeshes.length}`,
        { diameter: 0.22, height: 0.04, tessellation: 16 },
        this.scene
      );
      marker.material = this.pathMarkerMaterial;
      marker.isPickable = false;
      this.pathMarkerMeshes.push(marker);
    }

    this.pathMarkerMeshes.forEach((marker, index) => {
      const position = this.hoveredPath[index];
      marker.isVisible = position !== undefined;
      if (position !== undefined) {
        marker.position = this.toWorldPosition(position, 0.12);
      }
    });
  }

  private getBaseTileMaterial(tile: Tile): StandardMaterial {
    if (!tile.walkable) {
      return this.blockedTileMaterial;
    }

    if (tile.terrain === "road") {
      return this.roadTileMaterial;
    }

    if (tile.terrain === "rough") {
      return this.roughTileMaterial;
    }

    return this.floorTileMaterial;
  }

  private syncSightlinePreview(): void {
    this.sightlineMeshes.forEach((mesh) => mesh.dispose());
    this.sightlineMeshes.length = 0;

    this.battleState.getSightlinesForSelectedUnit().forEach((sightline) => {
      if (sightline.path.length < 2) {
        return;
      }

      const points = sightline.path.map((position) => this.toWorldPosition(position, 0.18));
      const mesh = MeshBuilder.CreateLines(
        `sightline-${sightline.targetUnitId}`,
        { points, updatable: false },
        this.scene
      );
      mesh.color = sightline.visible ? new Color3(1, 0.53, 0.16) : new Color3(0.33, 0.38, 0.38);
      mesh.alpha = sightline.visible ? 0.9 : 0.46;
      mesh.isPickable = false;
      this.sightlineMeshes.push(mesh);
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
