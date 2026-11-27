import React, { useMemo, useState } from "react";
import { Button, Collapse, ColorPicker, Dropdown, Input, InputNumber, Select, Slider, Switch } from "antd";
import { ChevronDown, ChevronUp, Code2, Copy, Plus, Trash2 } from "lucide-react";
import { childrenIndex, descendantsOf } from "../../lib/sceneMath";
import {
  getEntityAsset,
  getEntityScript,
  ROBOT_ASSETS,
  STATIC_OBSTACLE_ASSETS,
  type JointDef,
  type LightProps,
  type MeshRendererComponent,
  type SceneObjectData,
  type Vec3,
} from "../../lib/workTypes";
import { assetToProfileId, parseScript, ROBOT_SCRIPT_TEMPLATES, SCRIPT_TEMPLATES } from "./script";
import ScriptEditorModal from "./ScriptEditorModal";
import HelpTip from "../../components/HelpTip";

interface Props {
  object: SceneObjectData;
  objects: SceneObjectData[];
  joints: JointDef[];
  assetUrls: Record<string, string>;
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
  const asset = getEntityAsset(o);
  const script = getEntityScript(o);
  const renderer = o.components.renderer;
  const light = o.components.light;
  const isRobot = o.kind === "robot";
  const canConvertToRobot = o.kind === "obstacle" && Boolean(renderer) && !STATIC_OBSTACLE_ASSETS.has(asset ?? "");
  const canConvertToObstacle = isRobot && Boolean(renderer) && !ROBOT_ASSETS.has(asset ?? "");

  const [studioOpen, setStudioOpen] = useState(false);
  const hasKids = useMemo(() => (childrenIndex(p.objects).get(o.id)?.length ?? 0) > 0, [p.objects, o.id]);
  const parentOptions = useMemo(() => {
    const banned = descendantsOf(p.objects, o.id);
    return [
      { value: "", label: "— none (scene root) —" },
      ...p.objects.filter((x) => !banned.has(x.id) && x.kind !== "light").map((x) => ({ value: x.id, label: x.label })),
    ];
  }, [p.objects, o.id]);
  const parse = useMemo(() => (script ? parseScript(script) : null), [script]);

  const setVec = (field: "position" | "rotation", axis: 0 | 1 | 2, v: number | null) => {
    const next = [...o.transform[field]] as Vec3;
    next[axis] = v ?? 0;
    p.onChange({ transform: { ...o.transform, [field]: next } }, `${field}:${o.id}`);
  };
  const setRenderer = (patch: Partial<MeshRendererComponent>, key: string) => {
    if (!renderer) return;
    p.onChange({ components: { ...o.components, renderer: { ...renderer, ...patch } } }, key);
  };
  const setLight = (patch: Partial<LightProps>) => {
    if (!light) return;
    p.onChange({ components: { ...o.components, light: { ...light, ...patch } } }, `light:${o.id}`);
  };
  const setRobotScript = (val: string | undefined) => {
    if (!isRobot) return;
    p.onChange({ components: { ...o.components, robot: { script: val ?? "" } } }, `script:${o.id}`);
  };

  const convertToRobot = () => {
    if (!renderer) return;
    p.onChange(
      {
        kind: "robot",
        components: {
          ...o.components,
          renderer: { ...renderer, static: false },
          robot: { script: o.components.robot?.script ?? "" },
        },
      },
      `kind:${o.id}`,
    );
  };

  const convertToObstacle = () => {
    const nextComp = { ...o.components };
    delete nextComp.robot;
    p.onChange({ kind: "obstacle", components: nextComp }, `kind:${o.id}`);
  };

