export type MeshFormat = "obj" | "stl" | "glb" | "gltf";

const SUPPORTED_EXTENSIONS: MeshFormat[] = ["obj", "stl", "glb", "gltf"];

export function detectFormat(filename: string): MeshFormat | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return (SUPPORTED_EXTENSIONS as string[]).includes(ext) ? (ext as MeshFormat) : null;
}

export interface LoadedModel {
  id: string;
  name: string;
  format: MeshFormat;
  url: string; // object URL
}

export interface TransformState {
  position: [number, number, number];
  rotation: [number, number, number]; // radians
  scale: number;
}

export interface BehaviorState {
  autoRotate: boolean;
  rotateAxis: "x" | "y" | "z";
  rotateSpeed: number; // rad/s
  bobbing: boolean;
  bobAmplitude: number;
  bobSpeed: number;
  driveEnabled: boolean;
  driveSpeed: number; // units/s
  turnSpeed: number; // rad/s
}

export interface ModelStats {
  triangles: number;
  vertices: number;
  objects: number;
}

export const DEFAULT_TRANSFORM: TransformState = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: 1,
};

export const DEFAULT_BEHAVIOR: BehaviorState = {
  autoRotate: false,
  rotateAxis: "y",
  rotateSpeed: 0.6,
  bobbing: false,
  bobAmplitude: 0.2,
  bobSpeed: 1.2,
  driveEnabled: false,
  driveSpeed: 1.5,
  turnSpeed: 1.8,
};