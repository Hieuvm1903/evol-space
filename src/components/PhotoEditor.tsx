import React, { useEffect, useRef, useState } from "react";
import { Button, Input, Slider, Segmented } from "antd";
import { Sliders, Wand2, Frame, Sticker as StickerIcon, Pencil, Trash2, Undo2, Type } from "lucide-react";
import {
  DEFAULT_ADJ, FILTER_PRESETS, FRAME_OPTIONS, defaultEdit, drawSelection, hitSticker, renderEdit,
  type Adjustments, type EditState, type FrameId, type Sticker,
} from "../lib/photoEditor";
import "./PhotoEditor.css";

type Tab = "adjust" | "filter" | "frame" | "stickers" | "draw";

const EMOJIS = ["😀","😎","🥰","😂","🤩","😜","🔥","✨","💖","⭐","🌈","🎉",
  "👑","🕶️","🎀","🌸","🦋","🌙","☁️","💥","🎧","🍕","🐱","👻"];

interface Props {
  base: HTMLCanvasElement;
  state: EditState;
  onChange: (s: EditState) => void;
}

function Row({ label, value, min, max, step = 1, unit = "", onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="pe-row">
      <span className="pe-row-label">{label}</span>
      <Slider min={min} max={max} step={step} value={value} onChange={onChange} style={{ flex: 1 }} />
      <span className="pe-row-val">{Math.round(value * 100) / 100}{unit}</span>
    </div>
  );
}

