import React, { useCallback, useEffect, useState } from "react";
import { Hammer } from "lucide-react";
import Scene from "./Scene";
import FileUploadPanel from "./FileUploadPanel";
import ControlsPanel from "./ControlsPanel";
import StatsHud from "./StatsHud";
import { useKeyboardDrive } from "./useKeyboardDrive";
import {
  DEFAULT_BEHAVIOR, DEFAULT_TRANSFORM,
  type BehaviorState, type LoadedModel, type ModelStats, type TransformState,
} from "./types";
import "./WorkPage.css";

export function WorkPage() {
  const [models, setModels] = useState<LoadedModel[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transform, setTransform] = useState<TransformState>(DEFAULT_TRANSFORM);
  const [behavior, setBehavior] = useState<BehaviorState>(DEFAULT_BEHAVIOR);
  const [resetToken, setResetToken] = useState(0);
  const [stats, setStats] = useState<ModelStats | null>(null);
  const [fps, setFps] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const driveKeysRef = useKeyboardDrive(behavior.driveEnabled);
  const selectedModel = models.find((m) => m.id === selectedId) ?? null;

  const handleFilesAdded = useCallback((added: LoadedModel[]) => {
    setModels((cur) => [...cur, ...added]);
    setSelectedId(added[added.length - 1].id);
    setLoadError(null);
    setTransform(DEFAULT_TRANSFORM);
    setResetToken((t) => t + 1);
  }, []);

  function handleSelect(id: string) {
    setSelectedId(id);
    setTransform(DEFAULT_TRANSFORM);
    setStats(null);
    setLoadError(null);
    setResetToken((t) => t + 1);
  }

  function handleRemove(id: string) {
    setModels((cur) => {
      const target = cur.find((m) => m.id === id);
      if (target) URL.revokeObjectURL(target.url);
      const next = cur.filter((m) => m.id !== id);
      if (id === selectedId) setSelectedId(next[0]?.id ?? null);
      return next;
    });
  }

  function handleReset() {
    setTransform(DEFAULT_TRANSFORM);
    setResetToken((t) => t + 1);
  }

  // Revoke every remaining object URL when the page unmounts.
  useEffect(() => () => { models.forEach((m) => URL.revokeObjectURL(m.url)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page work-page-shell">
      <div className="work-page-heading">
        <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <Hammer size={20} color="#8b6ff5" /> Work
        </h2>
      </div>
      <p className="work-page-sub">Load a mesh, poke at its transform, and test some simple driving/animation behavior.</p>

      <div className="work-layout">
        <div className="work-sidebar">
          <div className="work-sidebar-scroll">
            <FileUploadPanel
              models={models}
              selectedId={selectedId}
              onFilesAdded={handleFilesAdded}
              onSelect={handleSelect}
              onRemove={handleRemove}
            />
            <ControlsPanel
              transform={transform}
              behavior={behavior}
              disabled={!selectedModel}
              onTransformChange={setTransform}
              onBehaviorChange={setBehavior}
              onReset={handleReset}
            />
          </div>
        </div>

        <div className="work-canvas-wrap">
          <Scene
            model={selectedModel}
            transform={transform}
            behavior={behavior}
            driveKeysRef={driveKeysRef}
            resetToken={resetToken}
            onStats={setStats}
            onFps={setFps}
            onLoadError={setLoadError}
          />
          <StatsHud fps={fps} stats={selectedModel ? stats : null} modelName={selectedModel?.name} />
          {!selectedModel && (
            <div className="work-empty-hint">Upload or pick a mesh on the left to get started.</div>
          )}
          {loadError && <div className="work-load-error">{loadError}</div>}
        </div>
      </div>
    </div>
  );
}