  const header = (
    <div className="work-inspector-head">
      {p.collapsed ? (
        <span className="work-inspector-title">{o.label}</span>
      ) : (
        <Input size="small" value={o.label} variant="borderless" className="work-inspector-name"
          onChange={(e) => p.onChange({ label: e.target.value.replace(/\s+/g, "-") }, `label:${o.id}`)}
          title="Scripts refer to entities by this label (no spaces)" />
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
            <InputNumber size="small" step={0.1} value={o.transform.position[i]} onChange={(v) => setVec("position", i, v)} /></label>
        ))}
      </div>
      <div className="work-vec-label">Rotation (°)</div>
      <div className="work-inspector-grid">
        {([0, 1, 2] as const).map((i) => (
          <label key={i}><span>{"XYZ"[i]}</span>
            <InputNumber size="small" step={15} value={o.transform.rotation[i]} onChange={(v) => setVec("rotation", i, v)} /></label>
        ))}
      </div>
      <div className="work-inspector-grid" style={{ marginTop: 6 }}>
        <label><span>Scale</span>
          <InputNumber size="small" step={0.1} min={0.01} max={50} value={o.transform.scale}
            onChange={(v) => p.onChange({ transform: { ...o.transform, scale: v ?? 1 } }, `scale:${o.id}`)} /></label>
      </div>
      <div className="work-vec-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span>Parent</span>
        <HelpTip content="Position is relative to parent." />
      </div>
      <Select size="small" showSearch optionFilterProp="label" style={{ width: "100%" }}
        value={o.parentId ?? ""} options={parentOptions} onChange={(v) => p.onReparent(v || null)} />
    </>
  );

  const opacityVal = Math.round((renderer?.opacity ?? 1) * 100);
  const meshRendererUi = renderer && (
    <>
      <div className="work-pref-row" title="Static entities are drawn with GPU instancing and never move. A static entity only counts if its ancestors are not dynamic models.">
        <span>Static (instanced)</span>
        <Switch size="small" checked={renderer.static} onChange={(v) => setRenderer({ static: v }, `static:${o.id}`)} />
      </div>
      <div className="work-joint-label" style={{ marginTop: 6 }}>
        <span>Opacity</span>
        <em>{opacityVal}%</em>
      </div>
      <Slider
        min={10}
        max={100}
        step={5}
        value={opacityVal}
        onChange={(v) => setRenderer({ opacity: v / 100 }, `opacity:${o.id}`)}
      />
      {hasKids && (
        <div className="work-btn-row" style={{ marginTop: 6 }}>
          <Button size="small" onClick={() => p.onStaticSubtree(true)}>Static: all children</Button>
          <Button size="small" onClick={() => p.onStaticSubtree(false)}>Dynamic: all</Button>
        </div>
      )}
    </>
  );

  const jointUi = isRobot && renderer
    ? p.joints.map((j) => {
        const val = renderer.joints[j.name] ?? 0;
        const angular = j.type !== "prismatic";
        const min = angular ? (j.type === "continuous" ? 0 : deg(j.lower)) : j.lower;
        const max = angular ? (j.type === "continuous" ? 360 : deg(j.upper)) : j.upper;
        return (
          <div className="work-joint-row" key={j.name}>
            <div className="work-joint-label">
              <span>{j.name}</span><em>{angular ? `${Math.round(deg(val))}°` : `${val.toFixed(2)} m`}</em>
            </div>
            <Slider min={min} max={max} step={angular ? 1 : 0.01} value={angular ? deg(val) : val}
              onChange={(v) => setRenderer({ joints: { ...renderer.joints, [j.name]: angular ? rad(v) : v } }, `joint:${o.id}:${j.name}`)} />
          </div>
        );
      })
    : [];

  const lightUi = light && (
    <>
      <div className="work-pref-row"><span>Type</span>
        <Select size="small" style={{ width: 130 }} value={light.type} onChange={(v) => setLight({ type: v })}
          options={[{ value: "point", label: "Point" }, { value: "spot", label: "Spot" }, { value: "directional", label: "Directional" }]} /></div>
      <div className="work-pref-row"><span>Colour</span>
        <ColorPicker size="small" value={light.color} onChange={(c) => setLight({ color: c.toHexString() })} /></div>
      <div className="work-joint-label"><span>Intensity</span><em>{light.intensity}</em></div>
      <Slider min={0} max={light.type === "directional" ? 8 : 60} step={0.5} value={light.intensity} onChange={(v) => setLight({ intensity: v })} />
      {light.type !== "directional" && (
        <>
          <div className="work-joint-label"><span>Range (0 = unlimited)</span><em>{light.distance} m</em></div>
          <Slider min={0} max={40} value={light.distance} onChange={(v) => setLight({ distance: v })} />
        </>
      )}
      {light.type === "spot" && (
        <>
          <div className="work-joint-label"><span>Cone angle</span><em>{light.angle}°</em></div>
          <Slider min={5} max={85} value={light.angle} onChange={(v) => setLight({ angle: v })} />
        </>
      )}
      <div className="work-pref-row"><span>Cast shadows</span>
        <Switch size="small" checked={light.castShadow} onChange={(v) => setLight({ castShadow: v })} /></div>
    </>
  );

  const quickTemplates = useMemo(() => {
    const profile = assetToProfileId(asset);
    const specific = ROBOT_SCRIPT_TEMPLATES.filter((t) => t.profile === profile);
    return specific.length > 0 ? specific : SCRIPT_TEMPLATES;
  }, [asset]);

  const robotScriptUi = isRobot && (
    <>
      <div className="work-btn-row" style={{ marginBottom: 6 }}>
        <Button
          size="small"
          type="primary"
          ghost
          icon={<Code2 size={13} />}
          onClick={() => setStudioOpen(true)}
        >
          Template Studio (3D Demo)
        </Button>
        <Dropdown trigger={["click"]}
          menu={{
            items: quickTemplates.map((t, i) => ({ key: String(i), label: t.name })),
            onClick: ({ key }) => setRobotScript(quickTemplates[Number(key)].script),
          }}>
          <Button size="small">Quick ▾</Button>
        </Dropdown>
        {script?.trim() && <Button size="small" onClick={() => setRobotScript("")}>Clear</Button>}
        {canConvertToObstacle && (
          <Button size="small" danger type="text" onClick={convertToObstacle} title="Remove Robot Script component (make Obstacle)">
            Remove
          </Button>
        )}
      </div>
      <Input.TextArea className="work-script" rows={8} spellCheck={false} value={script ?? ""}
        placeholder={"# runs in Play mode, e.g.\ngoto R0-3 0 1.25\nlift 0.15\npick tote"}
        onChange={(e) => setRobotScript(e.target.value)} />
      {parse && parse.errors.length > 0 && (
        <div className="work-script-errors">
          {parse.errors.slice(0, 5).map((e, i) => <div key={i}>line {e.line}: {e.message}</div>)}
        </div>
      )}
      {parse && parse.errors.length === 0 && script?.trim() && <div className="work-hint">✓ {parse.program.length} instructions</div>}
      <ScriptEditorModal
        open={studioOpen}
        object={o}
        joints={p.joints}
        assetUrls={p.assetUrls}
        onClose={() => setStudioOpen(false)}
        onApply={(nextScript) => setRobotScript(nextScript)}
      />
    </>
  );

  const items = [
    { key: "t", label: "Transform", children: transform },
    ...(meshRendererUi ? [{ key: "f", label: "Mesh Renderer", children: meshRendererUi }] : []),
    ...(jointUi.length ? [{ key: "j", label: `Joints (${jointUi.length})`, children: <>{jointUi}</> }] : []),
    ...(lightUi
      ? [
          {
            key: "l",
            label: (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span>Light</span>
                <HelpTip
                  content={
                    <div>
                      <div>
                        <b>Aiming:</b>{" "}
                        {light?.type === "point"
                          ? "Point emits 360° in all directions."
                          : "Shines along local −Y (arrow). Press E or edit Rotation X/Z to aim."}
                      </div>
                      <div style={{ marginTop: 4 }}>
                        <b>Headlight tip:</b> Set <b>Parent</b> above to a robot/drone so the light moves with it.
                      </div>
                    </div>
                  }
                />
              </span>
            ),
            children: lightUi,
          },
        ]
      : []),
    ...(robotScriptUi ? [{ key: "b", label: "Robot Script", children: robotScriptUi }] : []),
  ];

  return (
    <div className="work-inspector evol-glass-card">
      {header}
      <div className="work-inspector-sub">
        <span className={`work-kind-pill kind-${o.kind}`}>{o.kind}</span>
        {asset ? ` · ${asset}` : ""}
      </div>
      <Collapse ghost size="small" className="work-collapse" defaultActiveKey={["t", "f", "l", "j", "b"]} items={items} />
      {canConvertToRobot && (
        <div className="work-add-comp-wrap">
          <Button size="small" block icon={<Plus size={12} />} onClick={convertToRobot}>
            Add Component · Robot Script
          </Button>
        </div>
      )}
    </div>
  );
}
