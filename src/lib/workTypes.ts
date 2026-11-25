export type Vec3 = [number, number, number];

export type ObjectKind = "model" | "group" | "light";
export type LightType = "point" | "spot" | "directional";

export interface LightProps {
  type: LightType;
  color: string;
  intensity: number;
  distance: number;   // 0 = unlimited (point/spot)
  angle: number;      // spot cone, degrees
  castShadow: boolean;
}

export interface SceneObjectData {
  id: string;
  kind: ObjectKind;
  asset: string | null;           // key in model_sets.files (models only)
  label: string;                  // scripts refer to objects by label — keep them free of spaces
  parentId: string | null;        // hierarchy; position/rotation/scale are LOCAL to the parent
  position: Vec3;                 // metres, Y up
  rotation: Vec3;                 // degrees, Euler XYZ
  scale: number;                  // uniform
  joints: Record<string, number>; // radians (revolute/continuous) or metres (prismatic)
  static: boolean;                // true = drawn through GPU instancing (and never moves)
  opacity?: number;               // 0.05..1.0 transparency (1 = solid opaque)
  light?: LightProps;
  script?: string;                // behaviour script, run in Play mode
}

export type AiPartShape =
  | "box"
  | "cylinder"
  | "sphere"
  | "cone"
  | "torus"
  | "capsule"
  | "ring"
  | "octahedron";

export interface AiModelJoint {
  name: string;
  type: "revolute" | "continuous" | "prismatic";
  parentJoint?: string;
  pivot: Vec3;
  axis: Vec3;
  lower: number;
  upper: number;
}

export interface AiModelPart {
  name: string;
  shape: AiPartShape;
  position: Vec3;
  rotationDeg: Vec3;
  scale: Vec3;
  color: string;
  roughness: number;
  metalness: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  joint?: string;
}

export interface AiModelBlueprint {
  id: string;
  name: string;
  description: string;
  prompt: string;
  targetHeightMeters: number;
  parts: AiModelPart[];
  joints?: AiModelJoint[];
  createdAt: string;
}

export interface AiGenerateOptions {
  prompt: string;
  targetHeight: number;
  autoPlace: boolean;
  style?: string;
  materials?: string;
  extraDetails?: string;
  partDensity?: "standard" | "high";
  includeJoints?: boolean;
  jointDetails?: string;
  referenceImage?: {
    mimeType: string;
    data: string;
  } | null;
}

export interface SceneDoc {
  version: 2;
  objects: SceneObjectData[];
  zones?: ZoneDef[];
  aiBlueprints?: Record<string, AiModelBlueprint>;
}

export interface ModelSetRow {
  id: number;
  name: string;
  version: string;
  base_path: string;
  files: Record<string, string>;
  created_at: string;
}

export interface SceneRow {
  id: number;
  user_id: string;
  name: string;
  model_set_name: string | null;
  model_set_version: string | null;
  data: { version: number; objects: unknown[]; zones?: ZoneDef[]; aiBlueprints?: Record<string, AiModelBlueprint> }; // v1 docs are migrated on load (see sceneMath.normalizeObject)
  created_at: string;
  updated_at: string;
}
export type SceneSummary = Pick<SceneRow, "id" | "name" | "model_set_name" | "model_set_version" | "updated_at">;

export interface JointDef {
  name: string;
  type: "revolute" | "continuous" | "prismatic";
  lower: number;
  upper: number;
}

/** Lets DOM code (drag-and-drop, "add at centre") ask the 3D view for floor positions. */
export interface CanvasBridge {
  screenToFloor: (clientX: number, clientY: number) => Vec3 | null;
  centerOnFloor: () => Vec3 | null;
}

/** Editor/view preferences (stored in localStorage, not in the scene). */
export type CameraMode = "perspective" | "orthographic";
export type CanvasBgMode = "auto" | "space" | "studio" | "warm" | "blueprint";

export interface ViewPrefs {
  instancing: boolean;      // draw static objects through InstancedMesh
  frustumCull: boolean;     // per-instance (static) / per-mesh (dynamic) frustum culling
  distanceCull: boolean;
  cullDistance: number;     // metres
  lod: boolean;
  lodDistance: number;      // metres: beyond this, a box proxy replaces the full model
  showGizmos: boolean;      // view cube, light icons, group axes, selection box
  defaultLight: boolean;    // editor lighting on top of scene lights
  shadows: boolean;
  space: "world" | "local"; // transform-gizmo space
  focusSelection: boolean;  // orbit around the selected object
  forceWebGL: boolean;      // skip WebGPU and use the WebGL2 backend (troubleshooting)
  cameraMode: CameraMode;   // perspective (depth) vs orthographic (parallel projection)
  canvasBg: CanvasBgMode;   // 3D viewport background mode
}

export interface PerfStats {
  fps: number;
  frameMs: number;
  calls: number;
  triangles: number;
  instNear: number;
  instMid: number;
  instFar: number;
  instCulled: number;
  instTotal: number;
  dynamic: number;
  geometries: number;
  textures: number;
  heapMb?: number;
}

export type WorkspaceMode = "author" | "twin";
export type HealthStatus = "nominal" | "warning" | "fault" | "offline";
export type CameraPreset = "overview" | "isometric" | "top" | "conveyor" | "dock";
export type TwinScenario = "nominal" | "peak_rush" | "conveyor_jam" | "low_battery";
export type FaultKind = "overheat" | "battery" | "jam" | "sensor";
export type StreamStatus = "disconnected" | "connecting" | "connected" | "error";

export interface ZoneDef {
  id: string;
  name?: string;
  kind: string;
  x: [number, number];
  z: [number, number];
  color?: string;
}

export interface TwinOverlayPrefs {
  statusHalos: boolean;
  pathTrails: boolean;
  zoneHeatmap: boolean;
  floatingLabels: boolean;
  followSelected: boolean;
}

export interface AssetTelemetry {
  id: string;
  label: string;
  asset: string | null;
  kind: ObjectKind;
  status: HealthStatus;
  utilizationPct: number;
  speedMps: number;
  batteryPct: number;
  temperatureC: number;
  powerKw: number;
  cyclesCompleted: number;
  carrying: boolean;
  currentTask: string;
  faultReason: string | null;
  speedScale: number;
  history: { speed: number; temp: number; util: number }[];
  trail: Vec3[];
  goal: Vec3 | null;
}

export interface FacilityKpis {
  throughputPerHr: number;
  activeRobots: number;
  totalRobots: number;
  avgUtilizationPct: number;
  avgCycleSec: number;
  totalPowerKw: number;
  activeAlerts: number;
  uptimeSec: number;
  totalPickups: number;
  totalDeliveries: number;
}

export interface TwinAlert {
  id: string;
  objectId: string;
  label: string;
  severity: "warning" | "fault" | "info";
  title: string;
  detail: string;
  timeSec: number;
  acknowledged: boolean;
}

export interface ReplayEntityPose {
  pos: Vec3;
  yaw: number;
  lift: number;
  carrying: boolean;
  status: HealthStatus;
}

export interface ReplayFrame {
  timeSec: number;
  entities: Record<string, ReplayEntityPose>;
  kpis: FacilityKpis;
}
