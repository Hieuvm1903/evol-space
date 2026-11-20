import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { supabase } from "../../lib/supabaseClient";
import type { AiGenerateOptions, AiModelBlueprint, AiPartShape, Vec3 } from "../../lib/workTypes";

export interface BuiltAiAsset {
  blueprint: AiModelBlueprint;
  blob: Blob;
  url: string;
  bounds: [number, number, number];
  partCount: number;
  jointCount: number;
}

const D2R = Math.PI / 180;

export async function requestAiModelBlueprint(
  options: AiGenerateOptions,
): Promise<AiModelBlueprint> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new Error("Please log in with an admin account to generate AI models.");
  }

  const res = await fetch("/api/work/generate-model", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      prompt: options.prompt,
      targetHeight: options.targetHeight,
      style: options.style || undefined,
      materials: options.materials || undefined,
      extraDetails: options.extraDetails || undefined,
      partDensity: options.partDensity || "standard",
      includeJoints: Boolean(options.includeJoints),
      jointDetails: options.jointDetails || undefined,
      referenceImage: options.referenceImage || undefined,
    }),
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
      const geo = new THREE.CapsuleGeometry(0.32, 0.36, 8, 20);
      geo.scale(1 / 0.64, 1, 1 / 0.64);
      return geo;
    }
    case "ring": {
      const geo = new THREE.TorusGeometry(0.38, 0.12, 14, 28);
      geo.rotateX(Math.PI / 2);
      geo.scale(1, 1 / 0.24, 1);
      return geo;
    }
    case "octahedron":
      return new THREE.OctahedronGeometry(0.5, 0);
    case "box":
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

function buildGroupFromBlueprint(blueprint: AiModelBlueprint): {
  root: THREE.Group;
  jointCount: number;
  disposables: { geometries: THREE.BufferGeometry[]; materials: THREE.Material[] };
} {
  const root = new THREE.Group();
  root.name = blueprint.id;

  const assembly = new THREE.Group();
  assembly.name = "assembly";
  root.add(assembly);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  // First pass: construct un-jointed meshes in a temporary group to measure raw bounding box accurately
  const tempMeasure = new THREE.Group();
  const builtParts = blueprint.parts.map((p, i) => {
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

    const px = Number.isFinite(p.position?.[0]) ? p.position[0] : 0;
    const py = Number.isFinite(p.position?.[1]) ? p.position[1] : 0.5;
    const pz = Number.isFinite(p.position?.[2]) ? p.position[2] : 0;
    mesh.position.set(px, py, pz);
    mesh.rotation.set(
      (Number.isFinite(p.rotationDeg?.[0]) ? p.rotationDeg[0] : 0) * D2R,
      (Number.isFinite(p.rotationDeg?.[1]) ? p.rotationDeg[1] : 0) * D2R,
      (Number.isFinite(p.rotationDeg?.[2]) ? p.rotationDeg[2] : 0) * D2R,
    );
    const sx = Math.max(0.015, Number.isFinite(p.scale?.[0]) ? p.scale[0] : 0.3);
    const sy = Math.max(0.015, Number.isFinite(p.scale?.[1]) ? p.scale[1] : 0.3);
    const sz = Math.max(0.015, Number.isFinite(p.scale?.[2]) ? p.scale[2] : 0.3);
    mesh.scale.set(sx, sy, sz);

    tempMeasure.add(mesh);
    return { part: p, mesh, rawPos: new THREE.Vector3(px, py, pz), rawScale: [sx, sy, sz] as Vec3 };
  });

  tempMeasure.updateMatrixWorld(true);
  const rawBox = new THREE.Box3().setFromObject(tempMeasure);
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const rawCenter = rawBox.getCenter(new THREE.Vector3());
  tempMeasure.clear();

  const scaleFactor =
    blueprint.targetHeightMeters > 0 && rawSize.y > 0.001
      ? blueprint.targetHeightMeters / rawSize.y
      : 1;

  const toFinalPoint = (v: Vec3 | THREE.Vector3): THREE.Vector3 => {
    const x = Array.isArray(v) ? v[0] : v.x;
    const y = Array.isArray(v) ? v[1] : v.y;
    const z = Array.isArray(v) ? v[2] : v.z;
    return new THREE.Vector3(
      (x - rawCenter.x) * scaleFactor,
      (y - rawBox.min.y) * scaleFactor,
      (z - rawCenter.z) * scaleFactor,
    );
  };

  // Build hierarchical joint groups (if blueprint specifies joints)
  const jointsList = Array.isArray(blueprint.joints) ? blueprint.joints : [];
  const jointMap = new Map<
    string,
    { group: THREE.Group; worldPivot: THREE.Vector3; parentJoint?: string }
  >();

  for (const j of jointsList) {
    const group = new THREE.Group();
    group.name = j.name;
    const axis = new THREE.Vector3(
      j.axis?.[0] ?? 0,
      j.axis?.[1] ?? 1,
      j.axis?.[2] ?? 0,
    );
    if (axis.lengthSq() < 1e-6) axis.set(0, 1, 0);
    axis.normalize();

    const isPrismatic = j.type === "prismatic";
    group.userData.s3d_joint = {
      name: j.name,
      type: j.type,
      axis: [axis.x, axis.y, axis.z],
      lower: isPrismatic ? j.lower * scaleFactor : j.lower,
      upper: isPrismatic ? j.upper * scaleFactor : j.upper,
    };

    const worldPivot = toFinalPoint(j.pivot ?? [0, 0.5, 0]);
    jointMap.set(j.name, { group, worldPivot, parentJoint: j.parentJoint });
  }

  for (const info of jointMap.values()) {
    const parentInfo = info.parentJoint ? jointMap.get(info.parentJoint) : undefined;
    if (parentInfo && parentInfo !== info) {
      info.group.position.copy(info.worldPivot).sub(parentInfo.worldPivot);
      parentInfo.group.add(info.group);
    } else {
      info.group.position.copy(info.worldPivot);
      assembly.add(info.group);
    }
  }

  // Attach parts to their joint group (or directly to assembly) in final scaled coordinates
  for (const item of builtParts) {
    const finalPos = toFinalPoint(item.rawPos);
    item.mesh.scale.set(
      item.rawScale[0] * scaleFactor,
      item.rawScale[1] * scaleFactor,
      item.rawScale[2] * scaleFactor,
    );

    const ownerJoint = item.part.joint ? jointMap.get(item.part.joint) : undefined;
    if (ownerJoint) {
      item.mesh.position.copy(finalPos).sub(ownerJoint.worldPivot);
      ownerJoint.group.add(item.mesh);
    } else {
      item.mesh.position.copy(finalPos);
      assembly.add(item.mesh);
    }
  }

  // Prune any empty joint groups (that have zero descendant meshes) so GLTFExporter doesn't emit orphan nodes
  let validJointCount = 0;
  for (const [name, info] of jointMap.entries()) {
    let hasMesh = false;
    info.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) hasMesh = true;
    });
    if (!hasMesh) {
      info.group.removeFromParent();
      jointMap.delete(name);
    } else {
      validJointCount++;
    }
  }

  root.updateMatrixWorld(true);
  return { root, jointCount: validJointCount, disposables: { geometries, materials } };
}

export async function assembleAndExportGlb(blueprint: AiModelBlueprint): Promise<BuiltAiAsset> {
  const { root, jointCount, disposables } = buildGroupFromBlueprint(blueprint);
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
      jointCount,
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
