import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { BASE_ORTHO_SPAN, BASE_PERSP_FOV } from "./lodCompute";

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

export const ZONE_PALETTE: Record<string, string> = {
  dock: "#10b981",
  racking: "#6366f1",
  robot_cell: "#ec4899",
  conveyor: "#22d3ee",
  amr_parking: "#f59e0b",
  staging: "#8b6ff5",
  safety: "#ef4444",
  custom: "#38bdf8",
};

export const DEFAULT_ZONES: ZoneDef[] = [
  { id: "receiving", name: "Receiving Dock", kind: "dock", x: [-9.2, 9.2], z: [-4.9, -2.5], color: "#10b981" },
  { id: "storage", name: "Storage Aisles", kind: "racking", x: [-4.5, 4.5], z: [-0.8, 8.2], color: "#6366f1" },
  { id: "picking", name: "Robotic Pick Cell", kind: "robot_cell", x: [-10.4, -6.5], z: [-2.4, 0.8], color: "#ec4899" },
  { id: "shipping", name: "Shipping Corridor", kind: "conveyor", x: [5.5, 11.4], z: [-1.4, 10.2], color: "#22d3ee" },
  { id: "charging", name: "AMR Charging Bay", kind: "amr_parking", x: [-11.3, -8.2], z: [3.6, 6.3], color: "#f59e0b" },
];

