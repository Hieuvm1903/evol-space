import React, { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type {
  AssetTelemetry,
  CameraPreset,
  HealthStatus,
  SceneObjectData,
  TwinOverlayPrefs,
  Vec3,
  WorkspaceMode,
  ZoneDef,
} from "../../lib/workTypes";
import type { Runtime } from "./runtime";

const STATUS_COLORS: Record<HealthStatus, string> = {
  nominal: "#22d3ee",
  warning: "#f59e0b",
  fault: "#ef4444",
  offline: "#64748b",
};

const OVERLAY_ASSETS = new Set([
  "robot",
  "drone",
  "robot_arm",
  "robot_transfer",
  "humanoid",
  "truck",
  "conveyor",
  "station",
  "charger",
]);

const CAMERA_PRESETS: Record<CameraPreset, { pos: Vec3; target: Vec3 }> = {
  overview: { pos: [14.5, 11.5, 17.5], target: [0.0, 1.0, 2.2] },
  isometric: { pos: [17.0, 12.5, -13.0], target: [0.0, 1.0, 2.5] },
  top: { pos: [0.0, 28.0, 2.6], target: [0.0, 0.0, 2.5] },
  conveyor: { pos: [11.8, 4.2, 7.6], target: [6.8, 0.8, 3.6] },
  dock: { pos: [-9.5, 5.2, -13.5], target: [0.0, 1.4, -5.5] },
};

const ZONE_PALETTE: Record<string, string> = {
  dock: "#10b981",
  racking: "#6366f1",
  robot_cell: "#ec4899",
  conveyor: "#22d3ee",
  amr_parking: "#f59e0b",
};

const DEFAULT_ZONES: ZoneDef[] = [
  { id: "receiving", name: "Receiving Dock", kind: "dock", x: [-9.2, 9.2], z: [-4.9, -2.5], color: "#10b981" },
  { id: "storage", name: "Storage Aisles", kind: "racking", x: [-4.5, 4.5], z: [-0.8, 8.2], color: "#6366f1" },
  { id: "picking", name: "Robotic Pick Cell", kind: "robot_cell", x: [-10.4, -6.5], z: [-2.4, 0.8], color: "#ec4899" },
  { id: "shipping", name: "Shipping Corridor", kind: "conveyor", x: [5.5, 11.4], z: [-1.4, 10.2], color: "#22d3ee" },
  { id: "charging", name: "AMR Charging Bay", kind: "amr_parking", x: [-11.3, -8.2], z: [3.6, 6.3], color: "#f59e0b" },
];

/** Procedural PBR studio environment map + matching depth fog. */
export function StudioEnvironment() {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();
    const env = new RoomEnvironment();
    const rt = pmrem.fromScene(env, 0.04);
    const prevEnv = scene.environment;
    scene.environment = rt.texture;
    scene.environmentIntensity = 0.48;
    return () => {
      scene.environment = prevEnv;
      rt.dispose();
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  return <fogExp2 attach="fog" args={["#07060f", 0.011]} />;
}

/** Damped camera preset transitions + optional robot follow-cam, yielding cleanly to user OrbitControls drag. */
export function TwinCameraController({
  preset,
  presetSeq,
  followId,
  followEnabled,
  runtime,
  worlds,
}: {
  preset: CameraPreset;
  presetSeq: number;
  followId: string | null;
  followEnabled: boolean;
  runtime: Runtime;
  worlds: Map<string, THREE.Matrix4>;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as {
    target: THREE.Vector3;
    update: () => void;
    addEventListener: (ev: string, fn: () => void) => void;
    removeEventListener: (ev: string, fn: () => void) => void;
  } | null;

  const animPos = useRef<THREE.Vector3 | null>(null);
  const animTarget = useRef<THREE.Vector3 | null>(null);
  const prevFollowPos = useRef<THREE.Vector3 | null>(null);
  const tmpV = useMemo(() => new THREE.Vector3(), []);
  const tmpM = useMemo(() => new THREE.Matrix4(), []);

  useEffect(() => {
    if (presetSeq === 0) return;
    const cfg = CAMERA_PRESETS[preset];
    animPos.current = new THREE.Vector3(...cfg.pos);
    animTarget.current = new THREE.Vector3(...cfg.target);
  }, [preset, presetSeq]);

  useEffect(() => {
    prevFollowPos.current = null;
  }, [followId, followEnabled]);

  useEffect(() => {
    if (!controls) return;
    const cancel = () => {
      animPos.current = null;
      animTarget.current = null;
    };
    controls.addEventListener("start", cancel);
    return () => controls.removeEventListener("start", cancel);
  }, [controls]);

  useFrame((_, dt) => {
    if (!controls) return;
    if (animPos.current && animTarget.current) {
      const lambda = 6.5;
      camera.position.x = THREE.MathUtils.damp(camera.position.x, animPos.current.x, lambda, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, animPos.current.y, lambda, dt);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, animPos.current.z, lambda, dt);
      controls.target.x = THREE.MathUtils.damp(controls.target.x, animTarget.current.x, lambda, dt);
      controls.target.y = THREE.MathUtils.damp(controls.target.y, animTarget.current.y, lambda, dt);
      controls.target.z = THREE.MathUtils.damp(controls.target.z, animTarget.current.z, lambda, dt);
      controls.update();
      if (
        camera.position.distanceTo(animPos.current) < 0.04 &&
        controls.target.distanceTo(animTarget.current) < 0.04
      ) {
        animPos.current = null;
        animTarget.current = null;
      }
      return;
    }

    if (followEnabled && followId) {
      const entity = runtime.byId.get(followId);
      if (entity) {
        tmpV.copy(entity.pos);
      } else {
        const node = runtime.nodes.get(followId)?.group;
        if (node) {
          node.getWorldPosition(tmpV);
        } else {
          const wm = worlds.get(followId);
          if (!wm) return;
          tmpM.copy(wm);
          tmpV.setFromMatrixPosition(tmpM);
        }
      }
      if (!prevFollowPos.current) {
        prevFollowPos.current = tmpV.clone();
      } else {
        const dx = tmpV.x - prevFollowPos.current.x;
        const dz = tmpV.z - prevFollowPos.current.z;
        camera.position.x += dx;
        camera.position.z += dz;
        controls.target.x += dx;
        controls.target.z += dz;
        prevFollowPos.current.copy(tmpV);
        controls.update();
      }
    }
  });

  return null;
}

/** Spatial floor zones with polygonOffset so overlays never Z-fight the grid. */
function ZoneHeatmapOverlay({
  zones,
  telemetry,
  objects,
  worlds,
  runtime,
}: {
  zones: ZoneDef[];
  telemetry: AssetTelemetry[];
  objects: SceneObjectData[];
  worlds: Map<string, THREE.Matrix4>;
  runtime: Runtime;
}) {
  const activeZones = zones.length > 0 ? zones : DEFAULT_ZONES;

  const zoneMetrics = useMemo(() => {
    const tMap = new Map(telemetry.map((t) => [t.id, t]));
    const objPos = new Map<string, [number, number]>();
    const v = new THREE.Vector3();
    for (const o of objects) {
      if (o.kind !== "model") continue;
      const e = runtime.byId.get(o.id);
      if (e) {
        objPos.set(o.id, [e.pos.x, e.pos.z]);
      } else {
        const wm = worlds.get(o.id);
        if (wm) {
          v.setFromMatrixPosition(wm);
          objPos.set(o.id, [v.x, v.z]);
        } else {
          objPos.set(o.id, [o.position[0], o.position[2]]);
        }
      }
    }

    const out: Record<string, number> = {};
    for (const z of activeZones) {
      const inside: AssetTelemetry[] = [];
      for (const [id, [px, pz]] of objPos.entries()) {
        if (px >= z.x[0] && px <= z.x[1] && pz >= z.z[0] && pz <= z.z[1]) {
          const tm = tMap.get(id);
          if (tm && OVERLAY_ASSETS.has(tm.asset ?? "")) inside.push(tm);
        }
      }
      if (inside.length > 0) {
        out[z.id] = Math.round(inside.reduce((s, x) => s + x.utilizationPct, 0) / inside.length);
      } else {
        out[z.id] = z.kind === "racking" ? 38 : z.kind === "dock" ? 26 : 18;
      }
    }
    return out;
  }, [activeZones, telemetry, objects, worlds, runtime]);

  return (
    <group position={[0, 0.008, 0]}>
      {activeZones.map((z) => {
        const util = zoneMetrics[z.id] ?? 20;
        const color = z.color ?? ZONE_PALETTE[z.kind] ?? "#6366f1";
        const opacity = 0.05 + (util / 100) * 0.14;
        const cx = (z.x[0] + z.x[1]) / 2;
        const cz = (z.z[0] + z.z[1]) / 2;
        const w = Math.max(0.5, z.x[1] - z.x[0]);
        const d = Math.max(0.5, z.z[1] - z.z[0]);
        const hw = w / 2;
        const hd = d / 2;
        const border: [number, number, number][] = [
          [-hw, 0.004, -hd],
          [hw, 0.004, -hd],
          [hw, 0.004, hd],
          [-hw, 0.004, hd],
          [-hw, 0.004, -hd],
        ];
        return (
          <group key={z.id} position={[cx, 0, cz]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow={false}>
              <planeGeometry args={[w, d]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={opacity}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={-1}
              />
            </mesh>
            <Line points={border} color={color} lineWidth={1.2} transparent opacity={0.45} />
          </group>
        );
      })}
    </group>
  );
}

function overlayRadius(asset: string | null): number {
  switch (asset) {
    case "truck":
      return 2.6;
    case "robot_transfer":
      return 1.6;
    case "conveyor":
      return 1.15;
    case "station":
      return 0.8;
    case "charger":
      return 0.7;
    case "robot_arm":
      return 0.62;
    default:
      return 0.48;
  }
}

function overlayLabelY(asset: string | null): number {
  switch (asset) {
    case "truck":
      return 3.1;
    case "robot_transfer":
      return 2.25;
    case "humanoid":
      return 1.95;
    case "station":
      return 1.75;
    case "robot_arm":
      return 1.45;
    case "conveyor":
      return 1.1;
    case "charger":
      return 1.05;
    case "drone":
      return 0.55;
    default:
      return 0.65;
  }
}

/** Status ring halo + path trail + goal marker + optional floating label for each monitored asset. */
function AssetTwinOverlay({
  obj,
  telemetry,
  world,
  runtime,
  overlays,
  selected,
}: {
  obj: SceneObjectData;
  telemetry: AssetTelemetry;
  world: THREE.Matrix4 | undefined;
  runtime: Runtime;
  overlays: TwinOverlayPrefs;
  selected: boolean;
}) {
  const haloRef = useRef<THREE.Group>(null);
  const labelRef = useRef<THREE.Group>(null);
  const tmpV = useMemo(() => new THREE.Vector3(), []);
  const radius = overlayRadius(obj.asset);
  const labelY = overlayLabelY(obj.asset);

  useFrame(() => {
    const entity = runtime.byId.get(obj.id);
    let px = obj.position[0];
    let py = obj.position[1];
    let pz = obj.position[2];
    if (entity) {
      px = entity.pos.x;
      py = entity.pos.y;
      pz = entity.pos.z;
    } else if (world) {
      tmpV.setFromMatrixPosition(world);
      px = tmpV.x;
      py = tmpV.y;
      pz = tmpV.z;
    }
    if (haloRef.current) {
      haloRef.current.position.set(px, 0.015, pz);
    }
    if (labelRef.current) {
      labelRef.current.position.set(px, py + labelY, pz);
    }
  });

  const color = STATUS_COLORS[telemetry.status];
  const initPos = useMemo<Vec3>(() => {
    if (world) {
      const v = new THREE.Vector3().setFromMatrixPosition(world);
      return [v.x, v.y, v.z];
    }
    return obj.position;
  }, [world, obj.position]);

  const metricText =
    telemetry.status === "fault"
      ? "FAULT"
      : obj.asset === "robot" || obj.asset === "drone"
        ? `${telemetry.speedMps.toFixed(1)} m/s · ${Math.round(telemetry.batteryPct)}%`
        : obj.asset === "humanoid" || obj.asset === "truck"
          ? `${telemetry.speedMps.toFixed(1)} m/s · ${Math.round(telemetry.utilizationPct)}%`
          : `${Math.round(telemetry.utilizationPct)}% load`;

  return (
    <>
      <group ref={haloRef} position={[initPos[0], 0.015, initPos[2]]}>
        {overlays.statusHalos && (
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[radius * 0.86, radius, 36]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={selected ? 0.92 : telemetry.status === "fault" ? 0.85 : 0.55}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        )}
      </group>

      {overlays.floatingLabels && (
        <group ref={labelRef} position={[initPos[0], initPos[1] + labelY, initPos[2]]}>
          <Html center distanceFactor={14} style={{ pointerEvents: "none" }}>
            <div className={`twin-3d-badge status-${telemetry.status}${selected ? " is-selected" : ""}`}>
              <span className="twin-3d-name">{telemetry.label}</span>
              <span className="twin-3d-metric">{metricText}</span>
            </div>
          </Html>
        </group>
      )}

      {overlays.pathTrails && telemetry.trail.length >= 2 && (
        <Line
          points={telemetry.trail}
          color={selected ? "#f5c46b" : color}
          lineWidth={selected ? 2 : 1.3}
          transparent
          opacity={selected ? 0.85 : 0.45}
        />
      )}

      {overlays.pathTrails && telemetry.goal && (
        <mesh position={telemetry.goal} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.14, 0.21, 20]} />
          <meshBasicMaterial color="#f5c46b" transparent opacity={0.75} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
    </>
  );
}

export function TwinOverlays({
  workspaceMode,
  objects,
  worlds,
  telemetryList,
  zones,
  selectedId,
  overlays,
  runtime,
}: {
  workspaceMode: WorkspaceMode;
  objects: SceneObjectData[];
  worlds: Map<string, THREE.Matrix4>;
  telemetryList: AssetTelemetry[];
  zones: ZoneDef[];
  selectedId: string | null;
  overlays: TwinOverlayPrefs;
  runtime: Runtime;
}) {
  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);
  const telemetryById = useMemo(() => new Map(telemetryList.map((t) => [t.id, t])), [telemetryList]);

  if (workspaceMode !== "twin") return null;

  return (
    <>
      {overlays.zoneHeatmap && (
        <ZoneHeatmapOverlay
          zones={zones}
          telemetry={telemetryList}
          objects={objects}
          worlds={worlds}
          runtime={runtime}
        />
      )}
      {objects
        .filter((o) => o.kind === "model" && OVERLAY_ASSETS.has(o.asset ?? ""))
        .map((o) => {
          const t = telemetryById.get(o.id);
          if (!t) return null;
          return (
            <AssetTwinOverlay
              key={o.id}
              obj={byId.get(o.id)!}
              telemetry={t}
              world={worlds.get(o.id)}
              runtime={runtime}
              overlays={overlays}
              selected={selectedId === o.id}
            />
          );
        })}
    </>
  );
}
