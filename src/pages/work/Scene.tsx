import React, { Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import ModelMesh from "./ModelMesh";
import ModelErrorBoundary from "./ModelErrorBoundary";
import type { BehaviorState, LoadedModel, ModelStats, TransformState } from "./types";
import type { DriveKeys } from "./useKeyboardDrive";

function LoadingPlaceholder() {
  return (
    <mesh rotation={[0.4, 0.4, 0]}>
      <boxGeometry args={[0.6, 0.6, 0.6]} />
      <meshBasicMaterial color="#8b6ff5" wireframe />
    </mesh>
  );
}

/** Non-rendering component that samples frame timing every ~500ms and
 * reports FPS back out to the DOM-side HUD. */
function FpsMeter({ onUpdate }: { onUpdate: (fps: number) => void }) {
  const frames = React.useRef(0);
  const last = React.useRef(performance.now());
  useFrame(() => {
    frames.current++;
    const now = performance.now();
    const elapsed = now - last.current;
    if (elapsed >= 500) {
      onUpdate(Math.round((frames.current * 1000) / elapsed));
      frames.current = 0;
      last.current = now;
    }
  });
  return null;
}

interface Props {
  model: LoadedModel | null;
  transform: TransformState;
  behavior: BehaviorState;
  driveKeysRef: React.MutableRefObject<DriveKeys>;
  resetToken: number;
  onStats: (s: ModelStats) => void;
  onFps: (fps: number) => void;
  onLoadError: (message: string) => void;
}

export default function Scene({
  model, transform, behavior, driveKeysRef, resetToken, onStats, onFps, onLoadError,
}: Props) {
  return (
    <Canvas camera={{ position: [3, 2.5, 3], fov: 50 }} dpr={[1, 2]}>
      <color attach="background" args={["#0b0a16"]} />
      <hemisphereLight args={["#8b6ff5", "#07060f", 0.6]} />
      <directionalLight position={[5, 8, 5]} intensity={1.1} />
      <directionalLight position={[-5, 3, -4]} intensity={0.35} />
      <gridHelper args={[20, 20, "#4a4670", "#221f38"]} />
      <axesHelper args={[1.5]} />

      {model && (
        <ModelErrorBoundary
          key={model.id}
          onError={(e) => onLoadError(`Couldn't load "${model.name}" — ${e.message || "unsupported or corrupted file"}.`)}
        >
          <Suspense fallback={<LoadingPlaceholder />}>
            <ModelMesh
              model={model}
              transform={transform}
              behavior={behavior}
              driveKeysRef={driveKeysRef}
              onStats={onStats}
              resetToken={resetToken}
            />
          </Suspense>
        </ModelErrorBoundary>
      )}

      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
      <FpsMeter onUpdate={onFps} />
    </Canvas>
  );
}