/** Procedural PBR studio environment map + matching depth fog. */
export function StudioEnvironment({
  fogColor = "#07060f",
  fogDensity = 0.011,
  envIntensity = 0.48,
}: {
  fogColor?: string;
  fogDensity?: number;
  envIntensity?: number;
}) {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();
    const env = new RoomEnvironment();
    const rt = pmrem.fromScene(env, 0.04);
    const prevEnv = scene.environment;
    scene.environment = rt.texture;
    return () => {
      scene.environment = prevEnv;
      rt.dispose();
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  useEffect(() => {
    scene.environmentIntensity = envIntensity;
  }, [scene, envIntensity]);

  return <fogExp2 attach="fog" args={[fogColor, fogDensity]} />;
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
  const animZoom = useRef<number | null>(null);
  const prevFollowPos = useRef<THREE.Vector3 | null>(null);
  const tmpV = useMemo(() => new THREE.Vector3(), []);
  const tmpM = useMemo(() => new THREE.Matrix4(), []);

  useEffect(() => {
    if (presetSeq === 0) return;
    const cfg = CAMERA_PRESETS[preset];
    const targetV = new THREE.Vector3(...cfg.target);
    const posV = new THREE.Vector3(...cfg.pos);

    if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
      const dir = posV.clone().sub(targetV);
      const dist = Math.max(0.5, dir.length());
      dir.normalize();
      const visH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(BASE_PERSP_FOV) / 2);
      animZoom.current = THREE.MathUtils.clamp(BASE_ORTHO_SPAN / visH, 0.15, 25);
      // Keep orthographic camera safely outside geometry along the preset viewing ray
      animPos.current = targetV.clone().addScaledVector(dir, Math.max(dist, 32));
      animTarget.current = targetV;
    } else {
      animZoom.current = null;
      animPos.current = posV;
      animTarget.current = targetV;
    }
  }, [preset, presetSeq, camera]);

  useEffect(() => {
    prevFollowPos.current = null;
  }, [followId, followEnabled]);

  useEffect(() => {
    if (!controls) return;
    const cancel = () => {
      animPos.current = null;
      animTarget.current = null;
      animZoom.current = null;
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

      let zoomDone = true;
      if (animZoom.current !== null && (camera as THREE.OrthographicCamera).isOrthographicCamera) {
        const ortho = camera as THREE.OrthographicCamera;
        ortho.zoom = THREE.MathUtils.damp(ortho.zoom, animZoom.current, lambda, dt);
        ortho.updateProjectionMatrix();
        zoomDone = Math.abs(ortho.zoom - animZoom.current) < 0.01;
      }

      controls.update();
      if (
        zoomDone &&
        camera.position.distanceTo(animPos.current) < 0.04 &&
        controls.target.distanceTo(animTarget.current) < 0.04
      ) {
        animPos.current = null;
        animTarget.current = null;
        animZoom.current = null;
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
export function ZoneHeatmapOverlay({
  zones,
  telemetry,
  objects,
  worlds,
  runtime,
  selectedZoneId,
  interactive,
  onSelectZone,
}: {
  zones: ZoneDef[];
  telemetry: AssetTelemetry[];
  objects: SceneObjectData[];
  worlds: Map<string, THREE.Matrix4>;
  runtime: Runtime;
  selectedZoneId?: string | null;
  interactive?: boolean;
  onSelectZone?: (zoneId: string) => void;
}) {
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
    for (const z of zones) {
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
  }, [zones, telemetry, objects, worlds, runtime]);

  return (
    <group position={[0, 0.008, 0]}>
      {zones.map((z) => {
        const util = zoneMetrics[z.id] ?? 20;
        const color = z.color ?? ZONE_PALETTE[z.kind] ?? "#6366f1";
        const isSelected = selectedZoneId === z.id;
        const opacity = isSelected ? 0.24 : 0.06 + (util / 100) * 0.14;
        const x0 = Math.min(z.x[0], z.x[1]);
        const x1 = Math.max(z.x[0], z.x[1]);
        const z0 = Math.min(z.z[0], z.z[1]);
        const z1 = Math.max(z.z[0], z.z[1]);
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        const w = Math.max(0.2, x1 - x0);
        const d = Math.max(0.2, z1 - z0);
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
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              receiveShadow={false}
              onClick={
                interactive && onSelectZone
                  ? (e) => {
                      if (e.delta > 4) return;
                      e.stopPropagation();
                      onSelectZone(z.id);
                    }
                  : undefined
              }
            >
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
            <Line
              points={border}
              color={isSelected ? "#ffffff" : color}
              lineWidth={isSelected ? 2.4 : 1.2}
              transparent
              opacity={isSelected ? 0.95 : 0.55}
            />
            {isSelected && (
              <Html center position={[0, 0.18, 0]} style={{ pointerEvents: "none" }}>
                <div className="work-area-badge-3d" style={{ borderColor: color }}>
                  {z.name || z.id} · {w.toFixed(1)}×{d.toFixed(1)}m
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}

/** Two-click interactive floor area drawer (respects camera orbit drags via e.delta). */
export function FloorAreaDrawOverlay({
  active,
  snap,
  onComplete,
}: {
  active: boolean;
  snap: boolean;
  onComplete: (x: [number, number], z: [number, number]) => void;
}) {
  const [startPt, setStartPt] = useState<[number, number] | null>(null);
  const [hoverPt, setHoverPt] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!active) {
      setStartPt(null);
      setHoverPt(null);
    }
  }, [active]);

  if (!active) return null;

  const snapCoord = (n: number) => {
    const step = snap ? 0.5 : 0.1;
    return Math.round(n / step) * step;
  };

  const preview =
    startPt && hoverPt
      ? (() => {
          const x0 = Math.min(startPt[0], hoverPt[0]);
          const x1 = Math.max(startPt[0], hoverPt[0]);
          const z0 = Math.min(startPt[1], hoverPt[1]);
          const z1 = Math.max(startPt[1], hoverPt[1]);
          const w = Math.max(0.5, x1 - x0);
          const d = Math.max(0.5, z1 - z0);
          const cx = (x0 + x1) / 2;
          const cz = (z0 + z1) / 2;
          const hw = w / 2;
          const hd = d / 2;
          const border: [number, number, number][] = [
            [-hw, 0.02, -hd],
            [hw, 0.02, -hd],
            [hw, 0.02, hd],
            [-hw, 0.02, hd],
            [-hw, 0.02, -hd],
          ];
          return { cx, cz, w, d, border };
        })()
      : null;

  return (
    <group>
      <mesh
        position={[0, 0.004, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={(e) => {
          e.stopPropagation();
          setHoverPt([snapCoord(e.point.x), snapCoord(e.point.z)]);
        }}
        onClick={(e) => {
          if (e.delta > 4) return;
          e.stopPropagation();
          const px = snapCoord(e.point.x);
          const pz = snapCoord(e.point.z);
          if (!startPt) {
            setStartPt([px, pz]);
            setHoverPt([px, pz]);
          } else {
            let x0 = Math.min(startPt[0], px);
            let x1 = Math.max(startPt[0], px);
            let z0 = Math.min(startPt[1], pz);
            let z1 = Math.max(startPt[1], pz);
            if (x1 - x0 < 0.5) x1 = x0 + 1;
            if (z1 - z0 < 0.5) z1 = z0 + 1;
            setStartPt(null);
            setHoverPt(null);
            onComplete([Number(x0.toFixed(2)), Number(x1.toFixed(2))], [Number(z0.toFixed(2)), Number(z1.toFixed(2))]);
          }
        }}
      >
        <planeGeometry args={[160, 160]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {hoverPt && !startPt && (
        <mesh position={[hoverPt[0], 0.02, hoverPt[1]]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.14, 0.24, 24]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.85} depthWrite={false} />
        </mesh>
      )}

      {preview && (
        <group position={[preview.cx, 0, preview.cz]}>
          <mesh position={[0, 0.014, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[preview.w, preview.d]} />
            <meshBasicMaterial color="#22d3ee" transparent opacity={0.18} depthWrite={false} />
          </mesh>
          <Line points={preview.border} color="#22d3ee" lineWidth={2.2} dashed dashSize={0.35} gapSize={0.2} />
          <Html center position={[0, 0.22, 0]} style={{ pointerEvents: "none" }}>
            <div className="work-area-badge-3d" style={{ borderColor: "#22d3ee" }}>
              New Area · {preview.w.toFixed(1)}×{preview.d.toFixed(1)}m
            </div>
          </Html>
        </group>
      )}
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
  selectedZoneId,
  interactiveZones,
  showAreasInAuthor,
  onSelectZone,
  overlays,
  runtime,
}: {
  workspaceMode: WorkspaceMode;
  objects: SceneObjectData[];
  worlds: Map<string, THREE.Matrix4>;
  telemetryList: AssetTelemetry[];
  zones: ZoneDef[];
  selectedId: string | null;
  selectedZoneId?: string | null;
  interactiveZones?: boolean;
  showAreasInAuthor?: boolean;
  onSelectZone?: (zoneId: string) => void;
  overlays: TwinOverlayPrefs;
  runtime: Runtime;
}) {
  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);
  const telemetryById = useMemo(() => new Map(telemetryList.map((t) => [t.id, t])), [telemetryList]);

  const showZones =
    workspaceMode === "twin"
      ? overlays.zoneHeatmap || Boolean(interactiveZones)
      : Boolean(showAreasInAuthor) || Boolean(interactiveZones);

  return (
    <>
      {showZones && (
        <ZoneHeatmapOverlay
          zones={zones}
          telemetry={telemetryList}
          objects={objects}
          worlds={worlds}
          runtime={runtime}
          selectedZoneId={selectedZoneId}
          interactive={interactiveZones}
          onSelectZone={onSelectZone}
        />
      )}
      {workspaceMode === "twin" &&
        objects
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
