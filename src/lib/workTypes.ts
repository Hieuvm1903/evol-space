export type Vec3 = [number, number, number];

export interface SceneObjectData {
  id: string;
  asset: string;                 // key in model_sets.files, e.g. "rack"
  label: string;
  position: Vec3;                // metres, three.js axes (Y up)
  rotationY: number;             // degrees
  scale: number;
  joints: Record<string, number>; // radians (revolute/continuous) or metres (prismatic)
}

export interface SceneDoc {
  version: 1;
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
  data: SceneDoc;
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
