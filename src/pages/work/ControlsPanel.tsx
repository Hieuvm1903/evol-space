import React from "react";
import { SlidersHorizontal, Gamepad2, RotateCcw } from "lucide-react";
import type { BehaviorState, TransformState } from "./types";

const RAD = Math.PI / 180;

interface Props {
  transform: TransformState;
  behavior: BehaviorState;
  disabled: boolean;
  onTransformChange: (t: TransformState) => void;
  onBehaviorChange: (b: BehaviorState) => void;
  onReset: () => void;
}

function Toggle({ active, onChange, label }: { active: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="work-toggle-row">
      <span className="work-toggle-label">{label}</span>
      <button type="button" className={`work-toggle${active ? " active" : ""}`} onClick={() => onChange(!active)}>
        <span className="work-toggle-dot" />
      </button>
    </div>
  );
}

function Slider({
  label, value, min, max, step, unit = "", onChange,
}: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }) {
  const percent = ((value - min) / (max - min)) * 100;
  return (
    <div className="work-field">
      <div className="work-field-label"><span>{label}</span><span>{value.toFixed(2)}{unit}</span></div>
      <input
        type="range"
        className="work-range"
        min={min} max={max} step={step} value={value}
        style={{ ["--fill" as any]: `${percent}%` }}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

export default function ControlsPanel({ transform, behavior, disabled, onTransformChange, onBehaviorChange, onReset }: Props) {
  function setPos(i: number, v: number) {
    const next = [...transform.position] as [number, number, number];
    next[i] = v;
    onTransformChange({ ...transform, position: next });
  }
  function setRotDeg(i: number, deg: number) {
    const next = [...transform.rotation] as [number, number, number];
    next[i] = deg * RAD;
    onTransformChange({ ...transform, rotation: next });
  }

  return (
    <fieldset disabled={disabled} style={{ border: "none", padding: 0, margin: 0, opacity: disabled ? 0.5 : 1 }}>
      <h3 className="work-section-title"><SlidersHorizontal size={13} /> Transform</h3>
      <Slider label="Position X" value={transform.position[0]} min={-5} max={5} step={0.05} onChange={(v) => setPos(0, v)} />
      <Slider label="Position Y" value={transform.position[1]} min={-5} max={5} step={0.05} onChange={(v) => setPos(1, v)} />
      <Slider label="Position Z" value={transform.position[2]} min={-5} max={5} step={0.05} onChange={(v) => setPos(2, v)} />
      <Slider label="Rotation X" value={transform.rotation[0] / RAD} min={-180} max={180} step={1} unit="°" onChange={(v) => setRotDeg(0, v)} />
      <Slider label="Rotation Y" value={transform.rotation[1] / RAD} min={-180} max={180} step={1} unit="°" onChange={(v) => setRotDeg(1, v)} />
      <Slider label="Rotation Z" value={transform.rotation[2] / RAD} min={-180} max={180} step={1} unit="°" onChange={(v) => setRotDeg(2, v)} />
      <Slider label="Scale" value={transform.scale} min={0.1} max={4} step={0.05} onChange={(v) => onTransformChange({ ...transform, scale: v })} />

      <h3 className="work-section-title" style={{ marginTop: 18 }}><Gamepad2 size={13} /> Behavior</h3>

      <Toggle label="Auto-rotate" active={behavior.autoRotate} onChange={(v) => onBehaviorChange({ ...behavior, autoRotate: v })} />
      {behavior.autoRotate && (
        <>
          <div className="work-field">
            <div className="work-field-label"><span>Axis</span></div>
            <select
              className="work-select"
              value={behavior.rotateAxis}
              onChange={(e) => onBehaviorChange({ ...behavior, rotateAxis: e.target.value as "x" | "y" | "z" })}
            >
              <option value="x">X</option>
              <option value="y">Y</option>
              <option value="z">Z</option>
            </select>
          </div>
          <Slider label="Spin speed" value={behavior.rotateSpeed} min={0.1} max={4} step={0.1} unit=" rad/s" onChange={(v) => onBehaviorChange({ ...behavior, rotateSpeed: v })} />
        </>
      )}

      <Toggle label="Bobbing" active={behavior.bobbing} onChange={(v) => onBehaviorChange({ ...behavior, bobbing: v })} />
      {behavior.bobbing && (
        <>
          <Slider label="Amplitude" value={behavior.bobAmplitude} min={0.02} max={1} step={0.02} onChange={(v) => onBehaviorChange({ ...behavior, bobAmplitude: v })} />
          <Slider label="Bob speed" value={behavior.bobSpeed} min={0.2} max={4} step={0.1} onChange={(v) => onBehaviorChange({ ...behavior, bobSpeed: v })} />
        </>
      )}

      <Toggle label="Drive mode" active={behavior.driveEnabled} onChange={(v) => onBehaviorChange({ ...behavior, driveEnabled: v })} />
      {behavior.driveEnabled && (
        <>
          <Slider label="Drive speed" value={behavior.driveSpeed} min={0.2} max={5} step={0.1} unit=" u/s" onChange={(v) => onBehaviorChange({ ...behavior, driveSpeed: v })} />
          <Slider label="Turn speed" value={behavior.turnSpeed} min={0.2} max={5} step={0.1} unit=" rad/s" onChange={(v) => onBehaviorChange({ ...behavior, turnSpeed: v })} />
          <p className="work-hint">W/↑ forward · S/↓ back · A/D or ←/→ strafe · Q/E turn</p>
        </>
      )}

      <button type="button" className="work-reset-btn" onClick={onReset}>
        <RotateCcw size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
        Reset transform
      </button>
    </fieldset>
  );
}