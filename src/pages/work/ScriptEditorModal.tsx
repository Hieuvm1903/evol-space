import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Modal, Segmented, Select, Tag, Tooltip } from "antd";
import { Code2, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import { getEntityAsset, getEntityScript, type JointDef, type SceneObjectData } from "../../lib/workTypes";
import {
  assetToProfileId,
  buildCustomJointTemplate,
  parseScript,
  ROBOT_PROFILES,
  ROBOT_SCRIPT_TEMPLATES,
  SCRIPT_COMMANDS,
  type RobotProfileId,
  type RobotScriptTemplate,
} from "./script";
import ScriptDemoScene, { type DemoPlaybackState } from "./ScriptDemoScene";
import HelpTip from "../../components/HelpTip";

interface Props {
  open: boolean;
  object: SceneObjectData;
  joints: JointDef[];
  assetUrls: Record<string, string>;
  onClose: () => void;
  onApply: (script: string | undefined) => void;
}

export default function ScriptEditorModal({
  open,
  object,
  joints,
  assetUrls,
  onClose,
  onApply,
}: Props) {
  const asset = getEntityAsset(object);
  const currentScript = getEntityScript(object) ?? "";
  const isStatic = Boolean(object.components.renderer?.static);
  const initialProfile = assetToProfileId(asset);
  const [profile, setProfile] = useState<RobotProfileId>(initialProfile);
  const [draft, setDraft] = useState(currentScript);
  const [playing, setPlaying] = useState(true);
  const [speedMult, setSpeedMult] = useState(1);
  const [resetToken, setResetToken] = useState(0);
  const [demoJoints, setDemoJoints] = useState<JointDef[]>(joints);
  const [status, setStatus] = useState<DemoPlaybackState>({
    state: "playing",
    op: "idle",
    note: "Ready",
  });
  const textAreaRef = useRef<any>(null);

  useEffect(() => {
    if (!open) return;
    const p = assetToProfileId(asset);
    setProfile(p);
    setDemoJoints(joints);
    if (currentScript.trim()) {
      setDraft(currentScript);
    } else {
      const first =
        buildCustomJointTemplate(joints) ??
        ROBOT_SCRIPT_TEMPLATES.find((t) => t.profile === p) ??
        ROBOT_SCRIPT_TEMPLATES[0];
      setDraft(first?.script ?? "");
    }
    setPlaying(true);
    setResetToken((n) => n + 1);
  }, [open, object.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeProfileMeta = useMemo(
    () => ROBOT_PROFILES.find((p) => p.id === profile) ?? ROBOT_PROFILES[0],
    [profile],
  );

  const demoAssetUrl = useMemo(() => {
    if (profile === initialProfile && asset && assetUrls[asset]) {
      return assetUrls[asset];
    }
    if (activeProfileMeta.assetKey && assetUrls[activeProfileMeta.assetKey]) {
      return assetUrls[activeProfileMeta.assetKey];
    }
    return undefined;
  }, [profile, initialProfile, asset, assetUrls, activeProfileMeta]);

  const availableJoints = useMemo(() => {
    if (demoJoints.length > 0) return demoJoints;
    if (profile === initialProfile && joints.length > 0) return joints;
    return activeProfileMeta.defaultJoints.map((name) => ({
      name,
      type: name.includes("slide") ? ("prismatic" as const) : ("revolute" as const),
      lower: name.includes("slide") ? 0 : -1.57,
      upper: name.includes("slide") ? 0.5 : 1.57,
    }));
  }, [demoJoints, profile, initialProfile, joints, activeProfileMeta]);

  const templates = useMemo(() => {
    const list: RobotScriptTemplate[] = ROBOT_SCRIPT_TEMPLATES.filter((t) => t.profile === profile);
    const customJointTpl =
      availableJoints.length > 0 && profile === "custom" ? buildCustomJointTemplate(availableJoints) : null;
    if (customJointTpl) list.unshift(customJointTpl);
    return list;
  }, [profile, availableJoints]);

  const parse = useMemo(() => parseScript(draft), [draft]);

  const insertSnippet = (snippet: string) => {
    const el: HTMLTextAreaElement | undefined = textAreaRef.current?.resizableTextArea?.textArea;
    if (el && typeof el.selectionStart === "number") {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const before = draft.slice(0, start);
      const after = draft.slice(end);
      const needLeadingNl = before.length > 0 && !before.endsWith("\n");
      const needTrailingNl = after.length > 0 && !after.startsWith("\n");
      const inserted = `${needLeadingNl ? "\n" : ""}${snippet}${needTrailingNl ? "\n" : ""}`;
      setDraft(before + inserted + after);
    } else {
      const needNl = draft.length > 0 && !draft.endsWith("\n");
      setDraft(`${draft}${needNl ? "\n" : ""}${snippet}\n`);
    }
  };

  const applyTemplate = (tpl: RobotScriptTemplate) => {
    setDraft(tpl.script);
    setPlaying(true);
    setResetToken((n) => n + 1);
  };

  const handleProfileChange = (nextProfile: RobotProfileId) => {
    setProfile(nextProfile);
    if (nextProfile === initialProfile && joints.length > 0) {
      setDemoJoints(joints);
    } else {
      setDemoJoints([]);
    }
    const first = ROBOT_SCRIPT_TEMPLATES.find((t) => t.profile === nextProfile);
    if (first) {
      setDraft(first.script);
      setPlaying(true);
      setResetToken((n) => n + 1);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={980}
      destroyOnClose
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Code2 size={16} style={{ color: "#22d3ee" }} />
          Robot Template Script Studio — <b>{object.label}</b>
        </span>
      }
      footer={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span className="work-hint" style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 6 }}>
            {isStatic && <span>Static entity</span>}
            <HelpTip
              placement="topLeft"
              content={
                isStatic
                  ? "Note: this robot is Static. Untick Static in Mesh Renderer to animate motion in Play mode."
                  : "Scripts run safely line-by-line in Play mode."
              }
            />
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              onClick={() => {
                setDraft(currentScript);
                setResetToken((n) => n + 1);
              }}
            >
              Revert
            </Button>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              type="primary"
              className="btn-glow"
              disabled={parse.errors.length > 0}
              onClick={() => {
                onApply(draft.trim() ? draft : undefined);
                onClose();
              }}
            >
              Apply Script
            </Button>
          </div>
        </div>
      }
    >
      <div className="work-script-studio">
        {/* Left pane: robot selector, templates, joint chips & code editor */}
        <div className="work-script-studio-left">
          <div>
            <div className="work-field-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span>Robot type</span>
              <HelpTip content={activeProfileMeta.subtitle} />
            </div>
            <Select
              size="small"
              style={{ width: "100%" }}
              value={profile}
              onChange={(v) => handleProfileChange(v as RobotProfileId)}
              options={ROBOT_PROFILES.map((p) => ({
                value: p.id,
                label: `${p.label}${p.id === initialProfile ? " (Current)" : ""}`,
              }))}
            />
          </div>

          <div>
            <div className="work-field-label">Templates for {activeProfileMeta.label}</div>
            <div className="work-script-tpl-list">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`work-script-tpl-card${draft.trim() === t.script.trim() ? " active" : ""}`}
                  onClick={() => applyTemplate(t)}
                >
                  <div className="work-script-tpl-title">
                    <Sparkles size={12} style={{ color: "#22d3ee", flexShrink: 0 }} />
                    <span>{t.name}</span>
                  </div>
                  <div className="work-script-tpl-desc">{t.summary}</div>
                  <div className="work-script-tpl-tags">
                    {t.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {availableJoints.length > 0 && (
            <div>
              <div className="work-field-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>Joints</span>
                <HelpTip content="Click a joint chip to insert its command into the script." />
              </div>
              <div className="work-script-chips">
                {availableJoints.map((j) => {
                  const target =
                    j.type === "continuous"
                      ? 1.57
                      : Number(((j.lower + j.upper) * 0.5 || 0.25).toFixed(2));
                  return (
                    <Tooltip
                      key={j.name}
                      title={`${j.type} (${j.lower.toFixed(2)} .. ${j.upper.toFixed(2)}) — click to insert`}
                    >
                      <button
                        type="button"
                        className="work-script-chip is-joint"
                        onClick={() => insertSnippet(`joint ${j.name} ${target}`)}
                      >
                        {j.name}
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div className="work-field-label">Quick commands</div>
            <div className="work-script-chips">
              {SCRIPT_COMMANDS.map((c) => (
                <Tooltip key={c.cmd} title={`${c.desc} — inserts "${c.snippet}"`}>
                  <button
                    type="button"
                    className="work-script-chip"
                    onClick={() => insertSnippet(c.snippet)}
                  >
                    {c.cmd}
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>

          <div className="work-script-editor-wrap">
            <div className="work-script-editor-head">
              <span>Script</span>
              {parse.errors.length === 0 ? (
                <span style={{ color: "#34d399" }}>✓ {parse.program.length} instructions</span>
              ) : (
                <span style={{ color: "#f87171" }}>{parse.errors.length} syntax issue(s)</span>
              )}
            </div>
            <Input.TextArea
              ref={textAreaRef}
              className="work-script"
              rows={9}
              spellCheck={false}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={"# Enter robot commands...\nspeed 1.2\nloop\n  goto 2.0 1.5\nend"}
            />
            {parse.errors.length > 0 && (
              <div className="work-script-errors">
                {parse.errors.slice(0, 4).map((e, i) => (
                  <div key={i}>line {e.line}: {e.message}</div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right pane: live small 3D demo scene */}
        <div className="work-script-studio-right">
          <div className="work-script-demo-bar">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Button
                size="small"
                type={playing ? "default" : "primary"}
                icon={playing ? <Pause size={12} /> : <Play size={12} />}
                onClick={() => setPlaying((v) => !v)}
              >
                {playing ? "Pause" : "Play"}
              </Button>
              <Button
                size="small"
                icon={<RotateCcw size={12} />}
                onClick={() => {
                  setResetToken((n) => n + 1);
                  setPlaying(true);
                }}
              >
                Reset
              </Button>
              <Segmented
                size="small"
                value={speedMult}
                onChange={(v) => setSpeedMult(Number(v))}
                options={[
                  { value: 0.5, label: "0.5×" },
                  { value: 1, label: "1×" },
                  { value: 2, label: "2×" },
                ]}
              />
            </div>
            <Tag
              color={
                status.state === "error"
                  ? "red"
                  : status.state === "playing"
                    ? "cyan"
                    : status.state === "done"
                      ? "green"
                      : "default"
              }
              style={{ marginRight: 0 }}
            >
              {status.op}: {status.note}
            </Tag>
          </div>

          <div className="work-script-demo-stage">
            {open && (
              <ScriptDemoScene
                profile={profile}
                assetUrl={demoAssetUrl}
                scriptText={draft}
                playing={playing}
                speedMultiplier={speedMult}
                resetToken={resetToken}
                onStatus={setStatus}
                onJointsDetected={setDemoJoints}
              />
            )}
            <div className="work-script-demo-overlay" style={{ justifyContent: "flex-end" }}>
              <HelpTip
                placement="topRight"
                content={
                  <div>
                    <div>Demo landmarks: <b>R0-3</b> (-2.2, -1.6) · <b>CV-1</b> (2.4, 1.4) · <b>tote</b></div>
                    <div>Drag to orbit · Scroll to zoom</div>
                  </div>
                }
              />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