export default function PhotoEditor({ base, state, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const [tab, setTab] = useState<Tab>("adjust");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [penColor, setPenColor] = useState("#22d3ee");
  const [penWidth, setPenWidth] = useState(0.008);
  const [textInput, setTextInput] = useState("");
  const [textColor, setTextColor] = useState("#ffffff");

  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const drawingRef = useRef(false);

  const selected = state.stickers.find((s) => s.id === selectedId) ?? null;

  // Render preview (max 900px wide — final export re-renders at full res).
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    renderEdit(base, state, Math.min(base.width, 900), c);
    if (tab === "stickers" && selected) drawSelection(c, selected);
  }, [base, state, selected, tab]);

  const patch = (p: Partial<EditState>) => onChange({ ...stateRef.current, ...p });
  const setAdj = (k: keyof Adjustments, v: number) => patch({ adj: { ...stateRef.current.adj, [k]: v } });
  const updateSticker = (id: string, p: Partial<Sticker>) =>
    patch({ stickers: stateRef.current.stickers.map((s) => (s.id === id ? { ...s, ...p } : s)) });

  function addSticker(kind: "emoji" | "text", content: string) {
    if (!content.trim()) return;
    const st: Sticker = {
      id: crypto.randomUUID(), kind, content, x: 0.5, y: 0.5,
      size: kind === "emoji" ? 0.16 : 0.09, rotation: 0, color: textColor,
    };
    patch({ stickers: [...stateRef.current.stickers, st] });
    setSelectedId(st.id);
    if (kind === "text") setTextInput("");
  }

  function removeSelected() {
    if (!selectedId) return;
    patch({ stickers: stateRef.current.stickers.filter((s) => s.id !== selectedId) });
    setSelectedId(null);
  }

  function pt(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { nx: (e.clientX - r.left) / r.width, ny: (e.clientY - r.top) / r.height };
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const { nx, ny } = pt(e);
    const s = stateRef.current;
    if (tab === "draw") {
      e.currentTarget.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      patch({ strokes: [...s.strokes, { id: crypto.randomUUID(), color: penColor, width: penWidth, points: [[nx, ny]] }] });
    } else if (tab === "stickers") {
      const c = canvasRef.current!;
      const hit = hitSticker(s, nx, ny, c.width, c.height);
      setSelectedId(hit?.id ?? null);
      if (hit) {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = { id: hit.id, dx: hit.x - nx, dy: hit.y - ny };
      }
    }
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const { nx, ny } = pt(e);
    const s = stateRef.current;
    if (drawingRef.current) {
      const last = s.strokes.length - 1;
      patch({ strokes: s.strokes.map((st, i) => (i === last ? { ...st, points: [...st.points, [nx, ny]] } : st)) });
    } else if (dragRef.current) {
      const { id, dx, dy } = dragRef.current;
      updateSticker(id, { x: Math.min(1, Math.max(0, nx + dx)), y: Math.min(1, Math.max(0, ny + dy)) });
    }
  }

  function onUp() { drawingRef.current = false; dragRef.current = null; }

  return (
    <div className="pe-root">
      <canvas
        ref={canvasRef}
        className={`pe-canvas${tab === "draw" ? " pe-canvas-draw" : ""}`}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      />

      <Segmented
        block value={tab} onChange={(v) => setTab(v as Tab)}
        options={[
          { value: "adjust", label: <span title="Adjust"><Sliders size={14} /></span> },
          { value: "filter", label: <span title="Filter"><Wand2 size={14} /></span> },
          { value: "frame", label: <span title="Frame"><Frame size={14} /></span> },
          { value: "stickers", label: <span title="Stickers & text"><StickerIcon size={14} /></span> },
          { value: "draw", label: <span title="Draw"><Pencil size={14} /></span> },
        ]}
      />

      <div className="pe-panel">
        {tab === "adjust" && (
          <>
            <Row label="Brightness" value={state.adj.brightness} min={0} max={200} onChange={(v) => setAdj("brightness", v)} unit="%" />
            <Row label="Contrast" value={state.adj.contrast} min={0} max={200} onChange={(v) => setAdj("contrast", v)} unit="%" />
            <Row label="Saturation" value={state.adj.saturation} min={0} max={200} onChange={(v) => setAdj("saturation", v)} unit="%" />
            <Row label="Hue" value={state.adj.hue} min={-180} max={180} onChange={(v) => setAdj("hue", v)} unit="°" />
            <Row label="Blur" value={state.adj.blur} min={0} max={12} step={0.5} onChange={(v) => setAdj("blur", v)} unit="px" />
            <Row label="Vignette" value={state.adj.vignette} min={0} max={100} onChange={(v) => setAdj("vignette", v)} />
            <Button size="small" onClick={() => patch({ adj: { ...DEFAULT_ADJ } })}>Reset adjustments</Button>
          </>
        )}

        {tab === "filter" && (
          <div className="pe-chip-grid">
            {FILTER_PRESETS.map((f) => (
              <Button key={f} size="small" type={state.filter === f ? "primary" : "default"} onClick={() => patch({ filter: f })}>
                {f}
              </Button>
            ))}
          </div>
        )}

        {tab === "frame" && (
          <>
            <div className="pe-chip-grid">
              {FRAME_OPTIONS.map((f) => (
                <Button key={f.id} size="small" type={state.frame.id === f.id ? "primary" : "default"}
                  onClick={() => patch({ frame: { ...state.frame, id: f.id as FrameId } })}>
                  {f.label}
                </Button>
              ))}
            </div>
            <label className="pe-color-row">
              Frame colour
              <input type="color" value={state.frame.color}
                onChange={(e) => patch({ frame: { ...state.frame, color: e.target.value } })} />
              <span className="pe-hint">(Film & Galaxy use fixed colours)</span>
            </label>
          </>
        )}

        {tab === "stickers" && (
          <>
            <div className="pe-emoji-grid">
              {EMOJIS.map((em) => (
                <button key={em} type="button" className="pe-emoji" onClick={() => addSticker("emoji", em)}>{em}</button>
              ))}
            </div>
            <div className="pe-text-row">
              <Input size="small" value={textInput} onChange={(e) => setTextInput(e.target.value)}
                onPressEnter={() => addSticker("text", textInput)} placeholder="Add text…" prefix={<Type size={13} />} />
              <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} title="Text colour" />
              <Button size="small" type="primary" disabled={!textInput.trim()} onClick={() => addSticker("text", textInput)}>Add</Button>
            </div>

            {selected ? (
              <>
                <Row label="Size" value={selected.size} min={0.03} max={0.6} step={0.01}
                  onChange={(v) => updateSticker(selected.id, { size: v })} />
                <Row label="Rotate" value={selected.rotation} min={-180} max={180} unit="°"
                  onChange={(v) => updateSticker(selected.id, { rotation: v })} />
                {selected.kind === "text" && (
                  <label className="pe-color-row">Colour
                    <input type="color" value={selected.color}
                      onChange={(e) => updateSticker(selected.id, { color: e.target.value })} />
                  </label>
                )}
                <Button size="small" danger icon={<Trash2 size={13} />} onClick={removeSelected}>Delete sticker</Button>
              </>
            ) : (
              <p className="pe-hint">Tap a sticker on the photo to move, resize or rotate it.</p>
            )}
          </>
        )}

        {tab === "draw" && (
          <>
            <label className="pe-color-row">Pen colour
              <input type="color" value={penColor} onChange={(e) => setPenColor(e.target.value)} />
            </label>
            <Row label="Thickness" value={penWidth} min={0.003} max={0.04} step={0.001} onChange={setPenWidth} />
            <div className="pe-chip-grid">
              <Button size="small" icon={<Undo2 size={13} />} disabled={!state.strokes.length}
                onClick={() => patch({ strokes: state.strokes.slice(0, -1) })}>Undo stroke</Button>
              <Button size="small" danger disabled={!state.strokes.length}
                onClick={() => patch({ strokes: [] })}>Clear drawing</Button>
            </div>
            <p className="pe-hint">Drag on the photo to draw.</p>
          </>
        )}
      </div>

      <Button size="small" type="text" onClick={() => { onChange(defaultEdit()); setSelectedId(null); }}>
        Reset everything
      </Button>
    </div>
  );
}