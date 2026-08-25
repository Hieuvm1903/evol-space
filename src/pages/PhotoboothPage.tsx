import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { PHOTO_FILTERS, applyFilter, canvasToBlob } from "../lib/imageFilters";
import * as photosService from "../lib/photosService";
import { Photo } from "../lib/photosService";

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

  // Start the camera once on mount, stop it on unmount.
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

  // Re-render the filtered preview whenever the raw capture or filter changes.
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
    <div className="page">
      <h2>📸 Photobooth</h2>
      <p className="evol-card-meta">
        {user
          ? "Snap a pic, add a filter, download it or save it to your gallery."
          : "Snap a pic, add a filter, and download it — no account needed. Log in to save to a personal gallery too."}
      </p>

      <div className="photobooth-layout">
        <div>
          <div className="photobooth-video-wrap">
            <video ref={videoRef} autoPlay playsInline muted />
            {countdown !== null && <div className="photobooth-countdown">{countdown}</div>}
          </div>
          {cameraError && <p className="error">{cameraError}</p>}

          <div className="tabs" style={{ marginTop: 10 }}>
            <button className={mode === "click" ? "active" : ""} onClick={() => setMode("click")}>Click to capture</button>
            <button className={mode === "timer" ? "active" : ""} onClick={() => setMode("timer")}>Timer capture</button>
          </div>

          {mode === "click" ? (
            <button onClick={captureFrame} disabled={!cameraReady} style={{ marginTop: 10 }}>📸 Capture</button>
          ) : (
            <div className="music-copy-row" style={{ marginTop: 10 }}>
              <select value={timerSeconds} onChange={(e) => setTimerSeconds(Number(e.target.value))}>
                {TIMER_OPTIONS.map((s) => <option key={s} value={s}>{s}s</option>)}
              </select>
              <button onClick={startTimerCapture} disabled={!cameraReady || countdown !== null}>
                Start countdown
              </button>
            </div>
          )}
        </div>

        <div>
          <label className="evol-card-meta">Filter</label>
          <select
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            style={{ display: "block", width: "100%", marginBottom: 10 }}
          >
            {PHOTO_FILTERS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>

          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Caption (optional)"
            style={{ width: "100%", marginBottom: 10 }}
          />

          {previewUrl ? (
            <>
              <img src={previewUrl} alt="Preview" className="photobooth-preview" />
              <div className="music-copy-row" style={{ marginTop: 10 }}>
                <button onClick={handleDownload}>Download</button>
                {user ? (
                  <button onClick={handleSaveToGallery} disabled={saving}>
                    {saving ? "…" : "Save to gallery"}
                  </button>
                ) : (
                  <button disabled title="Log in to save photos to a personal gallery">Log in to save</button>
                )}
              </div>
            </>
          ) : (
            <p className="placeholder-note">Capture a photo to preview it here.</p>
          )}
        </div>
      </div>

      <h3 style={{ marginTop: 30 }}>Gallery</h3>
      {!user ? (
        <p className="placeholder-note">Log in to see and manage a personal photo gallery.</p>
      ) : galleryLoading ? (
        <p className="placeholder-note">Loading…</p>
      ) : photos.length === 0 ? (
        <p className="placeholder-note">No photos yet — take one above and save it!</p>
      ) : (
        <div className="photobooth-gallery-grid">
          {photos.map((p) => (
            <div className="evol-card" key={p.id}>
              {p.url ? <img src={p.url} alt="" className="photobooth-gallery-img" /> : <p className="error">Photo missing.</p>}
              <div className="evol-card-meta">
                {new Date(p.time).toLocaleString()} · {p.filter}
              </div>
              {p.caption && <div className="evol-card-body">{p.caption}</div>}
              <button onClick={() => handleDeletePhoto(p)} style={{ marginTop: 8 }}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
