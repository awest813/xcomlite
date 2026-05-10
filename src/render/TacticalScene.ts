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
  VertexData,
} from "@babylonjs/core";
import { AdvancedDynamicTexture, Control, Rectangle, StackPanel, TextBlock } from "@babylonjs/gui";
import { GRID_HEIGHT, GRID_WIDTH, getTile } from "../game/Grid";
import type { BattleState } from "../game/BattleState";
import type { GridPosition, Tile, Unit } from "../game/types";


type MeshMetadata =
  | { kind: "tile"; position: GridPosition }
  | { kind: "unit"; unitId: string };

const TILE_SIZE = 1;
const UNIT_MOVE_SPEED_TILES_PER_SECOND = 5;

/** Camera–unit distance at which nameplates use the smallest uniform scale. */
const NAMEPLATE_DIST_NEAR = 7.5;
/** Camera–unit distance at which nameplates reach their largest scale. */
const NAMEPLATE_DIST_FAR = 26;
const NAMEPLATE_SCALE_NEAR = 0.72;
const NAMEPLATE_SCALE_FAR = 1.88;

interface UnitAnimation {
  waypoints: Vector3[];
  waypointIndex: number;
}

interface UnitLabelHandles {
  readonly adt: AdvancedDynamicTexture;
  readonly rect: Rectangle;
  readonly nameplatePlane: Mesh;
  readonly nameText: TextBlock;
  readonly roleText: TextBlock;
  readonly hpText: TextBlock;
}

