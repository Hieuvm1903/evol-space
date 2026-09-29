import React, { useEffect, useRef, useState } from "react";
import { Button, Select, Input, Segmented, Empty } from "antd";
import {
  Sparkles, Camera, Download, Save, Timer, MousePointerClick, Trash2, LogIn, Image as ImageIcon, Images,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { PHOTO_FILTERS, applyFilter, canvasToBlob } from "../lib/imageFilters";
import * as photosService from "../lib/photosService";
import { Photo } from "../lib/photosService";
import { useConfirm } from "../components/ConfirmDialog";
import { notify } from "../lib/notify";
import "./music/MusicPage.css";
import "./PhotoboothPage.css";

// NOT PORTED from photobooth.py: gesture capture (hold a hand pose to
// trigger a photo) — would need @mediapipe/tasks-vision plus a port of
// gesture_capture.py's classify_pose(). Click and timer capture both work.

const TIMER_OPTIONS = [3, 5, 10];

export function PhotoboothPage() {
  const { user } = useAuth();
  const confirmDialog = useConfirm();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [mode, setMode] = useState<"click" | "timer">("click");
  const [timerSeconds, setTimerSeconds] = useState(3);
  const [countdown, setCountdown] = useState<number | null>(null);

  const [tab, setTab] = useState<"preview" | "gallery">("preview");
  const [rawCanvas, setRawCanvas] = useState<HTMLCanvasElement | null>(null);
  const [filterName, setFilterName] = useState<string>("None");
  const [caption, setCaption] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [photos, setPhotos] = useState<(Photo & { url: string | null })[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera isn't available in this browser (needs HTTPS or localhost).");
      return;
    }
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
  useEffect(() => { loadGallery(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  function captureFrame() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    setRawCanvas(canvas);
    setTab("preview"); // jump to the result
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
    try {
      const filtered = applyFilter(rawCanvas, rawCanvas.width, rawCanvas.height, filterName);
      const blob = await canvasToBlob(filtered);
      await photosService.savePhoto(user.id, blob, caption.trim(), filterName);
      notify.added("Photo saved to your gallery.");
      setRawCanvas(null);
      setCaption("");
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
      title: "Delete this photo?",
      description: "This can't be undone.",
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    await photosService.deletePhoto(p.id, user.id, p.filename);
    notify.deleted("Photo removed.");
    loadGallery();
  }

  return (
    <div className="page photobooth-page-shell">
      <div className="music-shell-header fade-in-up">
        <h2 className="music-title"><Sparkles size={20} className="music-title-icon" /> Photobooth</h2>
        <p className="music-subtitle">
          {user
            ? "Snap a pic, add a filter, download it or save it to your gallery."
            : "Snap a pic, add a filter and download it. Log in to save to a personal gallery too."}
        </p>
      </div>

      <div className="pb-workspace">
        {/* ---------------- Left: camera + capture ---------------- */}
        <div className="music-pane pb-pane fade-in-up">
          <div className="pb-pane-body">
            <div className="pb-video-wrap">
              <video ref={videoRef} autoPlay playsInline muted />
              {countdown !== null && <div className="pb-countdown">{countdown}</div>}
            </div>
            {cameraError && <p className="error" style={{ margin: 0 }}>{cameraError}</p>}

            <Segmented
              block
              value={mode}
              onChange={(v) => setMode(v as "click" | "timer")}
              options={[
                { label: <span><MousePointerClick size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Click</span>, value: "click" },
                { label: <span><Timer size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Timer</span>, value: "timer" },
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
              <div className="pb-timer-row">
                <Select
                  value={timerSeconds}
                  onChange={setTimerSeconds}
                  options={TIMER_OPTIONS.map((s) => ({ value: s, label: `${s}s` }))}
                  style={{ width: 80 }}
                  disabled={countdown !== null}
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
        </div>

        {/* ---------------- Right: preview / gallery ---------------- */}
        <div className="music-pane pb-pane fade-in-up">
          <div className="pb-pane-body">
            <Segmented
              block
              value={tab}
              onChange={(v) => setTab(v as "preview" | "gallery")}
              options={[
                { label: <span><ImageIcon size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Preview</span>, value: "preview" },
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

            {tab === "preview" && (
              <div className="pb-tab-content fade-in" key="preview">
                <div className="pb-controls-row">
                  <Select
                    value={filterName}
                    onChange={setFilterName}
                    options={PHOTO_FILTERS.map((f) => ({ value: f, label: f }))}
                    style={{ width: 140 }}
                  />
                  <Input
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Caption (optional)"
                    style={{ flex: 1 }}
                  />
                </div>

                <div className="pb-preview-frame">
                  {previewUrl
                    ? <img src={previewUrl} alt="Preview" />
                    : <p className="placeholder-note">Capture a photo to preview it here.</p>}
                </div>

                <div className="pb-actions-row">
                  <Button icon={<Download size={14} />} onClick={handleDownload} disabled={!previewUrl}>
                    Download
                  </Button>
                  {user ? (
                    <Button
                      type="primary" icon={<Save size={14} />} className="btn-glow"
                      onClick={handleSaveToGallery} loading={saving} disabled={!previewUrl}
                      style={{ flex: 1 }}
                    >
                      Save to gallery
                    </Button>
                  ) : (
                    <Button disabled icon={<LogIn size={14} />} style={{ flex: 1 }}
                      title="Log in to save photos to a personal gallery">
                      Log in to save
                    </Button>
                  )}
                </div>
              </div>
            )}

            {tab === "gallery" && (
              <div className="pb-tab-content fade-in" key="gallery">
                {!user ? (
                  <div className="pb-empty-center">
                    <p className="placeholder-note">Log in to see and manage a personal photo gallery.</p>
                  </div>
                ) : galleryLoading ? (
                  <div className="pb-empty-center"><p className="placeholder-note">Loading…</p></div>
                ) : photos.length === 0 ? (
                  <div className="pb-empty-center">
                    <Empty
                      className="fade-in" image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={<span style={{ color: "#9c97b8" }}>No photos yet. Take one and save it!</span>}
                    />
                  </div>
                ) : (
                  <div className="pb-gallery-scroll">
                    <div className="pb-gallery-grid">
                      {photos.map((p, i) => (
                        <div
                          className="evol-card pb-gallery-card stagger-item"
                          style={{ animationDelay: `${Math.min(i, 14) * 30}ms` }}
                          key={p.id}
                        >
                          {p.url
                            ? <img src={p.url} alt="" className="pb-gallery-img" />
                            : <p className="error">Photo missing.</p>}
                          <div className="evol-card-meta">
                            {new Date(p.time).toLocaleString()} · {p.filter}
                          </div>
                          {p.caption && <div className="evol-card-body">{p.caption}</div>}
                          <Button
                            danger size="small" icon={<Trash2 size={13} />}
                            onClick={() => handleDeletePhoto(p)} style={{ marginTop: 8 }}
                          >
                            Delete
                          </Button>
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