import React, { useRef, useState } from "react";
import { Button, Input, Modal, Segmented, Select, Switch, Tooltip } from "antd";
import { AlertCircle, Cog, ImagePlus, Lock, Sparkles, Trash2 } from "lucide-react";
import type { AiGenerateOptions } from "../../lib/workTypes";
import HelpTip from "../../components/HelpTip";

interface Props {
  open: boolean;
  isAdmin: boolean;
  prompt: string;
  generating: boolean;
  error: string | null;
  onPromptChange: (val: string) => void;
  onClose: () => void;
  onGenerate: (options: AiGenerateOptions) => Promise<boolean>;
}

const AI_QUICK_PROMPTS = [
  { label: "Delivery Rover", prompt: "Autonomous warehouse delivery rover with 4 rugged wheels, cyan lidar dome, and cargo tray" },
  { label: "Charging Kiosk", prompt: "Industrial EV robot charging station kiosk with glowing cyan status screen and power cable" },
  { label: "Gantry Crane", prompt: "Yellow overhead gantry frame crane with trolley beam and hanging lifting hook" },
  { label: "Control Desk", prompt: "Futuristic operator control desk with curved dual monitors and illuminated console" },
  { label: "Robotic Arm", prompt: "6-axis orange industrial articulated robotic arm on heavy bolted pedestal with dual-finger gripper" },
  { label: "Forklift", prompt: "Electric warehouse counterbalanced forklift with roll cage, mast rails, and dual steel forks" },
];

const JOINT_PRESETS = [
  { label: "Robotic Arm (3-axis)", text: "base_yaw (revolute Y ±180°), shoulder_pitch (revolute X ±90°), elbow_pitch (revolute X ±110°)" },
  { label: "Spinning Wheels", text: "wheel_fl, wheel_fr, wheel_rl, wheel_rr (continuous rolling wheels around X axle)" },
  { label: "Fork / Elevator Lift", text: "mast_lift (prismatic vertical Y lift 0..1.4m)" },
  { label: "Rotating Turret", text: "turret_yaw (revolute vertical Y ±180°), scanner_tilt (revolute X ±45°)" },
  { label: "Hinged Door / Lid", text: "door_hinge (revolute vertical Y 0..110°)" },
];

const STYLE_OPTIONS = [
  { value: "", label: "Auto / Any style" },
  { value: "Industrial warehouse equipment", label: "Industrial Equipment" },
  { value: "Autonomous robotics & AGV", label: "Autonomous Robot" },
  { value: "Logistics vehicle / forklift / drone", label: "Vehicle / Drone" },
  { value: "Control station & modular furniture", label: "Workstation / Furniture" },
  { value: "Architectural structure / enclosure", label: "Architecture / Structure" },
];

async function fileToResizedBase64(file: File): Promise<{ mimeType: string; data: string; previewUrl: string }> {
  const allowed = ["image/png", "image/jpeg", "image/webp"];
  if (!allowed.includes(file.type)) {
    throw new Error("Please upload a PNG, JPG, or WEBP image.");
  }

  const rawUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read image file."));
      el.src = rawUrl;
    });

    const maxSide = 1024;
    const scale = Math.min(1, maxSide / Math.max(img.width || 1, img.height || 1));
    const w = Math.max(1, Math.round((img.width || 1) * scale));
    const h = Math.max(1, Math.round((img.height || 1) * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable.");
    ctx.drawImage(img, 0, 0, w, h);

    const outMime = file.type === "image/png" ? "image/png" : "image/jpeg";
    const dataUrl = canvas.toDataURL(outMime, 0.88);
    const commaIdx = dataUrl.indexOf(",");
    return {
      mimeType: outMime,
      data: commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl,
      previewUrl: dataUrl,
    };
  } finally {
    URL.revokeObjectURL(rawUrl);
  }
}