export class TacticalScene {
  private readonly tileMeshes = new Map<string, Mesh>();
  private readonly unitMeshes = new Map<string, Mesh>();
  private readonly unitHealthBars = new Map<string, Mesh>();
  private readonly unitSelectionRings = new Map<string, Mesh>();
  private readonly unitOverwatchMarkers = new Map<string, Mesh>();
  private readonly enemySightMarkers = new Map<string, Mesh>();
  private readonly pathMarkerMeshes: Mesh[] = [];
  private readonly sightlineMeshes: LinesMesh[] = [];
  private readonly shotLineMeshes: LinesMesh[] = [];
  private readonly impactFlashMeshes: Mesh[] = [];
  private shotEffectTimer = 0;
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
  private readonly shotLineMaterial: StandardMaterial;
  private readonly impactHitMaterial: StandardMaterial;
  private readonly impactMissMaterial: StandardMaterial;
  private readonly overwatchMarkerMaterial: StandardMaterial;
  private readonly extractZoneMaterial: StandardMaterial;
  private readonly fogHiddenMaterial: StandardMaterial;
  private readonly fogExploredMaterial: StandardMaterial;
  private readonly invalidFlashMaterial: StandardMaterial;
  private hoveredPath: GridPosition[] = [];
  private readonly unitAnimations = new Map<string, UnitAnimation>();
  private readonly unitLabels = new Map<string, UnitLabelHandles>();
  private readonly unitBodyMaterials = new Map<string, StandardMaterial>();

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
    this.shotLineMaterial = this.createMaterial("shot-line-material", new Color3(1, 0.85, 0.2));
    this.shotLineMaterial.emissiveColor = new Color3(0.4, 0.3, 0.05);
    this.impactHitMaterial = this.createMaterial("impact-hit-material", new Color3(1, 0.2, 0.1));
    this.impactHitMaterial.emissiveColor = new Color3(0.5, 0.05, 0.02);
    this.impactMissMaterial = this.createMaterial("impact-miss-material", new Color3(0.5, 0.5, 0.5));
    this.impactMissMaterial.emissiveColor = new Color3(0.15, 0.15, 0.15);
    this.overwatchMarkerMaterial = this.createMaterial("overwatch-marker-material", new Color3(0.2, 0.8, 0.2));
    this.overwatchMarkerMaterial.emissiveColor = new Color3(0.08, 0.3, 0.08);
    this.extractZoneMaterial = this.createMaterial("extract-zone-material", new Color3(0.2, 0.6, 0.9));
    this.extractZoneMaterial.emissiveColor = new Color3(0.1, 0.25, 0.4);
    this.fogHiddenMaterial = this.createMaterial("fog-hidden-material", new Color3(0.02, 0.02, 0.04));
    this.fogExploredMaterial = this.createMaterial("fog-explored-material", new Color3(0.08, 0.08, 0.12));
    this.invalidFlashMaterial = this.createMaterial("invalid-flash-material", new Color3(0.62, 0.12, 0.1));
    this.invalidFlashMaterial.emissiveColor = new Color3(0.42, 0.06, 0.05);
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
    this.setupKeyboard(canvas);
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
    this.scene.clearColor.set(0.01, 0.01, 0.03, 1);
    this.createStarfield();
  }

  private createStarfield(): void {
    const starCount = 200;
    const positions: number[] = [];
    const colors: number[] = [];

    for (let i = 0; i < starCount; i++) {
      const x = (Math.random() - 0.5) * 60;
      const y = (Math.random() - 0.5) * 60 + 20;
      const z = (Math.random() - 0.5) * 60;
      positions.push(x, y, z);

      const brightness = 0.3 + Math.random() * 0.7;
      colors.push(brightness, brightness, brightness * 1.1, 1);
    }

    const starMesh = new Mesh("stars", this.scene);
    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.colors = colors;
    vertexData.indices = Array.from({ length: starCount }, (_, i) => i);
    vertexData.applyToMesh(starMesh);

    const starMaterial = new StandardMaterial("star-mat", this.scene);
    starMaterial.emissiveColor = new Color3(1, 1, 1);
    starMaterial.disableLighting = true;
    starMaterial.pointsCloud = true;
    starMaterial.pointSize = 2;
    starMesh.material = starMaterial;
    starMesh.isPickable = false;
  }

  private renderGrid(): void {
    this.battleState.grid.forEach((tile) => {
      const tileHeight = 0.06 + tile.elevation * 0.5;
      const mesh = MeshBuilder.CreateBox(
        this.tileKey(tile),
        { width: 0.94, height: tileHeight, depth: 0.94 },
        this.scene
      );
      mesh.position = this.toWorldPosition(tile, tileHeight / 2);
      mesh.material = this.getBaseTileMaterial(tile);
      mesh.metadata = { kind: "tile", position: { x: tile.x, y: tile.y, elevation: tile.elevation } } satisfies MeshMetadata;
      this.tileMeshes.set(this.tileKey(tile), mesh);

      if (tile.terrain === "road") {
        const stripeMesh = MeshBuilder.CreateBox(
          `road-stripe-${tile.x}-${tile.y}`,
          { width: 0.08, height: 0.012, depth: 0.62 },
          this.scene
        );
        stripeMesh.position = this.toWorldPosition(tile, tileHeight + 0.048);
        stripeMesh.material = this.roadStripeMaterial;
        stripeMesh.isPickable = false;
      }

      if (tile.cover > 0) {
        this.renderCover(tile);
      }
    });

    if (this.battleState.extractZone !== null) {
      const extractTile = getTile(this.battleState.grid, this.battleState.extractZone);
      if (extractTile !== undefined) {
        const extractMesh = MeshBuilder.CreateBox(
          "extract-zone",
          { width: 0.94, height: 0.08, depth: 0.94 },
          this.scene
        );
        extractMesh.position = this.toWorldPosition(extractTile, extractTile.elevation * 0.5 + 0.06);
        extractMesh.material = this.extractZoneMaterial;
        extractMesh.isPickable = false;
      }
    }
  }

  private renderUnits(): void {
    this.battleState.units.forEach((unit) => {
      const baseY = unit.position.elevation * 0.5;
      const mesh = MeshBuilder.CreateCylinder(
        unit.id,
        { diameterTop: 0.48, diameterBottom: 0.62, height: 0.75, tessellation: 18 },
        this.scene
      );
      mesh.position = this.toWorldPosition(unit.position, baseY + 0.42);
      const templateMat = unit.team === "player" ? this.playerMaterial : this.enemyMaterial;
      const bodyMat = templateMat.clone(`${unit.id}-body-mat`);
      mesh.material = bodyMat;
      this.unitBodyMaterials.set(unit.id, bodyMat);
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
      head.material = bodyMat;
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

      const overwatchMarker = MeshBuilder.CreateCylinder(
        `${unit.id}-overwatch`,
        { diameterTop: 0.1, diameterBottom: 0.6, height: 0.5, tessellation: 8 },
        this.scene
      );
      overwatchMarker.parent = mesh;
      overwatchMarker.position.y = 0.65;
      overwatchMarker.material = this.overwatchMarkerMaterial;
      overwatchMarker.isPickable = false;
      overwatchMarker.isVisible = false;
      this.unitOverwatchMarkers.set(unit.id, overwatchMarker);

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

      this.attachUnitNameplate(mesh, unit);
    });
  }

  private attachUnitNameplate(unitMesh: Mesh, unit: Unit): void {
    const plane = MeshBuilder.CreatePlane(`${unit.id}-nameplate`, { width: 1.58, height: 0.58 }, this.scene);
    plane.parent = unitMesh;
    plane.position = new Vector3(0, 1.26, 0);
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    plane.isPickable = false;

    const adt = AdvancedDynamicTexture.CreateForMesh(plane, 940, 360, false);

    const rect = new Rectangle(`${unit.id}-label-frame`);
    rect.width = "94%";
    rect.height = "88%";
    rect.cornerRadius = 14;
    rect.thickness = 1;
    rect.color = "rgba(140,200,240,0.45)";
    rect.background = "rgba(6,10,14,0.88)";
    adt.addControl(rect);

    const stack = new StackPanel(`${unit.id}-label-stack`);
    stack.isVertical = true;
    stack.width = "100%";
    stack.height = "100%";
    stack.spacing = 2;
    stack.paddingTop = "8px";
    stack.paddingBottom = "8px";
    stack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    stack.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    rect.addControl(stack);

    const nameText = new TextBlock(`${unit.id}-label-name`, "");
    nameText.text = unit.name;
    nameText.color = unit.team === "player" ? "#c5efff" : "#ffc9c0";
    nameText.fontSize = 40;
    nameText.fontWeight = "bold";
    nameText.fontFamily = "Oxanium, Segoe UI, Arial, sans-serif";
    nameText.textWrapping = true;
    nameText.resizeToFit = false;
    nameText.height = "48px";
    nameText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    nameText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;

    const roleText = new TextBlock(`${unit.id}-label-role`, "");
    roleText.text = formatRoleLine(unit);
    roleText.color = "#aabecb";
    roleText.fontSize = 26;
    roleText.fontFamily = "IBM Plex Mono, Consolas, monospace";
    roleText.height = "34px";
    roleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    roleText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;

    const hpText = new TextBlock(`${unit.id}-label-hp`, "");
    hpText.text = `HP ${unit.hp}/${unit.maxHp}`;
    hpText.color = "#9fb8b0";
    hpText.fontSize = 28;
    hpText.fontFamily = "IBM Plex Mono, Consolas, monospace";
    hpText.height = "38px";
    hpText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    hpText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;

    stack.addControl(nameText);
    stack.addControl(roleText);
    stack.addControl(hpText);

    this.unitLabels.set(unit.id, { adt, rect, nameplatePlane: plane, nameText, roleText, hpText });
  }

  private renderCover(tile: Tile): void {
    const baseY = tile.elevation * 0.5;
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

      const position = this.toWorldPosition(tile, baseY + height / 2 + 0.05);
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
    const baseY = tile.elevation * 0.5;
    const coverHeight = tile.cover >= 2 ? 0.74 : 0.38;
    const coverMesh = MeshBuilder.CreateBox(
      `cover-${tile.x}-${tile.y}`,
      { width: 0.62, height: coverHeight, depth: 0.22 },
      this.scene
    );
    coverMesh.position = this.toWorldPosition(tile, baseY + coverHeight / 2 + 0.04);
    coverMesh.material = tile.cover >= 2 ? this.fullCoverMaterial : this.halfCoverMaterial;
    coverMesh.isPickable = false;
  }

  private setupPicking(_canvas: HTMLCanvasElement): void {
    this.scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type === PointerEventTypes.POINTERMOVE) {
        const pickedMesh = this.scene.pick(this.scene.pointerX, this.scene.pointerY)?.pickedMesh;
        this.onPointerHoverMove(pickedMesh);
        return;
      }

      if (pointerInfo.type !== PointerEventTypes.POINTERPICK) {
        return;
      }

      const mesh = pointerInfo.pickInfo?.pickedMesh ?? this.scene.pick(this.scene.pointerX, this.scene.pointerY)?.pickedMesh;
      this.handlePickedMesh(mesh);
    });
  }

  private setupKeyboard(_canvas: HTMLCanvasElement): void {
    window.addEventListener("keydown", (e) => {
      if (this.battleState.missionResult !== "in_progress") {
        if (e.key === "r" || e.key === "R") {
          this.battleState.restartMission();
        }
        return;
      }

      if (e.key === "Escape") {
        this.battleState.cancelTacticalAction();
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        if (this.battleState.currentTeam === "player") {
          this.cycleSelectedPlayerUnit(e.shiftKey ? -1 : 1);
        }
        return;
      }

      switch (e.key) {
        case "[":
          this.camera.alpha -= 0.14;
          break;
        case "]":
          this.camera.alpha += 0.14;
          break;
      }

      switch (e.key.toLowerCase()) {
        case "e":
          this.battleState.endTurn();
          break;
        case "f":
          this.battleState.fireAtSelectedTarget();
          break;
        case "o":
          this.battleState.enterOverwatch();
          break;
        case "1":
          this.selectPlayerUnitByIndex(0);
          break;
        case "2":
          this.selectPlayerUnitByIndex(1);
          break;
        case "3":
          this.selectPlayerUnitByIndex(2);
          break;
        case "r":
          this.battleState.restartMission();
          break;
        case "l":
          this.battleState.reloadWeapon();
          break;
      }
    });
  }

  private cycleSelectedPlayerUnit(delta: number): void {
    const players = this.battleState.units.filter((u) => u.team === "player");
    if (players.length === 0) {
      return;
    }

    let idx = players.findIndex((u) => u.id === this.battleState.selectedUnitId);
    if (idx < 0) {
      idx = delta >= 0 ? 0 : players.length - 1;
    } else {
      idx = (idx + delta + players.length) % players.length;
    }

    this.battleState.selectUnit(players[idx].id);
  }

  private selectPlayerUnitByIndex(index: number): void {
    const playerUnits = this.battleState.units.filter((u) => u.team === "player");
    if (index < playerUnits.length) {
      this.battleState.selectUnit(playerUnits[index].id);
    }
  }

  private handlePickedMesh(mesh: AbstractMesh | null | undefined): void {
      const metadata = mesh?.metadata as MeshMetadata | undefined;
      if (metadata?.kind === "unit") {
        const unit = this.battleState.units.find((candidate) => candidate.id === metadata.unitId);
        if (unit?.team === "enemy") {
          const aimed = this.battleState.previewAimAtUnit(metadata.unitId);
          if (!aimed) {
            this.flashInvalidTile(unit.position);
          }
        } else {
          this.battleState.selectUnit(metadata.unitId);
        }
        return;
      }

      if (metadata?.kind === "tile") {
        const phase = this.battleState.phase;
        if (phase === "aiming") {
          this.battleState.setHoveredTile(metadata.position);
          return;
        }
        if (phase === "grenade_aiming") {
          this.battleState.setHoveredTile(metadata.position);
          return;
        }
        const moved = this.battleState.moveSelectedUnit(metadata.position);
        this.hoveredPath = [];
        this.syncTileHighlights();
        if (!moved) {
          this.flashInvalidTile(metadata.position);
        }
      }
  }

  private flashInvalidTile(position: GridPosition): void {
    const mesh = this.tileMeshes.get(this.tileKey(position));
    if (mesh === undefined) {
      return;
    }

    mesh.material = this.invalidFlashMaterial;
    window.setTimeout(() => this.syncTileHighlights(), 280);
  }

  update(deltaMs: number): void {
    this.startQueuedMovementAnimations();
    this.updateMovementAnimations(deltaMs);
    this.updateShotEffects(deltaMs);
    this.updateNameplateScales();
  }

  private updateNameplateScales(): void {
    const camPos = this.camera.globalPosition;
    this.unitLabels.forEach((label, unitId) => {
      const unitMesh = this.unitMeshes.get(unitId);
      if (unitMesh === undefined || !unitMesh.isVisible) {
        return;
      }

      const unitPos = unitMesh.getAbsolutePosition();
      const dist = Vector3.Distance(camPos, unitPos);
      const t = Math.max(0, Math.min(1, (dist - NAMEPLATE_DIST_NEAR) / (NAMEPLATE_DIST_FAR - NAMEPLATE_DIST_NEAR)));
      const scale = NAMEPLATE_SCALE_NEAR + t * (NAMEPLATE_SCALE_FAR - NAMEPLATE_SCALE_NEAR);
      label.nameplatePlane.scaling.setAll(scale);
    });
  }

  private resolveMeshMetadata(mesh: AbstractMesh | null | undefined): MeshMetadata | undefined {
    let current: AbstractMesh | null | undefined = mesh;
    while (current !== null && current !== undefined) {
      const meta = current.metadata as MeshMetadata | undefined;
      if (meta?.kind === "tile" || meta?.kind === "unit") {
        return meta;
      }
      current = current.parent as AbstractMesh | null | undefined;
    }
    return undefined;
  }

  private onPointerHoverMove(mesh: AbstractMesh | null | undefined): void {
    const meta = this.resolveMeshMetadata(mesh);

    if (meta?.kind === "unit") {
      this.battleState.setHoveredUnit(meta.unitId);
      if (this.hoveredPath.length > 0) {
        this.hoveredPath = [];
        this.syncTileHighlights();
      }
      this.battleState.setHoveredTile(null);
      return;
    }

    this.battleState.setHoveredUnit(null);

    const hoveredTile = meta?.kind === "tile" ? meta.position : null;
    const nextPath = hoveredTile === null ? [] : this.battleState.getPathForSelectedUnit(hoveredTile);

    if (this.arePathsEqual(this.hoveredPath, nextPath)) {
      this.battleState.setHoveredTile(hoveredTile);
      return;
    }

    this.hoveredPath = nextPath;
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
    this.renderShotEffects();
  }

  private removeMissingUnitMeshes(): void {
    const activeUnitIds = new Set(this.battleState.units.map((unit) => unit.id));

    this.unitMeshes.forEach((mesh, unitId) => {
      if (activeUnitIds.has(unitId)) {
        return;
      }

      const label = this.unitLabels.get(unitId);
      if (label !== undefined) {
        label.adt.dispose();
        this.unitLabels.delete(unitId);
      }

      this.unitBodyMaterials.get(unitId)?.dispose();
      this.unitBodyMaterials.delete(unitId);

      mesh.getChildMeshes().forEach((child) => child.dispose());
      mesh.dispose();
      this.unitMeshes.delete(unitId);
      this.unitHealthBars.delete(unitId);
      this.unitSelectionRings.delete(unitId);
      this.unitOverwatchMarkers.delete(unitId);
      this.enemySightMarkers.delete(unitId);
      this.unitAnimations.delete(unitId);
    });
  }

  private syncUnitPositions(): void {
    this.battleState.units.forEach((unit) => {
      const mesh = this.unitMeshes.get(unit.id);
      if (mesh !== undefined && !this.unitAnimations.has(unit.id)) {
        const baseY = unit.position.elevation * 0.5;
        mesh.position = this.toWorldPosition(unit.position, baseY + 0.42);
      }
    });
  }

  private startQueuedMovementAnimations(): void {
    this.battleState.drainMovementEvents().forEach((event) => {
      const waypoints = event.path.map((position) => {
        const baseY = position.elevation * 0.5;
        return this.toWorldPosition(position, baseY + 0.42);
      });
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
          const baseY = unit.position.elevation * 0.5;
          mesh.position = this.toWorldPosition(unit.position, baseY + 0.42);
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

      if (tile.fogState === "hidden") {
        mesh.material = this.fogHiddenMaterial;
        mesh.isVisible = true;
      } else if (tile.fogState === "explored") {
        mesh.material = this.fogExploredMaterial;
      } else if (selectedUnit?.position.x === tile.x && selectedUnit.position.y === tile.y) {
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
      const mesh = this.unitMeshes.get(unit.id);
      if (mesh !== undefined) {
        const tile = this.battleState.grid.find((t) => t.x === unit.position.x && t.y === unit.position.y);
        const isHidden = unit.team === "enemy" && tile?.fogState !== "visible";
        mesh.isVisible = !isHidden;
      }

      const bodyMat = this.unitBodyMaterials.get(unit.id);
      if (bodyMat !== undefined) {
        const hpRatio = unit.maxHp === 0 ? 0 : unit.hp / unit.maxHp;
        if (hpRatio < 0.34) {
          bodyMat.emissiveColor = new Color3(0.26, 0.05, 0.05);
        } else if (hpRatio < 0.55) {
          bodyMat.emissiveColor = new Color3(0.14, 0.07, 0.03);
        } else {
          bodyMat.emissiveColor = Color3.Black();
        }
      }

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

      const overwatchMarker = this.unitOverwatchMarkers.get(unit.id);
      if (overwatchMarker !== undefined) {
        overwatchMarker.isVisible = unit.isOverwatch;
      }

      const label = this.unitLabels.get(unit.id);
      if (label !== undefined) {
        label.nameText.text = unit.name;
        label.roleText.text = formatRoleLine(unit);
        label.hpText.text = `HP ${unit.hp}/${unit.maxHp}`;
        const hpRatio = unit.maxHp === 0 ? 0 : unit.hp / unit.maxHp;
        label.hpText.color =
          hpRatio > 0.55 ? "#b8e8c8" : hpRatio > 0.28 ? "#f0d78c" : "#ffb0a0";

        const isSelected = unit.id === this.battleState.selectedUnitId;
        const isHovered = unit.id === this.battleState.hoveredUnitId;
        const isAimTarget =
          unit.team === "enemy" &&
          unit.id === this.battleState.selectedTargetUnitId &&
          this.battleState.phase === "aiming";
        if (isAimTarget) {
          label.rect.color = "rgba(255,235,120,0.95)";
          label.rect.thickness = 2;
          label.rect.background = "rgba(26,22,10,0.92)";
        } else if (isSelected) {
          label.rect.color = "rgba(255,214,120,0.95)";
          label.rect.thickness = 2;
          label.rect.background = "rgba(28,22,8,0.92)";
        } else if (isHovered) {
          label.rect.color = "rgba(190,235,255,0.85)";
          label.rect.thickness = 2;
          label.rect.background = "rgba(10,18,26,0.9)";
        } else {
          label.rect.color = "rgba(140,200,240,0.45)";
          label.rect.thickness = 1;
          label.rect.background = "rgba(6,10,14,0.88)";
        }
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
      const enemyUnit = this.battleState.units.find((u) => u.id === unitId);
      const enemyTile = enemyUnit ? this.battleState.grid.find((t) => t.x === enemyUnit.position.x && t.y === enemyUnit.position.y) : undefined;
      const isVisible = enemyTile?.fogState === "visible";

      const sightline = sightlineByEnemy.get(unitId);
      const preview = previewByEnemy.get(unitId);
      marker.isVisible = isVisible && sightline !== undefined;
      if (this.battleState.selectedTargetUnitId === unitId && isVisible) {
        marker.material = this.aimedEnemyMarkerMaterial;
      } else if (preview?.flanked && isVisible) {
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
        const baseY = position.elevation * 0.5;
        marker.position = this.toWorldPosition(position, baseY + 0.12);
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

  private renderShotEffects(): void {
    const shotEvents = this.battleState.drainShotEvents();
    if (shotEvents.length === 0) {
      return;
    }

    this.shotLineMeshes.forEach((mesh) => mesh.dispose());
    this.shotLineMeshes.length = 0;
    this.impactFlashMeshes.forEach((mesh) => mesh.dispose());
    this.impactFlashMeshes.length = 0;

    for (const shot of shotEvents) {
      const shooterWorld = this.toWorldPosition(shot.shooterPosition, 0.5);
      const targetWorld = this.toWorldPosition(shot.targetPosition, 0.5);

      const shotLine = MeshBuilder.CreateLines(
        `shot-line-${shot.shooterPosition.x}-${shot.shooterPosition.y}`,
        { points: [shooterWorld, targetWorld], updatable: false },
        this.scene
      );
      shotLine.color = new Color3(1, 0.9, 0.3);
      shotLine.alpha = 1.0;
      shotLine.isPickable = false;
      this.shotLineMeshes.push(shotLine);

      const impactMesh = MeshBuilder.CreateSphere(
        `impact-${shot.targetPosition.x}-${shot.targetPosition.y}`,
        { diameter: shot.hit ? 0.5 : 0.3, segments: 8 },
        this.scene
      );
      impactMesh.position = targetWorld;
      impactMesh.material = shot.hit ? this.impactHitMaterial : this.impactMissMaterial;
      impactMesh.isPickable = false;
      this.impactFlashMeshes.push(impactMesh);
    }

    this.shotEffectTimer = 600;
  }

  private updateShotEffects(deltaMs: number): void {
    if (this.shotEffectTimer <= 0) {
      return;
    }

    this.shotEffectTimer -= deltaMs;
    const alpha = Math.max(0, this.shotEffectTimer / 600);

    this.shotLineMeshes.forEach((mesh) => {
      mesh.alpha = alpha;
    });

    this.impactFlashMeshes.forEach((mesh) => {
      mesh.scaling = new Vector3(1 + (1 - alpha) * 2, 1 + (1 - alpha) * 2, 1 + (1 - alpha) * 2);
      if (mesh.material instanceof StandardMaterial) {
        mesh.material.alpha = alpha;
      }
    });

    if (this.shotEffectTimer <= 0) {
      this.shotLineMeshes.forEach((mesh) => mesh.dispose());
      this.shotLineMeshes.length = 0;
      this.impactFlashMeshes.forEach((mesh) => mesh.dispose());
      this.impactFlashMeshes.length = 0;
    }
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

  dispose(): void {
    this.tileMeshes.forEach((mesh) => mesh.dispose());
    this.unitLabels.forEach((label) => label.adt.dispose());
    this.unitLabels.clear();
    this.unitMeshes.forEach((mesh) => {
      mesh.getChildMeshes().forEach((child) => child.dispose());
      mesh.dispose();
    });
    this.unitBodyMaterials.forEach((mat) => mat.dispose());
    this.unitBodyMaterials.clear();
    this.tileMeshes.clear();
    this.unitMeshes.clear();
    this.unitHealthBars.clear();
    this.unitSelectionRings.clear();
    this.unitOverwatchMarkers.clear();
    this.enemySightMarkers.clear();
    this.pathMarkerMeshes.forEach((mesh) => mesh.dispose());
    this.pathMarkerMeshes.length = 0;
    this.sightlineMeshes.forEach((mesh) => mesh.dispose());
    this.sightlineMeshes.length = 0;
    this.shotLineMeshes.forEach((mesh) => mesh.dispose());
    this.shotLineMeshes.length = 0;
    this.impactFlashMeshes.forEach((mesh) => mesh.dispose());
    this.impactFlashMeshes.length = 0;
    this.unitAnimations.clear();
  }
}

function capitalizeLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function truncateLabel(text: string, maxChars: number): string {
  const t = text.trim();
  if (t.length <= maxChars) {
    return t;
  }
  return `${t.slice(0, Math.max(1, maxChars - 1))}…`;
}

function formatRoleLine(unit: Unit): string {
  const cls = capitalizeLabel(unit.unitClass);
  const weapon = truncateLabel(unit.weapon.name, 26);
  return `${cls} · ${weapon}`;
}
