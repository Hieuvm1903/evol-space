import React, { useMemo } from "react";
import { Button, Collapse, ColorPicker, Dropdown, Input, InputNumber, Select, Slider, Switch } from "antd";
import { ChevronDown, ChevronUp, Copy, Trash2 } from "lucide-react";
import { childrenIndex, descendantsOf } from "../../lib/sceneMath";
import type { JointDef, LightProps, SceneObjectData, Vec3 } from "../../lib/workTypes";
import { parseScript, SCRIPT_TEMPLATES } from "./script";

interface Props {
  object: SceneObjectData;
  objects: SceneObjectData[];
  joints: JointDef[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onChange: (patch: Partial<SceneObjectData>, key: string) => void;
  onReparent: (parentId: string | null) => void;
  onStaticSubtree: (value: boolean) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

export default function WorkInspector(p: Props) {
  const o = p.object;
  const hasKids = useMemo(() => (childrenIndex(p.objects).get(o.id)?.length ?? 0) > 0, [p.objects, o.id]);
  const parentOptions = useMemo(() => {
    const banned = descendantsOf(p.objects, o.id);
    return [
      { value: "", label: "— none (scene root) —" },
      ...p.objects.filter((x) => !banned.has(x.id) && x.kind !== "light").map((x) => ({ value: x.id, label: x.label })),
    ];
  }, [p.objects, o.id]);
  const parse = useMemo(() => (o.script ? parseScript(o.script) : null), [o.script]);

  const setVec = (field: "position" | "rotation", axis: 0 | 1 | 2, v: number | null) => {
    const next = [...o[field]] as Vec3;
    next[axis] = v ?? 0;
    p.onChange({ [field]: next } as Partial<SceneObjectData>, `${field}:${o.id}`);
  };
  const setLight = (patch: Partial<LightProps>) =>
    p.onChange({ light: { ...o.light!, ...patch } }, `light:${o.id}`);

  const header = (
    <div className="work-inspector-head">
      {p.collapsed ? (
        <span className="work-inspector-title">{o.label}</span>
      ) : (
        <Input size="small" value={o.label} variant="borderless" className="work-inspector-name"
          onChange={(e) => p.onChange({ label: e.target.value.replace(/\s+/g, "-") }, `label:${o.id}`)}
          title="Scripts refer to objects by this label (no spaces)" />
      )}
      {!p.collapsed && (
        <>
          <Button size="small" icon={<Copy size={13} />} onClick={p.onDuplicate} title="Duplicate with children (Ctrl+D)" />
          <Button size="small" danger icon={<Trash2 size={13} />} onClick={p.onDelete} title="Delete with children (Del)" />
        </>
      )}
      <Button size="small" type="text" onClick={p.onToggleCollapsed} title={p.collapsed ? "Expand" : "Collapse"}
        icon={p.collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />} />
    </div>
  );

  if (p.collapsed) return <div className="work-inspector evol-glass-card">{header}</div>;

  const transform = (
    <>
      <div className="work-vec-label">Position (m)</div>
      <div className="work-inspector-grid">
        {([0, 1, 2] as const).map((i) => (
          <label key={i}><span>{"XYZ"[i]}</span>
            <InputNumber size="small" step={0.1} value={o.position[i]} onChange={(v) => setVec("position", i, v)} /></label>
        ))}
      </div>
      <div className="work-vec-label">Rotation (°)</div>
      <div className="work-inspector-grid">
        {([0, 1, 2] as const).map((i) => (
          <label key={i}><span>{"XYZ"[i]}</span>
            <InputNumber size="small" step={15} value={o.rotation[i]} onChange={(v) => setVec("rotation", i, v)} /></label>
        ))}
      </div>
      <div className="work-inspector-grid" style={{ marginTop: 6 }}>
        <label><span>Scale</span>
          <InputNumber size="small" step={0.1} min={0.01} max={50} value={o.scale}
            onChange={(v) => p.onChange({ scale: v ?? 1 }, `scale:${o.id}`)} /></label>
      </div>
      <div className="work-vec-label">Parent <em>(position is relative to it)</em></div>
      <Select size="small" showSearch optionFilterProp="label" style={{ width: "100%" }}
        value={o.parentId ?? ""} options={parentOptions} onChange={(v) => p.onReparent(v || null)} />
    </>
  );

  const flags = o.kind !== "light" && (
    <>
      <div className="work-pref-row" title="Static objects are drawn with GPU instancing and never move. A static object only counts if its parents are static too.">
        <span>Static (instanced)</span>
        <Switch size="small" checked={o.static} onChange={(v) => p.onChange({ static: v }, `static:${o.id}`)} />
      </div>
      {hasKids && (
        <div className="work-btn-row" style={{ marginTop: 6 }}>
          <Button size="small" onClick={() => p.onStaticSubtree(true)}>Static: all children</Button>
          <Button size="small" onClick={() => p.onStaticSubtree(false)}>Dynamic: all</Button>
        </div>
      )}
    </>
  );

  const jointUi = p.joints.map((j) => {
    const val = o.joints[j.name] ?? 0;
    const angular = j.type !== "prismatic";
    const min = angular ? (j.type === "continuous" ? 0 : deg(j.lower)) : j.lower;
    const max = angular ? (j.type === "continuous" ? 360 : deg(j.upper)) : j.upper;
    return (
      <div className="work-joint-row" key={j.name}>
        <div className="work-joint-label">
          <span>{j.name}</span><em>{angular ? `${Math.round(deg(val))}°` : `${val.toFixed(2)} m`}</em>
        </div>
        <Slider min={min} max={max} step={angular ? 1 : 0.01} value={angular ? deg(val) : val}
          onChange={(v) => p.onChange({ joints: { ...o.joints, [j.name]: angular ? rad(v) : v } }, `joint:${o.id}:${j.name}`)} />
      </div>
    );
  });

  const lightUi = o.light && (
    <>
      <div className="work-pref-row"><span>Type</span>
        <Select size="small" style={{ width: 130 }} value={o.light.type} onChange={(v) => setLight({ type: v })}
          options={[{ value: "point", label: "Point" }, { value: "spot", label: "Spot" }, { value: "directional", label: "Directional" }]} /></div>
      <div className="work-pref-row"><span>Colour</span>
        <ColorPicker size="small" value={o.light.color} onChange={(c) => setLight({ color: c.toHexString() })} /></div>
      <div className="work-joint-label"><span>Intensity</span><em>{o.light.intensity}</em></div>
      <Slider min={0} max={o.light.type === "directional" ? 8 : 60} step={0.5} value={o.light.intensity} onChange={(v) => setLight({ intensity: v })} />
      {o.light.type !== "directional" && (
        <>
          <div className="work-joint-label"><span>Range (0 = unlimited)</span><em>{o.light.distance} m</em></div>
          <Slider min={0} max={40} value={o.light.distance} onChange={(v) => setLight({ distance: v })} />
        </>
      )}
      {o.light.type === "spot" && (
        <>
          <div className="work-joint-label"><span>Cone angle</span><em>{o.light.angle}°</em></div>
          <Slider min={5} max={85} value={o.light.angle} onChange={(v) => setLight({ angle: v })} />
        </>
      )}
      <div className="work-pref-row"><span>Cast shadows</span>
        <Switch size="small" checked={o.light.castShadow} onChange={(v) => setLight({ castShadow: v })} /></div>
      {o.light.type !== "point" && <div className="work-hint">Shines along the object's −Y axis — rotate it to aim.</div>}
    </>
  );

  const behaviour = o.kind === "model" && (
    <>
      <div className="work-btn-row" style={{ marginBottom: 6 }}>
        <Dropdown trigger={["click"]}
          menu={{
            items: SCRIPT_TEMPLATES.map((t, i) => ({ key: String(i), label: t.name })),
            onClick: ({ key }) => p.onChange({ script: SCRIPT_TEMPLATES[Number(key)].script }, `script:${o.id}`),
          }}>
          <Button size="small">Insert template ▾</Button>
        </Dropdown>
        {o.script && <Button size="small" onClick={() => p.onChange({ script: undefined }, `script:${o.id}`)}>Clear</Button>}
      </div>
      <Input.TextArea className="work-script" rows={10} spellCheck={false} value={o.script ?? ""}
        placeholder={"# runs in Play mode, e.g.\ngoto R0-3 0 1.25\nlift 0.15\npick tote"}
        onChange={(e) => p.onChange({ script: e.target.value || undefined }, `script:${o.id}`)} />
      {parse && parse.errors.length > 0 && (
        <div className="work-script-errors">
          {parse.errors.slice(0, 5).map((e, i) => <div key={i}>line {e.line}: {e.message}</div>)}
        </div>
      )}
      {parse && parse.errors.length === 0 && o.script?.trim() && <div className="work-hint">✓ {parse.program.length} instructions</div>}
    </>
  );

  const items = [
    { key: "t", label: "Transform", children: transform },
    ...(flags ? [{ key: "f", label: "Rendering", children: flags }] : []),
    ...(p.joints.length ? [{ key: "j", label: `Joints (${p.joints.length})`, children: <>{jointUi}</> }] : []),
    ...(lightUi ? [{ key: "l", label: "Light", children: lightUi }] : []),
    ...(behaviour ? [{ key: "b", label: "Behaviour script", children: behaviour }] : []),
  ];

  return (
    <div className="work-inspector evol-glass-card">
      {header}
      <div className="work-inspector-sub">{o.kind}{o.asset ? ` · ${o.asset}` : ""}</div>
      <Collapse ghost size="small" className="work-collapse" defaultActiveKey={["t", "l", "j", "b"]} items={items} />
    </div>
  );
}
