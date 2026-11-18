import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import type { AiModelBlueprint, AiPartShape } from "../../lib/workTypes";

export interface BuiltAiAsset {
  blueprint: AiModelBlueprint;
  blob: Blob;
  url: string;
  bounds: [number, number, number];
  partCount: number;
}

const D2R = Math.PI / 180;

export async function requestAiModelBlueprint(
  prompt: string,
  targetHeight: number,
): Promise<AiModelBlueprint> {
  const res = await fetch("/api/work/generate-model", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, targetHeight }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof payload?.error === "string" && payload.error
        ? payload.error
        : `Model generation failed (HTTP ${res.status})`;
    throw new Error(msg);
  }

  if (!payload?.blueprint || !Array.isArray(payload.blueprint.parts)) {
    throw new Error("Server returned an invalid 3D blueprint.");
  }

  return payload.blueprint as AiModelBlueprint;
}

function createUnitGeometry(shape: AiPartShape): THREE.BufferGeometry {
  switch (shape) {
    case "cylinder":
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
    case "sphere":
      return new THREE.SphereGeometry(0.5, 24, 16);
    case "cone":
      return new THREE.ConeGeometry(0.5, 1, 24);
    case "torus":
      return new THREE.TorusGeometry(0.36, 0.14, 16, 28);
    case "capsule": {
      // CapsuleGeometry(radius=0.32, length=0.36) -> height = 1.0, diameter = 0.64
      // Scale XZ cleanly so 1x1x1 unit dimensions match box/cylinder proportions
      const geo = new THREE.CapsuleGeometry(0.32, 0.36, 8, 20);
      geo.scale(1 / 0.64, 1, 1 / 0.64);
      return geo;
    }
    case "ring": {
      // Horizontal circular collar/ring of 1x1x1 unit footprint
      const geo = new THREE.TorusGeometry(0.38, 0.12, 14, 28);
      geo.rotateX(Math.PI / 2);
      geo.scale(1, 1 / 0.24, 1);
      return geo;
    }
    case "octahedron": {
      const geo = new THREE.OctahedronGeometry(0.5, 0);
      return geo;
    }
    case "box":
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

function buildGroupFromBlueprint(blueprint: AiModelBlueprint): {
  root: THREE.Group;
  disposables: { geometries: THREE.BufferGeometry[]; materials: THREE.Material[] };
} {
  const root = new THREE.Group();
  root.name = blueprint.id;

  const assembly = new THREE.Group();
  assembly.name = "assembly";
  root.add(assembly);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  for (let i = 0; i < blueprint.parts.length; i++) {
    const p = blueprint.parts[i];
    const geo = createUnitGeometry(p.shape);
    geometries.push(geo);

    const hasEmissive = Boolean(p.emissive && (p.emissiveIntensity ?? 0) > 0);
    const transparent = typeof p.opacity === "number" && p.opacity < 0.99;

    const mat = new THREE.MeshStandardMaterial({
      name: `${p.name}_mat`,
      color: new THREE.Color(p.color || "#8b6ff5"),
      roughness: Math.min(1, Math.max(0.05, p.roughness ?? 0.45)),
      metalness: Math.min(1, Math.max(0, p.metalness ?? 0.25)),
      ...(hasEmissive
        ? {
            emissive: new THREE.Color(p.emissive!),
            emissiveIntensity: Math.min(3, Math.max(0, p.emissiveIntensity ?? 1)),
          }
        : {}),
      ...(transparent
        ? {
            transparent: true,
            opacity: Math.min(1, Math.max(0.15, p.opacity ?? 1)),
          }
        : {}),
    });
    materials.push(mat);

    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = p.name || `part_${i + 1}`;
    mesh.castShadow = !transparent;
    mesh.receiveShadow = true;

    mesh.position.set(
      Number.isFinite(p.position?.[0]) ? p.position[0] : 0,
      Number.isFinite(p.position?.[1]) ? p.position[1] : 0.5,
      Number.isFinite(p.position?.[2]) ? p.position[2] : 0,
    );
    mesh.rotation.set(
      (Number.isFinite(p.rotationDeg?.[0]) ? p.rotationDeg[0] : 0) * D2R,
      (Number.isFinite(p.rotationDeg?.[1]) ? p.rotationDeg[1] : 0) * D2R,
      (Number.isFinite(p.rotationDeg?.[2]) ? p.rotationDeg[2] : 0) * D2R,
    );
    mesh.scale.set(
      Math.max(0.015, Number.isFinite(p.scale?.[0]) ? p.scale[0] : 0.3),
      Math.max(0.015, Number.isFinite(p.scale?.[1]) ? p.scale[1] : 0.3),
      Math.max(0.015, Number.isFinite(p.scale?.[2]) ? p.scale[2] : 0.3),
    );
    assembly.add(mesh);
  }

  root.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(assembly);
  const size = bbox.getSize(new THREE.Vector3());

  // Normalize height if user selected an explicit target height
  if (blueprint.targetHeightMeters > 0 && size.y > 0.001) {
    const scaleFactor = blueprint.targetHeightMeters / size.y;
    assembly.scale.multiplyScalar(scaleFactor);
    root.updateMatrixWorld(true);
    bbox.setFromObject(assembly);
  }

  // Ground bottom cleanly at y = 0 and center XZ around (0, 0)
  const center = bbox.getCenter(new THREE.Vector3());
  assembly.position.x -= center.x;
  assembly.position.z -= center.z;
  assembly.position.y -= bbox.min.y;
  root.updateMatrixWorld(true);

  return { root, disposables: { geometries, materials } };
}

export async function assembleAndExportGlb(blueprint: AiModelBlueprint): Promise<BuiltAiAsset> {
  const { root, disposables } = buildGroupFromBlueprint(blueprint);
  const finalBox = new THREE.Box3().setFromObject(root);
  const finalSize = finalBox.getSize(new THREE.Vector3());

  const exporter = new GLTFExporter();
  try {
    const result = await exporter.parseAsync(root, { binary: true });
    if (!(result instanceof ArrayBuffer)) {
      throw new Error("GLTFExporter did not return a binary GLB buffer.");
    }
    const blob = new Blob([result], { type: "model/gltf-binary" });
    const url = URL.createObjectURL(blob);
    return {
      blueprint,
      blob,
      url,
      bounds: [
        Math.round(finalSize.x * 100) / 100,
        Math.round(finalSize.y * 100) / 100,
        Math.round(finalSize.z * 100) / 100,
      ],
      partCount: blueprint.parts.length,
    };
  } finally {
    for (const g of disposables.geometries) g.dispose();
    for (const m of disposables.materials) m.dispose();
  }
}

export function downloadBuiltAiAsset(asset: BuiltAiAsset): void {
  const href = asset.url;
  const a = document.createElement("a");
  a.href = href;
  a.download = `${asset.blueprint.id}.glb`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
