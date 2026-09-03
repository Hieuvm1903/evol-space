import React, { useEffect, useRef, useState } from "react";
import { Button, Select, Input, Segmented, Empty } from "antd";
import { Camera, Download, Save, Timer, MousePointerClick, Trash2, LogIn } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { PHOTO_FILTERS, applyFilter, canvasToBlob } from "../lib/imageFilters";
import * as photosService from "../lib/photosService";
import { Photo } from "../lib/photosService";
import "./PhotoboothPage.css";

// NOT PORTED from photobooth.py: gesture capture (hold a hand pose to
// trigger a photo) — the original used MediaPipe's Python Tasks API via
// streamlit-webrtc; a browser port would use @mediapipe/tasks-vision
// (MediaPipe's JS/WASM build) plus a port of gesture_capture.py's
// classify_pose() logic. Genuinely a separate, sizeable piece of work —
// flagging rather than faking it. Click-to-capture and timer capture (both
// using the same getUserMedia stream) are fully working below.

const TIMER_OPTIONS = [3, 5, 10];

export function PhotoboothPage() {
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [mode, setMode] = useState<"click" | "timer">("click");
  const [timerSeconds, setTimerSeconds] = useState(3);
  const [countdown, setCountdown] = useState<number | null>(null);

  const [rawCanvas, setRawCanvas] = useState<HTMLCanvasElement | null>(null);
  const [filterName, setFilterName] = useState<string>("None");
  const [caption, setCaption] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [photos, setPhotos] = useState<(Photo & { url: string | null })[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setCameraReady(true);
      })
      .catch((err) => setCameraError(err.message || "Couldn't access the camera."));

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!rawCanvas) { setPreviewUrl(null); return; }
    const filtered = applyFilter(rawCanvas, rawCanvas.width, rawCanvas.height, filterName);
    setPreviewUrl(filtered.toDataURL("image/jpeg", 0.9));
  }, [rawCanvas, filterName]);

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
  useEffect(() => { loadGallery(); }, [user]);

  function captureFrame() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    setRawCanvas(canvas);
  }

  async function startTimerCapture() {
    for (let remaining = timerSeconds; remaining > 0; remaining--) {
      setCountdown(remaining);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setCountdown(null);
    captureFrame();
  }

  async function handleDownload() {
    if (!rawCanvas) return;
    const filtered = applyFilter(rawCanvas, rawCanvas.width, rawCanvas.height, filterName);
    const blob = await canvasToBlob(filtered);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `evol-photobooth-${Date.now().toString(36)}.jpg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSaveToGallery() {
    if (!rawCanvas || !user) return;
    setSaving(true);
    const filtered = applyFilter(rawCanvas, rawCanvas.width, rawCanvas.height, filterName);
    const blob = await canvasToBlob(filtered);
    await photosService.savePhoto(user.id, blob, caption.trim(), filterName);
    setSaving(false);
    setRawCanvas(null);
    setCaption("");
    loadGallery();
  }

  async function handleDeletePhoto(p: Photo) {
    if (!user) return;
    await photosService.deletePhoto(p.id, user.id, p.filename);
    loadGallery();
  }

  return (
    <div className="page photobooth-page-shell">
      <div className="photobooth-heading">
        <h2>
          <Camera size={20} style={{ verticalAlign: -4, marginRight: 8, color: "#8b6ff5" }} />
          Photobooth
        </h2>
        <p className="evol-card-meta">
          {user
            ? "Snap a pic, add a filter, download it or save it to your gallery."
            : "Snap a pic, add a filter, and download it — no account needed. Log in to save to a personal gallery too."}
        </p>
      </div>

      <div className="photobooth-main">
        {/* ---------------- Camera + capture controls ---------------- */}
        <div className="photobooth-camera-col">
          <div className="photobooth-video-wrap">
            <video ref={videoRef} autoPlay playsInline muted />
            {countdown !== null && <div className="photobooth-countdown">{countdown}</div>}
          </div>
          {cameraError && <p className="error">{cameraError}</p>}

          <Segmented
            block
            value={mode}
            onChange={(v) => setMode(v as "click" | "timer")}
            options={[
              { label: <span><MousePointerClick size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Click to capture</span>, value: "click" },
              { label: <span><Timer size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Timer capture</span>, value: "timer" },
            ]}
          />

          {mode === "click" ? (
            <Button
              type="primary" icon={<Camera size={15} />} className="btn-glow"
              onClick={captureFrame} disabled={!cameraReady} block
            >
              Capture
            </Button>
          ) : (
            <div className="photobooth-timer-row">
              <Select
                value={timerSeconds}
                onChange={setTimerSeconds}
                options={TIMER_OPTIONS.map((s) => ({ value: s, label: `${s}s` }))}
                style={{ width: 90 }}
              />
              <Button
                type="primary" icon={<Timer size={15} />} className="btn-glow"
                onClick={startTimerCapture} disabled={!cameraReady || countdown !== null}
                style={{ flex: 1 }}
              >
                Start countdown
              </Button>
            </div>
          )}
        </div>

        {/* ---------------- Preview + filter + save ---------------- */}
        <div className="photobooth-preview-col">
          <div className="photobooth-preview-controls">
            <div className="photobooth-preview-controls-row">
              <Select
                value={filterName}
                onChange={setFilterName}
                options={PHOTO_FILTERS.map((f) => ({ value: f, label: f }))}
                style={{ flex: 1 }}
              />
              <Input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Caption (optional)"
                style={{ flex: 1 }}
              />
            </div>
          </div>

          <div className="photobooth-preview-frame">
            {previewUrl ? (
              <img src={previewUrl} alt="Preview" className="photobooth-preview" />
            ) : (
              <p className="placeholder-note">Capture a photo to preview it here.</p>
            )}
          </div>

          {previewUrl && (
            <div className="photobooth-actions-row">
              <Button icon={<Download size={14} />} onClick={handleDownload}>Download</Button>
              {user ? (
                <Button
                  type="primary" icon={<Save size={14} />} className="btn-glow"
                  onClick={handleSaveToGallery} loading={saving} style={{ flex: 1 }}
                >
                  Save to gallery
                </Button>
              ) : (
                <Button disabled icon={<LogIn size={14} />} title="Log in to save photos to a personal gallery" style={{ flex: 1 }}>
                  Log in to save
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ---------------- Gallery (only part of the page that scrolls) ---------------- */}
      <div className="photobooth-gallery">
        <div className="photobooth-gallery-header">
          <h3>Gallery</h3>
          {user && photos.length > 0 && (
            <span className="evol-card-meta">{photos.length} photo{photos.length === 1 ? "" : "s"}</span>
          )}
        </div>

        <div className="photobooth-gallery-scroll">
          {!user ? (
            <p className="placeholder-note">Log in to see and manage a personal photo gallery.</p>
          ) : galleryLoading ? (
            <p className="placeholder-note">Loading…</p>
          ) : photos.length === 0 ? (
            <Empty className="fade-in" description={<span style={{ color: "#9c97b8" }}>No photos yet — take one above and save it!</span>} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <div className="photobooth-gallery-grid">
              {photos.map((p) => (
                <div className="evol-card photobooth-gallery-card" key={p.id}>
                  {p.url ? <img src={p.url} alt="" className="photobooth-gallery-img" /> : <p className="error">Photo missing.</p>}
                  <div className="evol-card-meta">
                    {new Date(p.time).toLocaleString()} · {p.filter}
                  </div>
                  {p.caption && <div className="evol-card-body">{p.caption}</div>}
                  <Button danger size="small" icon={<Trash2 size={13} />} onClick={() => handleDeletePhoto(p)} style={{ marginTop: 8 }}>
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}