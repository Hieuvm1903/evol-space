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
  light?: LightProps;
  script?: string;                // behaviour script, run in Play mode
}

export interface SceneDoc {
  version: 2;
  objects: SceneObjectData[];
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
  data: { version: number; objects: unknown[] }; // v1 docs are migrated on load (see sceneMath.normalizeObject)
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
}

export interface PerfStats {
  calls: number;
  triangles: number;
  instNear: number;
  instFar: number;
  instCulled: number;
  instTotal: number;
  dynamic: number;
}
