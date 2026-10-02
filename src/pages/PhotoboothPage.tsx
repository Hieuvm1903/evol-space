import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Sparkles, Camera, Download, Save, Timer, MousePointerClick, Trash2, LogIn,
  Image as ImageIcon, Images, Pencil, X, Maximize2, Minimize2,
} from "lucide-react";
import { Button, Select, Input, InputNumber, Segmented, Empty } from "antd";
import { useAuth } from "../contexts/AuthContext";
import { canvasToBlob } from "../lib/imageFilters";
import { defaultEdit, normalizeEdit, renderEdit, type EditState } from "../lib/photoEditor";
import * as photosService from "../lib/photosService";
import { Photo } from "../lib/photosService";
import PhotoEditor from "../components/PhotoEditor";
import { useConfirm } from "../components/ConfirmDialog";
import { notify } from "../lib/notify";
import "./music/MusicPage.css";
import "./PhotoboothPage.css";

// NOT PORTED from photobooth.py: gesture capture (needs @mediapipe/tasks-vision).

const TIMER_PRESETS = [3, 5, 10, 15, 30];

export function PhotoboothPage() {
  const { user } = useAuth();
  const confirmDialog = useConfirm();
const videoElRef = useRef<HTMLVideoElement | null>(null);
const streamRef = useRef<MediaStream | null>(null);
const cancelRef = useRef(false);
const [expanded, setExpanded] = useState(false);

const setVideoEl = useCallback((el: HTMLVideoElement | null) => {
  videoElRef.current = el;
  if (el && streamRef.current) {
    el.srcObject = streamRef.current;
    el.play().catch(() => {});
  }
}, []); 

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [mode, setMode] = useState<"click" | "timer">("click");
  const [timerSeconds, setTimerSeconds] = useState(3);
  const [countdown, setCountdown] = useState<number | null>(null);

  const [tab, setTab] = useState<"edit" | "gallery">("edit");
  const [base, setBase] = useState<HTMLCanvasElement | null>(null);   // untouched image
  const [edit, setEdit] = useState<EditState>(defaultEdit());         // all layers
  const [editing, setEditing] = useState<Photo | null>(null);         // gallery photo being re-edited
  const [caption, setCaption] = useState("");
  const [saving, setSaving] = useState(false);

  const [photos, setPhotos] = useState<(Photo & { url: string | null })[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
useEffect(() => {
  if (!expanded) return;
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [expanded]);
  useEffect(() => {
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera isn't available in this browser (needs HTTPS or localhost).");
      return;
    }
    navigator.mediaDevices
  .getUserMedia({
    video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "user" },
    audio: false,
  })
  .then((stream) => {
    if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
    streamRef.current = stream;
    if (videoElRef.current) { videoElRef.current.srcObject = stream; videoElRef.current.play().catch(() => {}); }
    setCameraReady(true);
  })
      .catch((err) => setCameraError(err.message || "Couldn't access the camera."));

    return () => {
      cancelled = true;
      cancelRef.current = true; // stop any running countdown
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function loadGallery() {
    if (!user) return;
    setGalleryLoading(true);
    const rows = await photosService.getPhotos(user.id);
    const withUrls = await Promise.all(
      rows.map(async (p) => ({ ...p, url: await photosService.getPhotoUrl(p.filename) })),
    );
    setPhotos(withUrls);
    setGalleryLoading(false);
  }
  useEffect(() => { loadGallery(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  function resetEditor() {
    setBase(null); setEdit(defaultEdit()); setEditing(null); setCaption("");
  }

 function captureFrame() {
  const video = videoElRef.current;
  if (!video || video.videoWidth === 0) return;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")!.drawImage(video, 0, 0);
  setBase(canvas);
  setEdit(defaultEdit());
  setEditing(null);
  setCaption("");
  setExpanded(false);   // <-- new
  setTab("edit");
}

  async function startTimerCapture() {
    cancelRef.current = false;
    for (let remaining = timerSeconds; remaining > 0; remaining--) {
      if (cancelRef.current) { setCountdown(null); return; }
      setCountdown(remaining);
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (cancelRef.current) { setCountdown(null); return; }
    setCountdown(null);
    captureFrame();
  }
  function cancelCountdown() { cancelRef.current = true; setCountdown(null); }

  async function handleEditPhoto(p: Photo) {
    try {
      // Original if we have it; otherwise the flattened image (older photos).
      const blob = await photosService.downloadImage(p.original_filename ?? p.filename);
      const bmp = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bmp.width; canvas.height = bmp.height;
      canvas.getContext("2d")!.drawImage(bmp, 0, 0);
      setBase(canvas);
      setEdit(p.original_filename ? normalizeEdit(p.edit) : defaultEdit());
      setEditing(p);
      setCaption(p.caption);
      setTab("edit");
    } catch {
      notify.error("Couldn't open that photo", "Please try again.");
    }
  }

  async function handleDownload() {
    if (!base) return;
    const blob = await canvasToBlob(renderEdit(base, edit));
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `evol-photobooth-${Date.now().toString(36)}.jpg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSaveToGallery() {
    if (!base || !user) return;
    setSaving(true);
    try {
      const rendered = await canvasToBlob(renderEdit(base, edit));
      if (editing) {
        const legacy = editing.original_filename ? undefined : await canvasToBlob(base, 0.95);
        await photosService.updatePhoto(editing, user.id, rendered, caption.trim(), edit, legacy);
        notify.updated("Photo updated.");
      } else {
        await photosService.savePhoto(user.id, await canvasToBlob(base, 0.95), rendered, caption.trim(), edit);
        notify.added("Photo saved to your gallery.");
      }
      resetEditor();
      await loadGallery();
      setTab("gallery");
    } catch {
      notify.error("Couldn't save the photo", "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePhoto(p: Photo) {
    if (!user) return;
    const ok = await confirmDialog({
      title: "Delete this photo?", description: "This can't be undone.", confirmText: "Delete", danger: true,
    });
    if (!ok) return;
    await photosService.deletePhoto(p, user.id);
    if (editing?.id === p.id) resetEditor();
    notify.deleted("Photo removed.");
    loadGallery();
  }
const cameraView = (
  <div className={`pb-video-wrap${expanded ? " pb-video-expanded" : ""}`}>
    <video ref={setVideoEl} autoPlay playsInline muted />
    {countdown !== null && <div className="pb-countdown">{countdown}</div>}

    <button
      type="button" className="pb-expand-btn"
      onClick={() => setExpanded((v) => !v)}
      title={expanded ? "Exit expanded view (Esc)" : "Expand camera"}
    >
      {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
    </button>

    {expanded && (
      <div className="pb-expanded-controls">
        <Segmented
          value={mode} onChange={(v) => setMode(v as "click" | "timer")}
          disabled={countdown !== null}
          options={[
            { label: <MousePointerClick size={14} style={{ verticalAlign: -2 }} />, value: "click" },
            { label: <Timer size={14} style={{ verticalAlign: -2 }} />, value: "timer" },
          ]}
        />
        {mode === "timer" && (
          <InputNumber
            min={1} max={60} precision={0} value={timerSeconds} suffix="s"
            onChange={(v) => setTimerSeconds(v ?? 3)}
            disabled={countdown !== null} style={{ width: 100 }}
          />
        )}
        {countdown !== null ? (
          <Button danger size="large" icon={<X size={16} />} onClick={cancelCountdown}>Cancel</Button>
        ) : (
          <Button
            type="primary" size="large" className="btn-glow"
            icon={mode === "click" ? <Camera size={16} /> : <Timer size={16} />}
            disabled={!cameraReady}
            onClick={mode === "click" ? captureFrame : startTimerCapture}
          >
            {mode === "click" ? "Capture" : "Start countdown"}
          </Button>
        )}
      </div>
    )}
  </div>
);
  return (
    <div className="page photobooth-page-shell">
      <div className="music-shell-header fade-in-up">
        <h2 className="music-title"><Sparkles size={20} className="music-title-icon" /> Photobooth</h2>
        <p className="music-subtitle">
          {user
            ? "Snap a pic, edit it like a photo app, then download it or save it — you can re-edit saved photos anytime."
            : "Snap a pic, edit it and download it. Log in to save editable photos to a personal gallery."}
        </p>
      </div>

      <div className="pb-workspace">
        {/* ---------------- Left: camera + capture ---------------- */}
        <div className="music-pane pb-pane fade-in-up">
          <div className="pb-pane-body">
           {expanded ? createPortal(cameraView, document.body) : cameraView}
            {cameraError && <p className="error" style={{ margin: 0 }}>{cameraError}</p>}

            <Segmented
              block value={mode} onChange={(v) => setMode(v as "click" | "timer")}
              options={[
                { label: <span><MousePointerClick size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Click</span>, value: "click" },
                { label: <span><Timer size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Timer</span>, value: "timer" },
              ]}
            />

            {mode === "click" ? (
              <Button type="primary" icon={<Camera size={15} />} className="btn-glow"
                onClick={captureFrame} disabled={!cameraReady} block>
                Capture
              </Button>
            ) : (
              <>
                <div className="pb-timer-row">
                  <InputNumber
                    min={1} max={60} precision={0} value={timerSeconds} suffix="s"
                    onChange={(v) => setTimerSeconds(v ?? 3)}
                    disabled={countdown !== null} style={{ width: 110 }}
                  />
                  {countdown === null ? (
                    <Button type="primary" icon={<Timer size={15} />} className="btn-glow"
                      onClick={startTimerCapture} disabled={!cameraReady} style={{ flex: 1 }}>
                      Start countdown
                    </Button>
                  ) : (
                    <Button danger icon={<X size={15} />} onClick={cancelCountdown} style={{ flex: 1 }}>
                      Cancel
                    </Button>
                  )}
                </div>
                <div className="pb-chip-row">
                  {TIMER_PRESETS.map((s) => (
                    <Button key={s} size="small" type={timerSeconds === s ? "primary" : "default"}
                      disabled={countdown !== null} onClick={() => setTimerSeconds(s)}>
                      {s}s
                    </Button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ---------------- Right: editor / gallery ---------------- */}
        <div className="music-pane pb-pane fade-in-up">
          <div className="pb-pane-body">
            <Segmented
              block value={tab} onChange={(v) => setTab(v as "edit" | "gallery")}
              options={[
                { label: <span><ImageIcon size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{editing ? "Editing" : "Edit"}</span>, value: "edit" },
                {
                  label: (
                    <span>
                      <Images size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                      Gallery{user && photos.length > 0 ? ` (${photos.length})` : ""}
                    </span>
                  ),
                  value: "gallery",
                },
              ]}
            />

            {tab === "edit" && (
              <div className="pb-tab-content fade-in" key="edit">
                {base ? (
                  <>
                    <PhotoEditor base={base} state={edit} onChange={setEdit} />
                    <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption (optional)" />
                    <div className="pb-actions-row">
                      <Button icon={<Download size={14} />} onClick={handleDownload}>Download</Button>
                      {user ? (
                        <Button type="primary" icon={<Save size={14} />} className="btn-glow"
                          onClick={handleSaveToGallery} loading={saving} style={{ flex: 1 }}>
                          {editing ? "Save changes" : "Save to gallery"}
                        </Button>
                      ) : (
                        <Button disabled icon={<LogIn size={14} />} style={{ flex: 1 }}
                          title="Log in to save photos to a personal gallery">
                          Log in to save
                        </Button>
                      )}
                      <Button icon={<X size={14} />} onClick={resetEditor} title="Discard" />
                    </div>
                  </>
                ) : (
                  <div className="pb-preview-frame">
                    <p className="placeholder-note">Capture a photo to start editing it here.</p>
                  </div>
                )}
              </div>
            )}

            {tab === "gallery" && (
              <div className="pb-tab-content fade-in" key="gallery">
                {!user ? (
                  <div className="pb-empty-center"><p className="placeholder-note">Log in to see and manage a personal photo gallery.</p></div>
                ) : galleryLoading ? (
                  <div className="pb-empty-center"><p className="placeholder-note">Loading…</p></div>
                ) : photos.length === 0 ? (
                  <div className="pb-empty-center">
                    <Empty className="fade-in" image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={<span style={{ color: "#9c97b8" }}>No photos yet. Take one and save it!</span>} />
                  </div>
                ) : (
                  <div className="pb-gallery-scroll">
                    <div className="pb-gallery-grid">
                      {photos.map((p, i) => (
                        <div className="evol-card pb-gallery-card stagger-item"
                          style={{ animationDelay: `${Math.min(i, 14) * 30}ms` }} key={p.id}>
                          {p.url ? <img src={p.url} alt="" className="pb-gallery-img" /> : <p className="error">Photo missing.</p>}
                          <div className="evol-card-meta">{new Date(p.time).toLocaleString()} · {p.filter}</div>
                          {p.caption && <div className="evol-card-body">{p.caption}</div>}
                          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                            <Button size="small" icon={<Pencil size={13} />} onClick={() => handleEditPhoto(p)}>Edit</Button>
                            <Button danger size="small" icon={<Trash2 size={13} />} onClick={() => handleDeletePhoto(p)}>Delete</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}