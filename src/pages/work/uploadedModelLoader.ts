import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { detectFormat, type MeshFormat } from "./types";

export interface UploadedModelAsset {
  id: string;
  name: string;
  format: MeshFormat;
  blob: Blob;
  url: string;
  bounds: [number, number, number];
  partCount: number;
  jointCount: number;
  createdAt: string;
}

function makeUploadId(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 22);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `up_${slug || "mesh"}_${suffix}`;
}

function inspectObjectMetrics(root: THREE.Object3D): {
  bounds: [number, number, number];
  partCount: number;
  jointCount: number;
} {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  let partCount = 0;
  let jointCount = 0;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) partCount++;
    if (o.userData?.s3d_joint && Array.isArray(o.userData.s3d_joint.axis)) jointCount++;
  });
  return {
    bounds: [
      Math.round(size.x * 100) / 100,
      Math.round(size.y * 100) / 100,
      Math.round(size.z * 100) / 100,
    ],
    partCount: Math.max(1, partCount),
    jointCount,
  };
}

function normalizeAndGroundMesh(obj: THREE.Object3D): THREE.Group {
  const wrapper = new THREE.Group();
  wrapper.name = "uploaded_root";
  wrapper.add(obj);
  wrapper.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  // Normalize extreme CAD units (e.g. millimetres or microscopic scales) into usable workspace metres
  const scale = maxDim > 18 || maxDim < 0.08 ? 1.5 / maxDim : 1;
  obj.scale.multiplyScalar(scale);
  wrapper.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(obj);
  const center = scaledBox.getCenter(new THREE.Vector3());
  obj.position.x -= center.x;
  obj.position.z -= center.z;
  obj.position.y -= scaledBox.min.y;
  wrapper.updateMatrixWorld(true);

  return wrapper;
}

function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) mat?.dispose();
  });
}

export async function loadUploadedModelFile(file: File): Promise<UploadedModelAsset> {
  const format = detectFormat(file.name);
  if (!format) {
    throw new Error(`Unsupported file "${file.name}". Allowed: .glb, .gltf, .obj, .stl`);
  }

  const displayName = file.name.replace(/\.[^.]+$/, "").trim().slice(0, 48) || "Uploaded Model";
  const id = makeUploadId(file.name);

  if (format === "glb") {
    const buffer = await file.arrayBuffer();
    const loader = new GLTFLoader();
    const gltf = await loader.parseAsync(buffer, "");
    const metrics = inspectObjectMetrics(gltf.scene);
    disposeObjectTree(gltf.scene);
    const url = URL.createObjectURL(file);
    return {
      id,
      name: displayName,
      format,
      blob: file,
      url,
      ...metrics,
      createdAt: new Date().toISOString(),
    };
  }

  let root: THREE.Object3D;
  if (format === "gltf") {
    const text = await file.text();
    const loader = new GLTFLoader();
    const gltf = await loader.parseAsync(text, "");
    root = gltf.scene;
  } else if (format === "obj") {
    const text = await file.text();
    const rawObj = new OBJLoader().parse(text);
    rawObj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !m.material) {
        m.material = new THREE.MeshStandardMaterial({ color: "#94a3b8", metalness: 0.25, roughness: 0.55 });
      }
    });
    root = normalizeAndGroundMesh(rawObj);
  } else {
    const buffer = await file.arrayBuffer();
    const geometry = new STLLoader().parse(buffer);
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: "#8b6ff5",
      metalness: 0.2,
      roughness: 0.48,
    });
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = displayName;
    root = normalizeAndGroundMesh(mesh);
  }

  const metrics = inspectObjectMetrics(root);
  const exporter = new GLTFExporter();
  try {
    const exported = await exporter.parseAsync(root, { binary: true });
    if (!(exported instanceof ArrayBuffer)) {
      throw new Error(`Could not convert "${file.name}" into GLB.`);
    }
    const blob = new Blob([exported], { type: "model/gltf-binary" });
    const url = URL.createObjectURL(blob);
    return {
      id,
      name: displayName,
      format,
      blob,
      url,
      ...metrics,
      createdAt: new Date().toISOString(),
    };
  } finally {
    disposeObjectTree(root);
  }
}

export function downloadUploadedAsset(asset: UploadedModelAsset): void {
  const a = document.createElement("a");
  a.href = asset.url;
  a.download = `${asset.id}.glb`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
