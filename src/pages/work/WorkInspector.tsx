import React from "react";
import { Button, Input, InputNumber, Slider } from "antd";
import { Copy, Trash2 } from "lucide-react";
import type { JointDef, SceneObjectData } from "../../lib/workTypes";

interface Props {
  object: SceneObjectData;
  joints: JointDef[];
  onChange: (patch: Partial<SceneObjectData>, key: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

export default function WorkInspector({ object: o, joints, onChange, onDuplicate, onDelete }: Props) {
  const setPos = (axis: 0 | 1 | 2, v: number | null) => {
    const p = [...o.position] as SceneObjectData["position"];
    p[axis] = v ?? 0;
    onChange({ position: p }, `pos:${o.id}`);
  };

  return (
    <div className="work-inspector evol-glass-card">
      <div className="work-inspector-head">
        <Input
          size="small" value={o.label} variant="borderless" className="work-inspector-name"
          onChange={(e) => onChange({ label: e.target.value }, `label:${o.id}`)}
        />
        <Button size="small" icon={<Copy size={13} />} onClick={onDuplicate} title="Duplicate (Ctrl+D)" />
        <Button size="small" danger icon={<Trash2 size={13} />} onClick={onDelete} title="Delete (Del)" />
      </div>
      <div className="work-inspector-sub">{o.asset}</div>

      <div className="work-inspector-grid">
        {(["X", "Y", "Z"] as const).map((a, i) => (
          <label key={a}>
            <span>{a}</span>
            <InputNumber size="small" step={0.1} value={o.position[i]} onChange={(v) => setPos(i as 0 | 1 | 2, v)} />
          </label>
        ))}
        <label>
          <span>Yaw°</span>
          <InputNumber size="small" step={15} value={o.rotationY} onChange={(v) => onChange({ rotationY: v ?? 0 }, `rot:${o.id}`)} />
        </label>
        <label>
          <span>Scale</span>
          <InputNumber size="small" step={0.1} min={0.1} max={10} value={o.scale} onChange={(v) => onChange({ scale: v ?? 1 }, `scale:${o.id}`)} />
        </label>
      </div>

      {joints.length > 0 && <div className="work-inspector-sub" style={{ marginTop: 10 }}>Joints</div>}
      {joints.map((j) => {
        const val = o.joints[j.name] ?? 0;
        const angular = j.type !== "prismatic";
        const min = angular ? (j.type === "continuous" ? 0 : deg(j.lower)) : j.lower;
        const max = angular ? (j.type === "continuous" ? 360 : deg(j.upper)) : j.upper;
        return (
          <div className="work-joint-row" key={j.name}>
            <div className="work-joint-label">
              <span>{j.name}</span>
              <em>{angular ? `${Math.round(deg(val))}°` : `${val.toFixed(2)} m`}</em>
            </div>
            <Slider
              min={min} max={max} step={angular ? 1 : 0.01}
              value={angular ? deg(val) : val}
              onChange={(v) => onChange({ joints: { ...o.joints, [j.name]: angular ? rad(v) : v } }, `joint:${o.id}:${j.name}`)}
            />
          </div>
        );
      })}
    </div>
  );
}