export default function AiDetailModal({
  open,
  isAdmin,
  prompt,
  generating,
  error,
  onPromptChange,
  onClose,
  onGenerate,
}: Props) {
  const imgInputRef = useRef<HTMLInputElement>(null);
  const [targetHeight, setTargetHeight] = useState<number>(1.5);
  const [autoPlace, setAutoPlace] = useState(true);
  const [style, setStyle] = useState("");
  const [materials, setMaterials] = useState("");
  const [extraDetails, setExtraDetails] = useState("");
  const [partDensity, setPartDensity] = useState<"standard" | "high">("standard");
  const [includeJoints, setIncludeJoints] = useState(false);
  const [jointDetails, setJointDetails] = useState("");
  const [refImage, setRefImage] = useState<{ mimeType: string; data: string; previewUrl: string; name: string } | null>(null);
  const [imgErr, setImgErr] = useState<string | null>(null);

  const handleImageFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setImgErr(null);
    try {
      const encoded = await fileToResizedBase64(file);
      setRefImage({ ...encoded, name: file.name });
    } catch (e) {
      setImgErr(e instanceof Error ? e.message : "Failed to load reference image.");
    }
  };

  const handleSubmit = async () => {
    const clean = prompt.trim();
    if (!clean || generating || !isAdmin) return;
    const ok = await onGenerate({
      prompt: clean,
      targetHeight,
      autoPlace,
      style: style || undefined,
      materials: materials.trim() || undefined,
      extraDetails: extraDetails.trim() || undefined,
      partDensity,
      includeJoints,
      jointDetails: includeJoints ? jointDetails.trim() || undefined : undefined,
      referenceImage: refImage ? { mimeType: refImage.mimeType, data: refImage.data } : null,
    });
    if (ok) onClose();
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={620}
      destroyOnClose={false}
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Sparkles size={16} color="#22d3ee" />
          AI 3D Model Generator — Detail Mode
        </span>
      }
      footer={[
        <Button key="cancel" onClick={onClose} disabled={generating}>
          Close
        </Button>,
        <Button
          key="generate"
          type="primary"
          className="btn-glow"
          icon={<Sparkles size={14} />}
          loading={generating}
          disabled={!isAdmin || !prompt.trim()}
          onClick={handleSubmit}
        >
          Generate 3D Model
        </Button>,
      ]}
    >
      {!isAdmin && (
        <div className="work-ai-error" style={{ marginBottom: 12 }}>
          <Lock size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Only users with role = admin can generate AI 3D models.</span>
        </div>
      )}

      <div className="work-ai-detail-form">
        <div>
          <div className="work-field-label">Model Prompt</div>
          <Input.TextArea
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder="Describe the 3D asset you want to build (silhouette, purpose, key components)..."
            autoSize={{ minRows: 2, maxRows: 4 }}
            maxLength={600}
            disabled={generating}
          />
          <div className="work-ai-presets" style={{ marginTop: 6 }}>
            {AI_QUICK_PROMPTS.map((q) => (
              <button
                key={q.label}
                type="button"
                className="work-ai-preset-btn"
                disabled={generating}
                onClick={() => onPromptChange(q.prompt)}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="work-field-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span>Reference Image (Optional)</span>
            <HelpTip content="Gemini will inspect this image for proportions, parts & colors." />
          </div>
          <div className="work-ai-img-row">
            <label
              className="work-ai-img-drop"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleImageFile(e.dataTransfer.files);
              }}
            >
              {refImage ? (
                <img src={refImage.previewUrl} alt="Reference" className="work-ai-img-thumb" />
              ) : (
                <div className="work-ai-img-empty">
                  <ImagePlus size={18} />
                  <span>Click or drop reference image (PNG, JPG, WEBP)</span>
                </div>
              )}
              <input
                ref={imgInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: "none" }}
                disabled={generating}
                onChange={(e) => {
                  handleImageFile(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            {refImage && (
              <div className="work-ai-img-meta">
                <div className="work-list-title" title={refImage.name}>{refImage.name}</div>
                <Button
                  size="small"
                  danger
                  icon={<Trash2 size={12} />}
                  disabled={generating}
                  onClick={() => setRefImage(null)}
                  style={{ marginTop: 6, alignSelf: "flex-start" }}
                >
                  Remove image
                </Button>
              </div>
            )}
          </div>
          {imgErr && (
            <div className="work-ai-error" style={{ marginTop: 6 }}>
              <AlertCircle size={13} />
              <span>{imgErr}</span>
            </div>
          )}
        </div>

        <div className="work-ai-detail-grid">
          <div>
            <div className="work-field-label">Style / Category</div>
            <Select
              style={{ width: "100%" }}
              value={style}
              onChange={setStyle}
              disabled={generating}
              options={STYLE_OPTIONS}
            />
          </div>
          <div>
            <div className="work-field-label">Target Height</div>
            <Select
              style={{ width: "100%" }}
              value={targetHeight}
              onChange={setTargetHeight}
              disabled={generating}
              options={[
                { value: 0, label: "Auto realistic size" },
                { value: 0.8, label: "0.8 m (compact)" },
                { value: 1.5, label: "1.5 m (medium)" },
                { value: 2.5, label: "2.5 m (tall)" },
                { value: 4.0, label: "4.0 m (machinery)" },
                { value: 6.0, label: "6.0 m (structure)" },
              ]}
            />
          </div>
          <div>
            <div className="work-field-label">Part Complexity</div>
            <Segmented
              block
              value={partDensity}
              onChange={(v) => setPartDensity(v as "standard" | "high")}
              disabled={generating}
              options={[
                { value: "standard", label: "Standard (10–16)" },
                { value: "high", label: "High (16–26)" },
              ]}
            />
          </div>
          <div>
            <div className="work-field-label">Scene Placement</div>
            <div className="work-pref-row" style={{ paddingTop: 4 }}>
              <span>Place on floor after build</span>
              <Switch size="small" checked={autoPlace} onChange={setAutoPlace} disabled={generating} />
            </div>
          </div>
        </div>

        <div>
          <div className="work-field-label">Materials & Color Palette (Optional)</div>
          <Input
            value={materials}
            onChange={(e) => setMaterials(e.target.value)}
            placeholder="e.g. Brushed steel frame, safety yellow housing, dark rubber tires, cyan LED strip"
            maxLength={240}
            disabled={generating}
          />
        </div>

        <div>
          <div className="work-field-label">Structural & Geometry Details (Optional)</div>
          <Input.TextArea
            value={extraDetails}
            onChange={(e) => setExtraDetails(e.target.value)}
            placeholder="e.g. Include safety guardrails, front bumper sensors, dual control screen, bolted base plate..."
            autoSize={{ minRows: 2, maxRows: 3 }}
            maxLength={400}
            disabled={generating}
          />
        </div>

        <div className="work-ai-joint-box">
          <div className="work-pref-row" style={{ padding: 0 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
              <Cog size={14} color="#22d3ee" />
              Articulated Joints (Inspector Sliders & Scriptable)
            </span>
            <Tooltip title="Generate movable revolute, continuous, or prismatic joints inside the GLB">
              <Switch size="small" checked={includeJoints} onChange={setIncludeJoints} disabled={generating} />
            </Tooltip>
          </div>
          {includeJoints && (
            <>
              <div className="work-ai-presets" style={{ marginTop: 8 }}>
                {JOINT_PRESETS.map((jp) => (
                  <button
                    key={jp.label}
                    type="button"
                    className="work-ai-preset-btn"
                    disabled={generating}
                    onClick={() => setJointDetails(jp.text)}
                  >
                    {jp.label}
                  </button>
                ))}
              </div>
              <Input.TextArea
                style={{ marginTop: 6 }}
                value={jointDetails}
                onChange={(e) => setJointDetails(e.target.value)}
                placeholder="Describe desired moving joints (e.g. rotating turret around Y, hinged boom arm, sliding fork lift)..."
                autoSize={{ minRows: 2, maxRows: 3 }}
                maxLength={300}
                disabled={generating}
              />
            </>
          )}
        </div>

        {error && (
          <div className="work-ai-error">
            <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
