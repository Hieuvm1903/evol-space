import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, Slider, Segmented, Tooltip } from "antd";
import {
  Sliders, Wand2, Frame, Sticker as StickerIcon, Pencil, Trash2, Undo2, Type,
  Crop, RotateCw, FlipHorizontal2, Eye, RotateCcw, ZoomIn, ZoomOut, Search, X, Sparkles,
} from "lucide-react";
import {
  ASPECT_OPTIONS, DEFAULT_ADJ, DEFAULT_TRANSFORM, FILTER_PRESETS, FRAME_OPTIONS,
  defaultEdit, drawSelection, hitSticker, preloadFrameOverlay, renderEdit,
  type Adjustments, type EditState, type FrameId, type OverlayLayout, type Sticker,
} from "../lib/photoEditor";
import {
  FRAME_API_CATEGORIES, fetchMotifSvg, getIconifyPreviewUrl, searchFrameMotifs,
  type ApiFrameMotif,
} from "../lib/frameApi";
import { notify } from "../lib/notify";
import HelpTip from "./HelpTip";
import "./PhotoEditor.css";

type Tab = "adjust" | "filter" | "crop" | "frame" | "stickers" | "draw";

const EMOJIS = ["😀","😎","🥰","😂","🤩","😜","🔥","💖","⭐","🌈","🎉","✨",
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
  const [comparingOriginal, setComparingOriginal] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [overlayRenderTick, setOverlayRenderTick] = useState(0);

  // API Frame & Motif search state
  const [motifQuery, setMotifQuery] = useState("sparkle");
  const [motifs, setMotifs] = useState<ApiFrameMotif[]>([]);
  const [motifsLoading, setMotifsLoading] = useState(false);
  const [motifsOffline, setMotifsOffline] = useState(false);
  const [applyingMotifId, setApplyingMotifId] = useState<string | null>(null);

  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const panDragRef = useRef<{ startX: number; startY: number; origPanX: number; origPanY: number } | null>(null);
  const drawingRef = useRef(false);

  const selected = state.stickers.find((s) => s.id === selectedId) ?? null;
  const transform = state.transform ?? DEFAULT_TRANSFORM;
  const cropZoom = transform.zoom ?? 1;
  const canPanCrop = tab === "crop" && (cropZoom > 1 || transform.aspect !== "original");

  const runMotifSearch = useCallback(async (query: string) => {
    setMotifsLoading(true);
    try {
      const res = await searchFrameMotifs(query, 24);
      setMotifs(res.motifs);
      setMotifsOffline(res.fromFallback);
    } finally {
      setMotifsLoading(false);
    }
  }, []);

  // Load initial frame motifs when entering the Frame tab
  useEffect(() => {
    if (tab === "frame" && motifs.length === 0) {
      void runMotifSearch(motifQuery);
    }
  }, [tab, motifs.length, motifQuery, runMotifSearch]);

  // Preload SVG overlay whenever it changes so canvas redraws immediately on decode
  useEffect(() => {
    if (state.overlay?.svg) {
      preloadFrameOverlay(state.overlay, () => setOverlayRenderTick((t) => t + 1));
    }
  }, [state.overlay]);

  // Render preview (max 900px wide — final export re-renders at full res).
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const renderState = comparingOriginal
      ? { ...defaultEdit(), transform: state.transform }
      : state;
    renderEdit(base, renderState, Math.min(base.width, 900), c);
    if (!comparingOriginal && tab === "stickers" && selected) drawSelection(c, selected);
  }, [base, state, selected, tab, comparingOriginal, overlayRenderTick]);

  // Delete selected sticker with Delete / Backspace when not focused inside text input.
  useEffect(() => {
    if (!selectedId || tab !== "stickers") return;
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        patch({ stickers: stateRef.current.stickers.filter((s) => s.id !== selectedId) });
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, tab]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function selectApiMotif(motif: ApiFrameMotif) {
    if (state.overlay?.id === motif.id) {
      patch({ overlay: null });
      return;
    }
    setApplyingMotifId(motif.id);
    try {
      const svg = motif.svg ?? (await fetchMotifSvg(motif.id));
      const prev = stateRef.current.overlay;
      patch({
        overlay: {
          id: motif.id,
          name: motif.name,
          svg,
          layout: prev?.layout ?? "corners",
          tint: prev?.tint ?? "#ffffff",
          scale: prev?.scale ?? 1,
          opacity: prev?.opacity ?? 0.9,
        },
      });
    } catch {
      notify.error("Couldn't load frame motif", "Please try another motif.");
    } finally {
      setApplyingMotifId(null);
    }
  }

  function pt(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { nx: (e.clientX - r.left) / r.width, ny: (e.clientY - r.top) / r.height };
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (comparingOriginal) return;
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
    } else if (canPanCrop) {
      e.currentTarget.setPointerCapture(e.pointerId);
      const t = s.transform ?? DEFAULT_TRANSFORM;
      panDragRef.current = {
        startX: nx,
        startY: ny,
        origPanX: t.panX ?? 0,
        origPanY: t.panY ?? 0,
      };
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
    } else if (panDragRef.current) {
      const { startX, startY, origPanX, origPanY } = panDragRef.current;
      const dx = (nx - startX) * 2;
      const dy = (ny - startY) * 2;
      const t = s.transform ?? DEFAULT_TRANSFORM;
      patch({
        transform: {
          ...t,
          panX: Math.min(1, Math.max(-1, origPanX - dx)),
          panY: Math.min(1, Math.max(-1, origPanY - dy)),
        },
      });
    }
  }

  function onUp() {
    drawingRef.current = false;
    dragRef.current = null;
    panDragRef.current = null;
  }

  return (
    <div className="pe-root">
      <div className="pe-canvas-stage">
        <div className={`pe-canvas-viewport${previewZoom > 1 ? " zoomed" : ""}`}>
          <canvas
            ref={canvasRef}
            className={`pe-canvas${tab === "draw" ? " pe-canvas-draw" : canPanCrop ? " pe-canvas-pan" : ""}`}
            style={
              previewZoom > 1
                ? { width: `${Math.round(previewZoom * 100)}%`, maxHeight: "none" }
                : undefined
            }
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
        </div>

        <div className="pe-stage-toolbar">
          <div className="pe-stage-left">
            <button
              type="button"
              className={`pe-compare-btn${comparingOriginal ? " active" : ""}`}
              onPointerDown={() => setComparingOriginal(true)}
              onPointerUp={() => setComparingOriginal(false)}
              onPointerLeave={() => setComparingOriginal(false)}
              onPointerCancel={() => setComparingOriginal(false)}
              title="Hold to compare with original"
            >
              <Eye size={13} />
              <span>{comparingOriginal ? "Original" : "Compare"}</span>
            </button>

            <div className="pe-zoom-controls" aria-label="Preview zoom">
              <button
                type="button"
                className="pe-zoom-btn"
                disabled={previewZoom <= 1}
                onClick={() => setPreviewZoom((z) => Math.max(1, Math.round((z - 0.25) * 100) / 100))}
                title="Zoom out preview"
              >
                <ZoomOut size={13} />
              </button>
              <button
                type="button"
                className="pe-zoom-readout"
                onClick={() => setPreviewZoom(1)}
                title="Reset preview zoom"
              >
                {Math.round(previewZoom * 100)}%
              </button>
              <button
                type="button"
                className="pe-zoom-btn"
                disabled={previewZoom >= 2.5}
                onClick={() => setPreviewZoom((z) => Math.min(2.5, Math.round((z + 0.25) * 100) / 100))}
                title="Zoom in preview"
              >
                <ZoomIn size={13} />
              </button>
            </div>
          </div>

          <span className="pe-dims-label">
            {base.width}×{base.height}{cropZoom > 1 ? ` · ${cropZoom.toFixed(1)}×` : ""}
          </span>
        </div>
      </div>

      <Segmented
        block value={tab} onChange={(v) => setTab(v as Tab)}
        options={[
          { value: "adjust", label: <Tooltip title="Adjust"><span className="pe-seg-ic"><Sliders size={14} /></span></Tooltip> },
          { value: "filter", label: <Tooltip title="Filters"><span className="pe-seg-ic"><Wand2 size={14} /></span></Tooltip> },
          { value: "crop", label: <Tooltip title="Zoom, Rotate & Crop"><span className="pe-seg-ic"><Crop size={14} /></span></Tooltip> },
          { value: "frame", label: <Tooltip title="Frames & API Motifs"><span className="pe-seg-ic"><Frame size={14} /></span></Tooltip> },
          { value: "stickers", label: <Tooltip title="Stickers & Text"><span className="pe-seg-ic"><StickerIcon size={14} /></span></Tooltip> },
          { value: "draw", label: <Tooltip title="Draw"><span className="pe-seg-ic"><Pencil size={14} /></span></Tooltip> },
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
            <div className="pe-chip-grid">
              <Button size="small" icon={<RotateCcw size={12} />} onClick={() => patch({ adj: { ...DEFAULT_ADJ } })}>
                Reset adjustments
              </Button>
            </div>
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

        {tab === "crop" && (
          <>
            <Row
              label="Crop zoom"
              value={cropZoom}
              min={1}
              max={3}
              step={0.05}
              unit="×"
              onChange={(v) => patch({ transform: { ...transform, zoom: v } })}
            />
            {(cropZoom > 1 || transform.aspect !== "original") && (
              <div className="pe-chip-grid" style={{ alignItems: "center" }}>
                <HelpTip content="Drag photo to pan." />
                {(transform.panX !== 0 || transform.panY !== 0) && (
                  <Button
                    size="small"
                    onClick={() => patch({ transform: { ...transform, panX: 0, panY: 0 } })}
                  >
                    Center
                  </Button>
                )}
              </div>
            )}
            <div className="pe-chip-grid" style={{ marginTop: 2 }}>
              <Button
                size="small"
                icon={<RotateCw size={13} />}
                onClick={() => patch({ transform: { ...transform, rotate: ((transform.rotate + 90) % 360) as 0 | 90 | 180 | 270 } })}
              >
                Rotate 90° ({transform.rotate}°)
              </Button>
              <Button
                size="small"
                type={transform.flipH ? "primary" : "default"}
                icon={<FlipHorizontal2 size={13} />}
                onClick={() => patch({ transform: { ...transform, flipH: !transform.flipH } })}
              >
                Flip horizontal
              </Button>
            </div>
            <div className="pe-hint" style={{ marginTop: 4 }}>Aspect ratio</div>
            <div className="pe-chip-grid">
              {ASPECT_OPTIONS.map((a) => (
                <Button
                  key={a.id}
                  size="small"
                  type={transform.aspect === a.id ? "primary" : "default"}
                  onClick={() => patch({ transform: { ...transform, aspect: a.id } })}
                >
                  {a.label}
                </Button>
              ))}
            </div>
            <div className="pe-chip-grid" style={{ marginTop: 4 }}>
              <Button size="small" icon={<RotateCcw size={12} />} onClick={() => patch({ transform: { ...DEFAULT_TRANSFORM } })}>
                Reset transform
              </Button>
            </div>
          </>
        )}

        {tab === "frame" && (
          <>
            <div className="pe-chip-grid">
              {FRAME_OPTIONS.map((f) => (
                <Button
                  key={f.id}
                  size="small"
                  type={state.frame.id === f.id ? "primary" : "default"}
                  onClick={() => patch({ frame: { ...state.frame, id: f.id as FrameId } })}
                >
                  {f.label}
                </Button>
              ))}
            </div>
            <label className="pe-color-row">
              Frame colour
              <input
                type="color"
                value={state.frame.color}
                onChange={(e) => patch({ frame: { ...state.frame, color: e.target.value } })}
              />
              <HelpTip content="Film, Neon & Galaxy use themed colours." />
            </label>

            <div className="pe-api-frame-section">
              <div className="pe-api-frame-header">
                <span className="pe-api-frame-title">
                  <Sparkles size={13} /> Frame Ornaments (Iconify API)
                </span>
                {state.overlay && (
                  <Button size="small" type="text" icon={<X size={12} />} onClick={() => patch({ overlay: null })}>
                    Clear motif
                  </Button>
                )}
              </div>

              <div className="pe-api-search-row">
                <Input
                  size="small"
                  value={motifQuery}
                  onChange={(e) => setMotifQuery(e.target.value)}
                  onPressEnter={() => void runMotifSearch(motifQuery)}
                  placeholder="Search motifs (sparkle, floral, ribbon…)"
                  prefix={<Search size={12} color="#9c97b8" />}
                  allowClear
                />
                <Button size="small" type="primary" loading={motifsLoading} onClick={() => void runMotifSearch(motifQuery)}>
                  Search
                </Button>
              </div>

              <div className="pe-chip-grid">
                {FRAME_API_CATEGORIES.map((cat) => (
                  <Button
                    key={cat.query}
                    size="small"
                    type={motifQuery.toLowerCase() === cat.query ? "primary" : "default"}
                    onClick={() => {
                      setMotifQuery(cat.query);
                      void runMotifSearch(cat.query);
                    }}
                  >
                    {cat.label}
                  </Button>
                ))}
              </div>

              {motifsOffline && (
                <span className="pe-hint">Showing built-in motifs (API unavailable offline).</span>
              )}

              <div className="pe-motif-grid">
                {motifs.map((m) => {
                  const active = state.overlay?.id === m.id;
                  const busy = applyingMotifId === m.id;
                  return (
                    <Tooltip key={m.id} title={m.id}>
                      <button
                        type="button"
                        className={`pe-motif-btn${active ? " active" : ""}`}
                        onClick={() => void selectApiMotif(m)}
                        disabled={busy}
                      >
                        <img
                          src={getIconifyPreviewUrl(m.id)}
                          alt={m.name}
                          referrerPolicy="no-referrer"
                          loading="lazy"
                        />
                      </button>
                    </Tooltip>
                  );
                })}
              </div>

              {state.overlay && (
                <div className="pe-overlay-controls">
                  <Segmented
                    block
                    size="small"
                    value={state.overlay.layout}
                    onChange={(v) =>
                      patch({ overlay: { ...state.overlay!, layout: v as OverlayLayout } })
                    }
                    options={[
                      { label: "Corners", value: "corners" },
                      { label: "Border", value: "border-tile" },
                      { label: "Top/Bottom", value: "top-bottom" },
                      { label: "Badge", value: "badge" },
                    ]}
                  />
                  <Row
                    label="Size"
                    value={state.overlay.scale}
                    min={0.6}
                    max={1.8}
                    step={0.05}
                    unit="×"
                    onChange={(v) => patch({ overlay: { ...state.overlay!, scale: v } })}
                  />
                  <Row
                    label="Opacity"
                    value={Math.round(state.overlay.opacity * 100)}
                    min={20}
                    max={100}
                    unit="%"
                    onChange={(v) => patch({ overlay: { ...state.overlay!, opacity: v / 100 } })}
                  />
                  <label className="pe-color-row">
                    Motif tint
                    <input
                      type="color"
                      value={state.overlay.tint || "#ffffff"}
                      onChange={(e) => patch({ overlay: { ...state.overlay!, tint: e.target.value } })}
                    />
                    <Button
                      size="small"
                      type={state.overlay.tint === "" ? "primary" : "default"}
                      onClick={() => patch({ overlay: { ...state.overlay!, tint: "" } })}
                    >
                      Original colours
                    </Button>
                  </label>
                </div>
              )}
            </div>
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
              {!selected && (
                <HelpTip content="Tap a sticker on the photo to move, resize or rotate it. Press Delete to remove." />
              )}
            </div>

            {selected && (
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
            )}
          </>
        )}

        {tab === "draw" && (
          <>
            <label className="pe-color-row">Pen colour
              <input type="color" value={penColor} onChange={(e) => setPenColor(e.target.value)} />
            </label>
            <Row label="Thickness" value={penWidth} min={0.003} max={0.04} step={0.001} onChange={setPenWidth} />
            <div className="pe-chip-grid" style={{ alignItems: "center" }}>
              <Button size="small" icon={<Undo2 size={13} />} disabled={!state.strokes.length}
                onClick={() => patch({ strokes: state.strokes.slice(0, -1) })}>Undo stroke</Button>
              <Button size="small" danger disabled={!state.strokes.length}
                onClick={() => patch({ strokes: [] })}>Clear drawing</Button>
              <HelpTip content="Drag on the photo to draw." />
            </div>
          </>
        )}
      </div>

      <Button size="small" type="text" onClick={() => { onChange(defaultEdit()); setSelectedId(null); }}>
        Reset everything
      </Button>
    </div>
  );
}