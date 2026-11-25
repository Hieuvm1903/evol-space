import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Camera, Download, Save, Timer, MousePointerClick, Trash2, LogIn,
  Image as ImageIcon, Images, Pencil, X, Maximize2, Minimize2,
  FlipHorizontal2, Grid3x3, Upload, RefreshCw, Columns2, LayoutGrid,
  Search, ChevronLeft, ChevronRight, CheckSquare, Activity, Hand, PauseCircle, Zap,
  ZoomIn, ZoomOut, ThumbsUp, Smile, Eye, Heart, Sparkles, Copy, RotateCw,
} from "lucide-react";
import { Button, Select, Input, InputNumber, Segmented, Slider, Empty, Tooltip, Switch } from "antd";
import {
  MOTION_TRIGGER_OPTIONS,
  MotionCaptureModel,
  type MotionAnalysis,
  type MotionTriggerMode,
} from "../lib/motionCaptureModel";
import { useAuth } from "../contexts/AuthContext";
import { canvasToBlob } from "../lib/imageFilters";
import {
  STRIP_THEMES,
  buildPhotoStripCanvas,
  defaultEdit,
  defaultStripConfig,
  ensureEditAssetsLoaded,
  FILTER_PRESETS,
  filterCssPreview,
  normalizeEdit,
  renderEdit,
  type EditState,
  type FilterPreset,
  type StripConfig,
  type StripThemeId,
} from "../lib/photoEditor";
import * as photosService from "../lib/photosService";
import { Photo } from "../lib/photosService";
import PhotoEditor from "../components/PhotoEditor";
import { useConfirm } from "../components/ConfirmDialog";
import { notify } from "../lib/notify";
import { useLongPressSelect } from "../hooks/useLongPressSelect";
import LongPressRing from "../components/LongPressRing";
import SelectCheckbox from "../components/SelectCheckbox";
import SelectionToolbar from "../components/SelectionToolbar";
import HelpTip from "../components/HelpTip";
import "./music/MusicPage.css";
import "./PhotoboothPage.css";

const TIMER_PRESETS = [3, 5, 10, 15, 30];

type PhotoWithUrl = Photo & { url: string | null };

function triggerIconFor(id: MotionTriggerMode) {
  switch (id) {
    case "thumb-up": return <ThumbsUp size={12} />;
    case "victory": return <Sparkles size={12} />;
    case "smile": return <Smile size={12} />;
    case "open-palm": return <Hand size={12} />;
    case "wink": return <Eye size={12} />;
    case "love": return <Heart size={12} />;
    case "wave": return <Hand size={12} />;
    case "pose-hold": return <Activity size={12} />;
    case "impulse": return <Zap size={12} />;
  }
}

function GalleryThumb({
  url,
  alt,
  onClick,
}: {
  url: string | null;
  alt: string;
  onClick?: () => void;
}) {
  const [broken, setBroken] = useState(false);

  if (!url || broken) {
    return (
      <div className="pb-gallery-img pb-gallery-broken" onClick={onClick}>
        <Camera size={22} />
        <span>Image unavailable</span>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      className="pb-gallery-img"
      onError={() => setBroken(true)}
      onClick={onClick}
    />
  );
}

export function PhotoboothPage() {
  const { user } = useAuth();
  const confirmDialog = useConfirm();
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const slotFileInputRef = useRef<HTMLInputElement | null>(null);
  const slotUploadTargetRef = useRef<number | null>(null);
  const cancelRef = useRef(false);

  const [expanded, setExpanded] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [mirrored, setMirrored] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [cameraZoom, setCameraZoom] = useState(1);
  const [liveFilter, setLiveFilter] = useState<FilterPreset>("None");
  const [flashActive, setFlashActive] = useState(false);

  const [shotType, setShotType] = useState<"single" | "strip">("single");
  const [stripLayout, setStripLayout] = useState<"strip" | "grid">("strip");
  const [stripProgress, setStripProgress] = useState<{ current: number; total: number } | null>(null);

  const [mode, setMode] = useState<"click" | "timer" | "motion">("click");
  const [timerSeconds, setTimerSeconds] = useState(3);
  const [countdown, setCountdown] = useState<number | null>(null);

  const [motionArmed, setMotionArmed] = useState(false);
  const [motionTrigger, setMotionTrigger] = useState<MotionTriggerMode>("thumb-up");
  const [motionSensitivity, setMotionSensitivity] = useState(60);
  const [motionDelay, setMotionDelay] = useState(2);
  const [motionAnalysis, setMotionAnalysis] = useState<MotionAnalysis | null>(null);
  const motionModelRef = useRef<MotionCaptureModel | null>(null);
  const triggerMotionCaptureRef = useRef<() => void>(() => {});

  const [tab, setTab] = useState<"edit" | "gallery">("edit");
  const [base, setBase] = useState<HTMLCanvasElement | null>(null);
  const [edit, setEdit] = useState<EditState>(defaultEdit());
  const [editing, setEditing] = useState<Photo | null>(null);
  const [caption, setCaption] = useState("");
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // 4-Shot Strip per-shot editing state
  const [stripFrames, setStripFrames] = useState<HTMLCanvasElement[] | null>(null);
  const [stripEdits, setStripEdits] = useState<EditState[]>([]);
  const [stripOuterEdit, setStripOuterEdit] = useState<EditState>(defaultEdit());
  const [stripConfig, setStripConfig] = useState<StripConfig>(() => defaultStripConfig("strip"));
  const [activeStripSlot, setActiveStripSlot] = useState<number | "all">("all");
  const [retakingSlot, setRetakingSlot] = useState<number | null>(null);

  const [photos, setPhotos] = useState<PhotoWithUrl[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryQuery, setGalleryQuery] = useState("");
  const [galleryFilterTag, setGalleryFilterTag] = useState<string>("All");
  const [lightboxId, setLightboxId] = useState<number | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const longPress = useLongPressSelect<number>();

  const setVideoEl = useCallback((el: HTMLVideoElement | null) => {
    videoElRef.current = el;
    if (el && streamRef.current) {
      el.srcObject = streamRef.current;
      el.play().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  useEffect(() => {
    let cancelled = false;
    setCameraReady(false);
    setCameraError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera isn't available in this browser — you can upload a photo on the right to edit.");
      return;
    }

    streamRef.current?.getTracks().forEach((t) => t.stop());
    const constraints: MediaStreamConstraints = {
      video: selectedDeviceId
        ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "user" },
      audio: false,
    };

    navigator.mediaDevices
      .getUserMedia(constraints)
      .then(async (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoElRef.current) {
          videoElRef.current.srcObject = stream;
          videoElRef.current.play().catch(() => {});
        }
        setCameraReady(true);

        try {
          const all = await navigator.mediaDevices.enumerateDevices();
          if (!cancelled) {
            const cams = all.filter((d) => d.kind === "videoinput");
            setDevices(cams);
            if (!selectedDeviceId && cams.length > 0) {
              const activeId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? cams[0].deviceId;
              setSelectedDeviceId(activeId);
            }
          }
        } catch {
          // enumerateDevices optional
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setCameraError(err?.message || "Couldn't access the camera. Upload a photo instead or retry.");
        }
      });

    return () => {
      cancelled = true;
      cancelRef.current = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [selectedDeviceId, cameraAttempt]);

  const loadGallery = useCallback(async () => {
    if (!user) return;
    setGalleryLoading(true);
    try {
      const rows = await photosService.getPhotos(user.id);
      const withUrls = await Promise.all(
        rows.map(async (p) => ({ ...p, url: await photosService.getPhotoUrl(p.filename) })),
      );
      setPhotos(withUrls);
    } catch {
      notify.error("Couldn't load your gallery", "Please try refreshing.");
    } finally {
      setGalleryLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadGallery();
  }, [loadGallery]);

  // Keep stripConfig.layout synced with left-panel stripLayout
  useEffect(() => {
    setStripConfig((prev) => (prev.layout === stripLayout ? prev : { ...prev, layout: stripLayout }));
  }, [stripLayout]);

  // Pre-warm MediaPipe vision models when user selects a hand/face trigger in Motion mode
  useEffect(() => {
    if (mode !== "motion") return;
    if (!motionModelRef.current) {
      motionModelRef.current = new MotionCaptureModel();
    }
    motionModelRef.current.preloadForMode(motionTrigger);
  }, [mode, motionTrigger]);

  function triggerFlash() {
    setFlashActive(true);
    window.setTimeout(() => setFlashActive(false), 220);
  }

  function grabVideoCanvas(): HTMLCanvasElement | null {
    const video = videoElRef.current;
    if (!video || video.videoWidth === 0) return null;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const z = Math.min(3, Math.max(1, cameraZoom));
    const sw = vw / z;
    const sh = vh / z;
    const sx = (vw - sw) / 2;
    const sy = (vh - sh) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext("2d")!;
    if (mirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, vw, vh);
    return canvas;
  }

  function resetEditor() {
    setBase(null);
    setEdit(defaultEdit());
    setEditing(null);
    setCaption("");
    setStripFrames(null);
    setStripEdits([]);
    setStripOuterEdit(defaultEdit());
    setActiveStripSlot("all");
    setRetakingSlot(null);
  }

  function loadCanvasIntoEditor(canvas: HTMLCanvasElement, initialFilter: FilterPreset = "None") {
    const nextEdit = defaultEdit();
    nextEdit.filter = initialFilter;
    setStripFrames(null);
    setStripEdits([]);
    setStripOuterEdit(defaultEdit());
    setActiveStripSlot("all");
    setRetakingSlot(null);
    setBase(canvas);
    setEdit(nextEdit);
    setEditing(null);
    setCaption("");
    setExpanded(false);
    setTab("edit");
  }

  function loadStripIntoEditor(frames: HTMLCanvasElement[], initialFilter: FilterPreset = "None") {
    const edits = frames.map(() => {
      const e = defaultEdit();
      e.filter = initialFilter;
      return e;
    });
    const cfg = { ...stripConfig, layout: stripLayout };
    setStripConfig(cfg);
    setStripFrames(frames);
    setStripEdits(edits);
    setStripOuterEdit(defaultEdit());
    setActiveStripSlot("all");
    setRetakingSlot(null);
    setBase(buildPhotoStripCanvas(frames, cfg));
    setEditing(null);
    setCaption("");
    setExpanded(false);
    setTab("edit");
  }

  function replaceSingleStripSlot(slotIdx: number, frame: HTMLCanvasElement) {
    setStripFrames((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[slotIdx] = frame;
      return next;
    });
    setRetakingSlot(null);
    setExpanded(false);
    setTab("edit");
    setActiveStripSlot(slotIdx);
    notify.updated(`Shot #${slotIdx + 1} updated.`);
  }

  function captureSingleFrame() {
    const canvas = grabVideoCanvas();
    if (!canvas) return;
    triggerFlash();
    if (retakingSlot !== null && stripFrames) {
      replaceSingleStripSlot(retakingSlot, canvas);
      return;
    }
    loadCanvasIntoEditor(canvas, liveFilter);
  }

  async function runCountdown(seconds: number): Promise<boolean> {
    for (let remaining = seconds; remaining > 0; remaining--) {
      if (cancelRef.current) {
        setCountdown(null);
        return false;
      }
      setCountdown(remaining);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setCountdown(null);
    return !cancelRef.current;
  }

  async function runStripCapture(firstDelay: number, stepDelay: number) {
    const total = 4;
    const frames: HTMLCanvasElement[] = [];

    for (let i = 1; i <= total; i++) {
      setStripProgress({ current: i, total });
      const ok = await runCountdown(i === 1 ? firstDelay : stepDelay);
      if (!ok) {
        setStripProgress(null);
        return;
      }
      const frame = grabVideoCanvas();
      if (!frame) {
        setStripProgress(null);
        return;
      }
      triggerFlash();
      frames.push(frame);
      if (i < total) await new Promise((r) => setTimeout(r, 320));
    }

    setStripProgress(null);
    loadStripIntoEditor(frames, liveFilter);
    notify.added("4-cut booth strip captured! Click any shot (1–4) to edit individually.");
  }

  async function executeMotionTriggeredCapture() {
    if (!cameraReady) return;
    cancelRef.current = false;

    if (shotType === "single" || retakingSlot !== null) {
      if (motionDelay > 0) {
        const ok = await runCountdown(motionDelay);
        if (ok) captureSingleFrame();
      } else {
        captureSingleFrame();
      }
      return;
    }

    const firstDelay = motionDelay > 0 ? motionDelay : 1;
    const stepDelay = Math.max(1, motionDelay || 2);
    await runStripCapture(firstDelay, stepDelay);
  }

  triggerMotionCaptureRef.current = () => {
    void executeMotionTriggeredCapture();
  };

  function toggleMotionArmed() {
    if (!cameraReady) return;
    if (motionArmed) {
      setMotionArmed(false);
      setMotionAnalysis(null);
      return;
    }
    if (!motionModelRef.current) {
      motionModelRef.current = new MotionCaptureModel();
    } else {
      motionModelRef.current.reset();
    }
    motionModelRef.current.preloadForMode(motionTrigger);
    setMotionAnalysis(null);
    setMotionArmed(true);
  }

  async function startCaptureFlow() {
    if (!cameraReady) return;
    if (mode === "motion") {
      toggleMotionArmed();
      return;
    }
    cancelRef.current = false;

    if (shotType === "single" || retakingSlot !== null) {
      if (mode === "click") {
        captureSingleFrame();
        return;
      }
      const ok = await runCountdown(timerSeconds);
      if (ok) captureSingleFrame();
      return;
    }

    // 4-Cut Photobooth Strip flow
    const stepDelay = mode === "timer" ? Math.max(1, timerSeconds) : 2;
    await runStripCapture(mode === "click" ? 2 : stepDelay, stepDelay);
  }

  function cancelCountdown() {
    cancelRef.current = true;
    setCountdown(null);
    setStripProgress(null);
    setMotionArmed(false);
    setMotionAnalysis(null);
    setRetakingSlot(null);
  }

  // Disarm motion detector if leaving motion mode or camera becomes unavailable
  useEffect(() => {
    if (mode !== "motion" || !cameraReady) {
      setMotionArmed(false);
      setMotionAnalysis(null);
    }
  }, [mode, cameraReady]);

  // Reset temporal state when trigger pattern changes while armed
  useEffect(() => {
    if (motionArmed) {
      motionModelRef.current?.reset();
      motionModelRef.current?.preloadForMode(motionTrigger);
    }
  }, [motionTrigger, motionArmed]);

  // Lightweight ~15 FPS motion & vision recognition loop
  useEffect(() => {
    if (mode !== "motion" || !motionArmed || !cameraReady || countdown !== null || stripProgress !== null) {
      return;
    }
    if (!motionModelRef.current) {
      motionModelRef.current = new MotionCaptureModel();
    }
    const model = motionModelRef.current;
    let rafId = 0;
    let lastTick = 0;
    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;
      if (now - lastTick >= 66) {
        lastTick = now;
        const video = videoElRef.current;
        if (video) {
          const result = model.processFrame(
            video,
            { mode: motionTrigger, sensitivity: motionSensitivity },
            now,
          );
          if (result.triggered) {
            setMotionArmed(false);
            setMotionAnalysis(null);
            triggerMotionCaptureRef.current();
            return;
          }
          setMotionAnalysis(result);
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [mode, motionArmed, cameraReady, countdown, stripProgress, motionTrigger, motionSensitivity]);

  // Spacebar shortcut to trigger capture (or toggle motion arm) when camera ready and not typing
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space" || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (!cameraReady || countdown !== null || stripProgress !== null) return;
      e.preventDefault();
      startCaptureFlow();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }); // intentional latest closure for current mode/timer/motion state

  async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
    const bmp = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0);
    return canvas;
  }

  async function handleFileUpload(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify.error("Unsupported file", "Please choose an image file (JPG, PNG, or WEBP).");
      return;
    }
    try {
      const canvas = await fileToCanvas(file);
      loadCanvasIntoEditor(canvas);
    } catch {
      notify.error("Couldn't open that image", "Please try a different file.");
    }
  }

  async function handleSlotFileUpload(file: File | null | undefined) {
    const targetIdx = slotUploadTargetRef.current;
    slotUploadTargetRef.current = null;
    if (!file || targetIdx === null || !stripFrames) return;
    if (!file.type.startsWith("image/")) {
      notify.error("Unsupported file", "Please choose an image file (JPG, PNG, or WEBP).");
      return;
    }
    try {
      const canvas = await fileToCanvas(file);
      replaceSingleStripSlot(targetIdx, canvas);
    } catch {
      notify.error("Couldn't open that image", "Please try a different file.");
    }
  }

  async function handleEditPhoto(p: Photo) {
    try {
      const blob = await photosService.downloadImage(p.original_filename ?? p.filename);
      const bmp = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      canvas.getContext("2d")!.drawImage(bmp, 0, 0);
      setStripFrames(null);
      setStripEdits([]);
      setStripOuterEdit(defaultEdit());
      setActiveStripSlot("all");
      setRetakingSlot(null);
      setBase(canvas);
      setEdit(p.original_filename ? normalizeEdit(p.edit) : defaultEdit());
      setEditing(p);
      setCaption(p.caption);
      setLightboxId(null);
      setTab("edit");
    } catch {
      notify.error("Couldn't open that photo", "Please try again.");
    }
  }

  // Recompute composed strip preview canvas whenever individual shots or strip theme change
  const composedStripBase = useMemo(() => {
    if (!stripFrames || stripFrames.length === 0) return null;
    const renderedShots = stripFrames.map((frame, i) =>
      renderEdit(frame, stripEdits[i] ?? defaultEdit(), 720),
    );
    return buildPhotoStripCanvas(renderedShots, stripConfig);
  }, [stripFrames, stripEdits, stripConfig]);

  // Mini thumbnails for the 4-shot slot bar
  const stripSlotThumbnails = useMemo(() => {
    if (!stripFrames) return [];
    return stripFrames.map((frame, i) => {
      const mini = renderEdit(frame, stripEdits[i] ?? defaultEdit(), 140);
      return mini.toDataURL("image/jpeg", 0.78);
    });
  }, [stripFrames, stripEdits]);

  async function renderFinalExportCanvas(): Promise<{
    rendered: HTMLCanvasElement;
    originalBase: HTMLCanvasElement;
    exportEdit: EditState;
  } | null> {
    if (stripFrames && stripFrames.length > 0) {
      await Promise.all([
        ...stripEdits.map((e) => ensureEditAssetsLoaded(e)),
        ensureEditAssetsLoaded(stripOuterEdit),
      ]);
      const fullShots = stripFrames.map((frame, i) =>
        renderEdit(frame, stripEdits[i] ?? defaultEdit()),
      );
      const stitched = buildPhotoStripCanvas(fullShots, stripConfig);
      const rendered = renderEdit(stitched, stripOuterEdit);
      const rawStitched = buildPhotoStripCanvas(stripFrames, stripConfig);
      return { rendered, originalBase: rawStitched, exportEdit: stripOuterEdit };
    }
    if (!base) return null;
    await ensureEditAssetsLoaded(edit);
    return { rendered: renderEdit(base, edit), originalBase: base, exportEdit: edit };
  }

  async function handleDownload() {
    try {
      const res = await renderFinalExportCanvas();
      if (!res) return;
      const blob = await canvasToBlob(res.rendered);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `evol-photobooth-${Date.now().toString(36)}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      notify.error("Couldn't export photo", "Please try again.");
    }
  }

  async function handleDownloadSingleSlot(slotIdx: number) {
    if (!stripFrames?.[slotIdx]) return;
    try {
      const slotEdit = stripEdits[slotIdx] ?? defaultEdit();
      await ensureEditAssetsLoaded(slotEdit);
      const blob = await canvasToBlob(renderEdit(stripFrames[slotIdx], slotEdit));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `evol-shot-${slotIdx + 1}-${Date.now().toString(36)}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      notify.error("Couldn't export shot", "Please try again.");
    }
  }

  function handleDownloadGalleryItem(p: PhotoWithUrl) {
    if (!p.url) return;
    const a = document.createElement("a");
    a.href = p.url;
    a.download = `evol-photo-${p.id}.jpg`;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.click();
  }

  async function handleSaveToGallery() {
    if (!user) return;
    setSaving(true);
    try {
      const res = await renderFinalExportCanvas();
      if (!res) return;
      const rendered = await canvasToBlob(res.rendered);
      if (editing) {
        const legacy = editing.original_filename ? undefined : await canvasToBlob(res.originalBase, 0.95);
        await photosService.updatePhoto(editing, user.id, rendered, caption.trim(), res.exportEdit, legacy);
        notify.updated("Photo updated.");
      } else {
        await photosService.savePhoto(
          user.id,
          await canvasToBlob(res.originalBase, 0.95),
          rendered,
          caption.trim(),
          res.exportEdit,
        );
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
      title: "Delete this photo?",
      description: "This can't be undone.",
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await photosService.deletePhoto(p, user.id);
      if (editing?.id === p.id) resetEditor();
      if (lightboxId === p.id) setLightboxId(null);
      notify.deleted("Photo removed.");
      loadGallery();
    } catch {
      notify.error("Couldn't delete the photo", "Please try again.");
    }
  }

  async function handleBulkDelete() {
    if (!user) return;
    const ids = Array.from(longPress.selectedIds);
    if (!ids.length) return;
    const ok = await confirmDialog({
      title: `Delete ${ids.length} photo${ids.length === 1 ? "" : "s"}?`,
      description: "This can't be undone.",
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;

    setBulkDeleting(true);
    try {
      const map = new Map(photos.map((p) => [p.id, p]));
      for (const id of ids) {
        const target = map.get(id);
        if (target) await photosService.deletePhoto(target, user.id);
      }
      if (editing && ids.includes(editing.id)) resetEditor();
      notify.deleted(`${ids.length} photo${ids.length === 1 ? "" : "s"} removed.`);
      longPress.exitSelectMode();
      await loadGallery();
    } catch {
      notify.error("Some photos couldn't be deleted", "Please try again.");
    } finally {
      setBulkDeleting(false);
    }
  }

  function swapStripSlots(a: number, b: number) {
    if (!stripFrames || a < 0 || b < 0 || a >= stripFrames.length || b >= stripFrames.length) return;
    const nextFrames = [...stripFrames];
    const nextEdits = [...stripEdits];
    [nextFrames[a], nextFrames[b]] = [nextFrames[b], nextFrames[a]];
    [nextEdits[a], nextEdits[b]] = [nextEdits[b], nextEdits[a]];
    setStripFrames(nextFrames);
    setStripEdits(nextEdits);
    setActiveStripSlot(b);
  }

  function applyLookToAllSlots(sourceIdx: number) {
    const src = stripEdits[sourceIdx];
    if (!src) return;
    setStripEdits((prev) =>
      prev.map((item, idx) =>
        idx === sourceIdx
          ? item
          : {
              ...item,
              filter: src.filter,
              adj: { ...src.adj },
              frame: { ...src.frame },
              overlay: src.overlay ? { ...src.overlay } : null,
            },
      ),
    );
    notify.updated("Look & frame applied to all 4 shots.");
  }

  function startRetakeSlot(slotIdx: number) {
    if (!cameraReady) {
      notify.error("Camera unavailable", "Upload a replacement photo instead.");
      return;
    }
    setRetakingSlot(slotIdx);
    setExpanded(true);
  }

  const galleryFilterOptions = useMemo(() => {
    const used = new Set(photos.map((p) => p.filter).filter(Boolean));
    return ["All", ...Array.from(used)];
  }, [photos]);

  const filteredPhotos = useMemo(() => {
    const q = galleryQuery.trim().toLowerCase();
    return photos.filter((p) => {
      if (galleryFilterTag !== "All" && p.filter !== galleryFilterTag) return false;
      if (q && !(p.caption || "").toLowerCase().includes(q) && !p.filter.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [photos, galleryQuery, galleryFilterTag]);

  const lightboxIndex = useMemo(
    () => (lightboxId === null ? -1 : filteredPhotos.findIndex((p) => p.id === lightboxId)),
    [filteredPhotos, lightboxId],
  );
  const lightboxPhoto = lightboxIndex >= 0 ? filteredPhotos[lightboxIndex] : null;

  useEffect(() => {
    if (!lightboxPhoto) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxId(null);
      else if (e.key === "ArrowLeft" && lightboxIndex > 0) setLightboxId(filteredPhotos[lightboxIndex - 1].id);
      else if (e.key === "ArrowRight" && lightboxIndex < filteredPhotos.length - 1) setLightboxId(filteredPhotos[lightboxIndex + 1].id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxPhoto, lightboxIndex, filteredPhotos]);

  const busyCapturing = countdown !== null || stripProgress !== null;
  const activeMotionMeta = MOTION_TRIGGER_OPTIONS.find((m) => m.id === motionTrigger) ?? MOTION_TRIGGER_OPTIONS[0];

  const liveVideoStyle: React.CSSProperties = {
    transform: `${mirrored ? "scaleX(-1) " : ""}scale(${cameraZoom})`,
    filter: filterCssPreview(liveFilter, 1) || undefined,
  };

  const adjustCameraZoom = (delta: number) => {
    setCameraZoom((z) => Math.min(3, Math.max(1, Math.round((z + delta) * 10) / 10)));
  };

  const isStripModeActive = Boolean(stripFrames && stripFrames.length > 0);
  const editorBase = isStripModeActive
    ? activeStripSlot === "all"
      ? composedStripBase
      : stripFrames![activeStripSlot] ?? null
    : base;
  const editorState = isStripModeActive
    ? activeStripSlot === "all"
      ? stripOuterEdit
      : stripEdits[activeStripSlot] ?? defaultEdit()
    : edit;

  const handleEditorChange = (next: EditState) => {
    if (isStripModeActive) {
      if (activeStripSlot === "all") {
        setStripOuterEdit(next);
      } else {
        setStripEdits((prev) => prev.map((e, idx) => (idx === activeStripSlot ? next : e)));
      }
      return;
    }
    setEdit(next);
  };

  const cameraView = (
    <div
      className={`pb-video-wrap${expanded ? " pb-video-expanded" : ""}`}
      onWheel={(e) => {
        if (Math.abs(e.deltaY) < 4) return;
        e.preventDefault();
        adjustCameraZoom(e.deltaY < 0 ? 0.1 : -0.1);
      }}
    >
      <video ref={setVideoEl} autoPlay playsInline muted style={liveVideoStyle} />

      {showGrid && (
        <div className="pb-grid-overlay" aria-hidden>
          <span /><span /><span /><span />
        </div>
      )}

      {flashActive && <div className="pb-shutter-flash" aria-hidden />}

      {retakingSlot !== null && (
        <div className="pb-strip-badge">
          Retaking Shot #{retakingSlot + 1}
        </div>
      )}

      {stripProgress && (
        <div className="pb-strip-badge">
          Shot {stripProgress.current} / {stripProgress.total}
        </div>
      )}

      {mode === "motion" && motionArmed && !busyCapturing && motionAnalysis && (
        <>
          {motionAnalysis.centroid && (
            <div
              className={`pb-motion-reticle phase-${motionAnalysis.phase}`}
              style={{
                left: `${(mirrored ? 1 - motionAnalysis.centroid.x : motionAnalysis.centroid.x) * 100}%`,
                top: `${motionAnalysis.centroid.y * 100}%`,
              }}
              aria-hidden
            />
          )}
          <div className={`pb-motion-hud phase-${motionAnalysis.phase}`}>
            <div className="pb-motion-hud-row">
              {motionAnalysis.phase !== "error" && <span className="pb-motion-dot" />}
              <span className="pb-motion-label">{motionAnalysis.label}</span>
            </div>
            <div className="pb-motion-bars">
              <div className="pb-motion-bar-track" title="Trigger lock progress">
                <div
                  className="pb-motion-bar-fill lock"
                  style={{ width: `${Math.round(motionAnalysis.progress * 100)}%` }}
                />
              </div>
              <div className="pb-motion-bar-track energy" title="Signal strength">
                <div
                  className="pb-motion-bar-fill energy"
                  style={{ width: `${Math.round(motionAnalysis.energy * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {countdown !== null && <div className="pb-countdown">{countdown}</div>}

      <div className="pb-viewfinder-top-actions">
        <Tooltip title={mirrored ? "Mirror preview: On" : "Mirror preview: Off"}>
          <button
            type="button"
            className={`pb-vf-btn${mirrored ? " active" : ""}`}
            onClick={() => setMirrored((v) => !v)}
          >
            <FlipHorizontal2 size={15} />
          </button>
        </Tooltip>
        <Tooltip title={showGrid ? "Hide grid" : "Rule-of-thirds grid"}>
          <button
            type="button"
            className={`pb-vf-btn${showGrid ? " active" : ""}`}
            onClick={() => setShowGrid((v) => !v)}
          >
            <Grid3x3 size={15} />
          </button>
        </Tooltip>
        <Tooltip title={expanded ? "Exit expanded view (Esc)" : "Expand camera"}>
          <button
            type="button"
            className="pb-vf-btn"
            onClick={() => {
              if (expanded) setRetakingSlot(null);
              setExpanded((v) => !v);
            }}
          >
            {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </Tooltip>
      </div>

      {!expanded && cameraReady && (
        <div className="pb-vf-zoom-bar">
          <button
            type="button"
            className="pb-vf-zoom-btn"
            disabled={cameraZoom <= 1}
            onClick={() => adjustCameraZoom(-0.2)}
            aria-label="Zoom out camera"
          >
            <ZoomOut size={12} />
          </button>
          <button
            type="button"
            className="pb-vf-zoom-val"
            onClick={() => setCameraZoom(1)}
            title="Reset camera zoom"
          >
            {cameraZoom.toFixed(1)}×
          </button>
          <button
            type="button"
            className="pb-vf-zoom-btn"
            disabled={cameraZoom >= 3}
            onClick={() => adjustCameraZoom(0.2)}
            aria-label="Zoom in camera"
          >
            <ZoomIn size={12} />
          </button>
        </div>
      )}

      {expanded && (
        <div className="pb-expanded-controls">
          <div className="pb-vf-zoom-bar inline">
            <button
              type="button"
              className="pb-vf-zoom-btn"
              disabled={cameraZoom <= 1}
              onClick={() => adjustCameraZoom(-0.2)}
              aria-label="Zoom out camera"
            >
              <ZoomOut size={13} />
            </button>
            <button
              type="button"
              className="pb-vf-zoom-val"
              onClick={() => setCameraZoom(1)}
              title="Reset camera zoom"
            >
              {cameraZoom.toFixed(1)}×
            </button>
            <button
              type="button"
              className="pb-vf-zoom-btn"
              disabled={cameraZoom >= 3}
              onClick={() => adjustCameraZoom(0.2)}
              aria-label="Zoom in camera"
            >
              <ZoomIn size={13} />
            </button>
          </div>
          {retakingSlot === null && (
            <Segmented
              value={shotType}
              onChange={(v) => setShotType(v as "single" | "strip")}
              disabled={busyCapturing}
              options={[
                { label: "Single", value: "single" },
                { label: "4-Cut Strip", value: "strip" },
              ]}
            />
          )}
          <Segmented
            value={mode}
            onChange={(v) => setMode(v as "click" | "timer" | "motion")}
            disabled={busyCapturing}
            options={[
              { label: <MousePointerClick size={14} style={{ verticalAlign: -2 }} />, value: "click" },
              { label: <Timer size={14} style={{ verticalAlign: -2 }} />, value: "timer" },
              { label: <Activity size={14} style={{ verticalAlign: -2 }} />, value: "motion" },
            ]}
          />
          {mode === "timer" && (
            <InputNumber
              min={1} max={60} precision={0} value={timerSeconds} suffix="s"
              onChange={(v) => setTimerSeconds(v ?? 3)}
              disabled={busyCapturing} style={{ width: 92 }}
            />
          )}
          {mode === "motion" && (
            <Select
              value={motionTrigger}
              onChange={(v) => setMotionTrigger(v as MotionTriggerMode)}
              disabled={busyCapturing}
              style={{ width: 145 }}
              options={MOTION_TRIGGER_OPTIONS.map((m) => ({
                value: m.id,
                label: m.label,
              }))}
            />
          )}
          {busyCapturing ? (
            <Button danger size="large" icon={<X size={16} />} onClick={cancelCountdown}>Cancel</Button>
          ) : mode === "motion" ? (
            <Button
              type={motionArmed ? "default" : "primary"}
              danger={motionArmed}
              size="large"
              className={motionArmed ? undefined : "btn-glow"}
              icon={motionArmed ? <PauseCircle size={16} /> : <Activity size={16} />}
              disabled={!cameraReady}
              onClick={toggleMotionArmed}
            >
              {motionArmed ? "Stop motion" : "Arm motion (Space)"}
            </Button>
          ) : (
            <Button
              type="primary" size="large" className="btn-glow"
              icon={mode === "click" && (shotType === "single" || retakingSlot !== null) ? <Camera size={16} /> : <Timer size={16} />}
              disabled={!cameraReady}
              onClick={startCaptureFlow}
            >
              {retakingSlot !== null
                ? `Retake #${retakingSlot + 1}`
                : shotType === "strip"
                  ? "Start 4-cut strip"
                  : mode === "click"
                    ? "Capture (Space)"
                    : "Start countdown"}
            </Button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="page photobooth-page-shell">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          handleFileUpload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={slotFileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          void handleSlotFileUpload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <div className="music-shell-header fade-in-up">
        <div className="pb-header-row">
          <div>
            <h2 className="music-title">
              <Camera size={20} className="music-title-icon" />
              Photobooth
              <HelpTip
                size="md"
                content={
                  user
                    ? "Snap a pic, compose a 4-cut strip with per-shot editing, zoom, API frames, and gesture capture."
                    : "Snap a pic, edit each shot individually, add frames, and export in full quality."
                }
              />
            </h2>
          </div>
          <Button
            icon={<Upload size={14} />}
            onClick={() => fileInputRef.current?.click()}
            className="pb-upload-header-btn"
          >
            Upload photo
          </Button>
        </div>
      </div>

      <div className="pb-workspace">
        {/* ---------------- Left: camera + capture ---------------- */}
        <div className="music-pane pb-pane fade-in-up">
          <div className="pb-pane-body">
            {expanded ? createPortal(cameraView, document.body) : cameraView}

            {cameraReady && (
              <div className="pb-zoom-slider-row">
                <span className="pb-strip-layout-label">Zoom</span>
                <Slider
                  min={1}
                  max={3}
                  step={0.1}
                  value={cameraZoom}
                  onChange={setCameraZoom}
                  disabled={busyCapturing}
                  style={{ flex: 1, margin: "4px 6px" }}
                />
                <span className="pb-motion-val">{cameraZoom.toFixed(1)}×</span>
              </div>
            )}

            {cameraError && (
              <div className="pb-camera-fallback">
                <p className="error" style={{ margin: 0 }}>{cameraError}</p>
                <div className="pb-fallback-actions">
                  <Button size="small" icon={<RefreshCw size={13} />} onClick={() => setCameraAttempt((n) => n + 1)}>
                    Retry camera
                  </Button>
                  <Button size="small" type="primary" icon={<Upload size={13} />} onClick={() => fileInputRef.current?.click()}>
                    Upload image
                  </Button>
                </div>
              </div>
            )}

            {devices.length > 1 && (
              <Select
                size="small"
                value={selectedDeviceId || undefined}
                onChange={(id) => setSelectedDeviceId(id)}
                disabled={busyCapturing}
                options={devices.map((d, idx) => ({
                  value: d.deviceId,
                  label: d.label || `Camera ${idx + 1}`,
                }))}
                placeholder="Select camera"
              />
            )}

            <div className="pb-control-group">
              <Segmented
                block
                value={shotType}
                disabled={busyCapturing}
                onChange={(v) => setShotType(v as "single" | "strip")}
                options={[
                  { label: <span className="pb-seg-label"><Camera size={13} />Single shot</span>, value: "single" },
                  { label: <span className="pb-seg-label"><Columns2 size={13} />4-Cut strip</span>, value: "strip" },
                ]}
              />

              {shotType === "strip" && (
                <div className="pb-strip-layout-row">
                  <span className="pb-strip-layout-label">Strip layout</span>
                  <Segmented
                    size="small"
                    value={stripLayout}
                    disabled={busyCapturing}
                    onChange={(v) => setStripLayout(v as "strip" | "grid")}
                    options={[
                      { label: <span className="pb-seg-label"><Columns2 size={12} />1×4</span>, value: "strip" },
                      { label: <span className="pb-seg-label"><LayoutGrid size={12} />2×2</span>, value: "grid" },
                    ]}
                  />
                </div>
              )}
            </div>

            <div className="pb-live-filter-row">
              <span className="pb-strip-layout-label">Live look</span>
              <Select
                size="small"
                value={liveFilter}
                onChange={(v) => setLiveFilter(v)}
                style={{ flex: 1 }}
                options={FILTER_PRESETS.map((f) => ({ value: f, label: f }))}
              />
            </div>

            <Segmented
              block
              value={mode}
              disabled={busyCapturing}
              onChange={(v) => setMode(v as "click" | "timer" | "motion")}
              options={[
                { label: <span className="pb-seg-label"><MousePointerClick size={14} />Instant</span>, value: "click" },
                { label: <span className="pb-seg-label"><Timer size={14} />Timer</span>, value: "timer" },
                { label: <span className="pb-seg-label"><Activity size={14} />Gesture / Motion</span>, value: "motion" },
              ]}
            />

            {mode === "click" ? (
              busyCapturing ? (
                <Button danger icon={<X size={15} />} onClick={cancelCountdown} block>
                  Cancel strip ({stripProgress?.current ?? 0}/4)
                </Button>
              ) : (
                <Button
                  type="primary"
                  icon={<Camera size={15} />}
                  className="btn-glow"
                  onClick={startCaptureFlow}
                  disabled={!cameraReady}
                  block
                >
                  {shotType === "strip" ? "Capture 4-cut strip" : "Capture (Space)"}
                </Button>
              )
            ) : mode === "timer" ? (
              <>
                <div className="pb-timer-row">
                  <InputNumber
                    min={1} max={60} precision={0} value={timerSeconds} suffix="s"
                    onChange={(v) => setTimerSeconds(v ?? 3)}
                    disabled={busyCapturing} style={{ width: 98 }}
                  />
                  {!busyCapturing ? (
                    <Button
                      type="primary" icon={<Timer size={15} />} className="btn-glow"
                      onClick={startCaptureFlow} disabled={!cameraReady} style={{ flex: 1 }}
                    >
                      {shotType === "strip" ? "Start 4-cut timer" : "Start countdown"}
                    </Button>
                  ) : (
                    <Button danger icon={<X size={15} />} onClick={cancelCountdown} style={{ flex: 1 }}>
                      Cancel
                    </Button>
                  )}
                </div>
                <div className="pb-chip-row">
                  {TIMER_PRESETS.map((s) => (
                    <Button
                      key={s}
                      size="small"
                      type={timerSeconds === s ? "primary" : "default"}
                      disabled={busyCapturing}
                      onClick={() => setTimerSeconds(s)}
                    >
                      {s}s
                    </Button>
                  ))}
                </div>
              </>
            ) : (
              <div className="pb-motion-panel">
                <div className="pb-motion-trigger-grid">
                  {MOTION_TRIGGER_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={busyCapturing}
                      className={`pb-trigger-chip${motionTrigger === opt.id ? " active" : ""}`}
                      onClick={() => setMotionTrigger(opt.id)}
                      title={opt.hint}
                    >
                      {triggerIconFor(opt.id)}
                      <span>{opt.shortLabel}</span>
                    </button>
                  ))}
                </div>

                <div className="pb-motion-setting-row">
                  <span className="pb-strip-layout-label" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span>{activeMotionMeta.label}</span>
                    <HelpTip content={activeMotionMeta.hint} />
                  </span>
                </div>

                <div className="pb-motion-setting-row">
                  <span className="pb-strip-layout-label">Delay after trigger</span>
                  <div className="pb-chip-row">
                    {[0, 1, 2, 3].map((s) => (
                      <Button
                        key={s}
                        size="small"
                        type={motionDelay === s ? "primary" : "default"}
                        disabled={busyCapturing}
                        onClick={() => setMotionDelay(s)}
                      >
                        {s === 0 ? "0s" : `${s}s`}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="pb-motion-setting-row">
                  <span className="pb-strip-layout-label">Sensitivity</span>
                  <Slider
                    min={15}
                    max={95}
                    value={motionSensitivity}
                    onChange={setMotionSensitivity}
                    disabled={busyCapturing}
                    style={{ flex: 1, margin: "4px 6px" }}
                  />
                  <span className="pb-motion-val">{motionSensitivity}%</span>
                </div>

                {busyCapturing ? (
                  <Button danger icon={<X size={15} />} onClick={cancelCountdown} block>
                    Cancel capture
                  </Button>
                ) : (
                  <Button
                    type={motionArmed ? "default" : "primary"}
                    danger={motionArmed}
                    icon={motionArmed ? <PauseCircle size={15} /> : <Activity size={15} />}
                    className={motionArmed ? undefined : "btn-glow"}
                    onClick={toggleMotionArmed}
                    disabled={!cameraReady}
                    block
                  >
                    {motionArmed
                      ? "Stop sensor (Space)"
                      : shotType === "strip"
                        ? `Arm ${activeMotionMeta.label} · 4-cut`
                        : `Arm ${activeMotionMeta.label} (Space)`}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ---------------- Right: editor / gallery ---------------- */}
        <div className="music-pane pb-pane fade-in-up">
          <div className="pb-pane-body">
            <Segmented
              block
              value={tab}
              onChange={(v) => {
                if (v !== "gallery") longPress.exitSelectMode();
                setTab(v as "edit" | "gallery");
              }}
              options={[
                { label: <span className="pb-seg-label"><ImageIcon size={14} />{editing ? "Editing" : "Editor"}</span>, value: "edit" },
                {
                  label: (
                    <span className="pb-seg-label">
                      <Images size={14} />
                      Gallery{user && photos.length > 0 ? ` (${photos.length})` : ""}
                    </span>
                  ),
                  value: "gallery",
                },
              ]}
            />

            {tab === "edit" && (
              <div className="pb-tab-content fade-in" key="edit">
                {editorBase ? (
                  <>
                    {isStripModeActive && (
                      <div className="pb-strip-composer-bar">
                        <div className="pb-strip-slots-row">
                          {stripSlotThumbnails.map((thumb, idx) => (
                            <button
                              key={idx}
                              type="button"
                              className={`pb-slot-card${activeStripSlot === idx ? " active" : ""}`}
                              onClick={() => setActiveStripSlot(idx)}
                            >
                              <img src={thumb} alt={`Shot ${idx + 1}`} />
                              <span className="pb-slot-num">Shot {idx + 1}</span>
                            </button>
                          ))}
                          <button
                            type="button"
                            className={`pb-slot-card pb-slot-all${activeStripSlot === "all" ? " active" : ""}`}
                            onClick={() => setActiveStripSlot("all")}
                          >
                            <Columns2 size={18} />
                            <span className="pb-slot-num">Full Strip</span>
                          </button>
                        </div>

                        {activeStripSlot === "all" ? (
                          <div className="pb-strip-theme-panel">
                            <div className="pb-strip-theme-row">
                              <span className="pb-strip-layout-label">Strip frame</span>
                              <div className="pb-chip-row">
                                {STRIP_THEMES.map((t) => (
                                  <Button
                                    key={t.id}
                                    size="small"
                                    type={stripConfig.theme === t.id ? "primary" : "default"}
                                    onClick={() =>
                                      setStripConfig((prev) => ({ ...prev, theme: t.id as StripThemeId }))
                                    }
                                  >
                                    {t.label}
                                  </Button>
                                ))}
                              </div>
                            </div>

                            {stripConfig.theme === "custom" && (
                              <div className="pb-strip-theme-row">
                                <label className="pe-color-row">
                                  Background
                                  <input
                                    type="color"
                                    value={stripConfig.bgColor}
                                    onChange={(e) =>
                                      setStripConfig((prev) => ({ ...prev, bgColor: e.target.value }))
                                    }
                                  />
                                </label>
                                <label className="pe-color-row">
                                  Border
                                  <input
                                    type="color"
                                    value={stripConfig.borderColor}
                                    onChange={(e) =>
                                      setStripConfig((prev) => ({ ...prev, borderColor: e.target.value }))
                                    }
                                  />
                                </label>
                              </div>
                            )}

                            <div className="pb-strip-theme-row">
                              <Input
                                size="small"
                                value={stripConfig.footerText}
                                onChange={(e) =>
                                  setStripConfig((prev) => ({ ...prev, footerText: e.target.value }))
                                }
                                placeholder="Strip footer label"
                                style={{ flex: 1, minWidth: 120 }}
                              />
                              <label className="pb-strip-toggle">
                                <span>Date</span>
                                <Switch
                                  size="small"
                                  checked={stripConfig.showDate}
                                  onChange={(checked) =>
                                    setStripConfig((prev) => ({ ...prev, showDate: checked }))
                                  }
                                />
                              </label>
                            </div>
                          </div>
                        ) : (
                          <div className="pb-slot-actions-bar">
                            <span className="pb-slot-editing-label">
                              Editing Shot #{activeStripSlot + 1} of 4
                            </span>
                            <div className="pb-chip-row">
                              <Tooltip title="Retake this shot from camera">
                                <Button
                                  size="small"
                                  icon={<RotateCw size={12} />}
                                  onClick={() => startRetakeSlot(activeStripSlot)}
                                >
                                  Retake
                                </Button>
                              </Tooltip>
                              <Tooltip title="Upload an image into this slot">
                                <Button
                                  size="small"
                                  icon={<Upload size={12} />}
                                  onClick={() => {
                                    slotUploadTargetRef.current = activeStripSlot;
                                    slotFileInputRef.current?.click();
                                  }}
                                >
                                  Replace
                                </Button>
                              </Tooltip>
                              <Tooltip title="Swap with previous shot">
                                <Button
                                  size="small"
                                  icon={<ChevronLeft size={12} />}
                                  disabled={activeStripSlot === 0}
                                  onClick={() => swapStripSlots(activeStripSlot, activeStripSlot - 1)}
                                />
                              </Tooltip>
                              <Tooltip title="Swap with next shot">
                                <Button
                                  size="small"
                                  icon={<ChevronRight size={12} />}
                                  disabled={activeStripSlot === stripFrames!.length - 1}
                                  onClick={() => swapStripSlots(activeStripSlot, activeStripSlot + 1)}
                                />
                              </Tooltip>
                              <Tooltip title="Copy filter, adjustments & frame to all 4 shots">
                                <Button
                                  size="small"
                                  icon={<Copy size={12} />}
                                  onClick={() => applyLookToAllSlots(activeStripSlot)}
                                >
                                  Apply to all 4
                                </Button>
                              </Tooltip>
                              <Tooltip title="Download just this shot">
                                <Button
                                  size="small"
                                  icon={<Download size={12} />}
                                  onClick={() => void handleDownloadSingleSlot(activeStripSlot)}
                                />
                              </Tooltip>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <PhotoEditor base={editorBase} state={editorState} onChange={handleEditorChange} />
                    <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption (optional)" allowClear />
                    <div className="pb-actions-row">
                      <Button icon={<Download size={14} />} onClick={() => void handleDownload()}>
                        {isStripModeActive ? "Download strip" : "Download"}
                      </Button>
                      {user ? (
                        <Button
                          type="primary"
                          icon={<Save size={14} />}
                          className="btn-glow"
                          onClick={handleSaveToGallery}
                          loading={saving}
                          style={{ flex: 1 }}
                        >
                          {editing ? "Save changes" : isStripModeActive ? "Save strip to gallery" : "Save to gallery"}
                        </Button>
                      ) : (
                        <Button
                          disabled
                          icon={<LogIn size={14} />}
                          style={{ flex: 1 }}
                          title="Log in to save photos to a personal gallery"
                        >
                          Log in to save
                        </Button>
                      )}
                      <Tooltip title="Discard current edit">
                        <Button icon={<X size={14} />} onClick={resetEditor} />
                      </Tooltip>
                    </div>
                  </>
                ) : (
                  <div
                    className={`pb-preview-frame${dragOver ? " drag-over" : ""}`}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      handleFileUpload(e.dataTransfer.files?.[0]);
                    }}
                  >
                    <Upload size={26} style={{ color: "#8b6ff5", marginBottom: 8 }} />
                    <p className="placeholder-note" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span>No photo loaded</span>
                      <HelpTip content="Capture from the camera (single or 4-cut strip), or drop an image here to start editing." />
                    </p>
                    <Button
                      size="small"
                      icon={<Upload size={13} />}
                      style={{ marginTop: 12 }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Choose image file
                    </Button>
                  </div>
                )}
              </div>
            )}

            {tab === "gallery" && (
              <div className="pb-tab-content fade-in" key="gallery">
                {!user ? (
                  <div className="pb-empty-center">
                    <p className="placeholder-note">Log in to view and manage your personal photo gallery.</p>
                  </div>
                ) : galleryLoading ? (
                  <div className="pb-empty-center">
                    <p className="placeholder-note">Loading gallery…</p>
                  </div>
                ) : photos.length === 0 ? (
                  <div className="pb-empty-center">
                    <Empty
                      className="fade-in"
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={
                        <span style={{ color: "var(--evol-muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span>No photos yet.</span>
                          <HelpTip content="Take or upload a photo and save it!" />
                        </span>
                      }
                    />
                  </div>
                ) : (
                  <>
                    <div className="pb-gallery-toolbar">
                      <Input
                        size="small"
                        prefix={<Search size={13} color="var(--evol-muted)" />}
                        value={galleryQuery}
                        onChange={(e) => setGalleryQuery(e.target.value)}
                        placeholder="Search captions or filters…"
                        allowClear
                        style={{ flex: 1, minWidth: 0 }}
                      />
                      <Select
                        size="small"
                        value={galleryFilterTag}
                        onChange={setGalleryFilterTag}
                        style={{ width: 120 }}
                        options={galleryFilterOptions.map((f) => ({ value: f, label: f }))}
                      />
                      <Tooltip title={longPress.selectMode ? "Exit selection" : "Select multiple"}>
                        <Button
                          size="small"
                          type={longPress.selectMode ? "primary" : "default"}
                          icon={<CheckSquare size={13} />}
                          onClick={() =>
                            longPress.selectMode
                              ? longPress.exitSelectMode()
                              : longPress.enterSelectMode()
                          }
                        />
                      </Tooltip>
                    </div>

                    {filteredPhotos.length === 0 ? (
                      <div className="pb-empty-center">
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description={<span style={{ color: "var(--evol-muted)" }}>No matching photos.</span>}
                        />
                      </div>
                    ) : (
                      <div className="pb-gallery-scroll">
                        <div className="pb-gallery-grid">
                          {filteredPhotos.map((p, i) => {
                            const selecting = longPress.selectMode;
                            const checked = longPress.isSelected(p.id);
                            const pressing = longPress.isPressing(p.id);
                            const lp = longPress.bind(p.id);
                            return (
                              <div
                                className={`evol-card pb-gallery-card stagger-item${checked ? " bulk-selected" : ""}${pressing ? " pressing" : ""}`}
                                style={{ animationDelay: `${Math.min(i, 14) * 30}ms` }}
                                key={p.id}
                                {...lp}
                                onClick={(e) => {
                                  lp.onClick(e);
                                  if (!selecting && !e.defaultPrevented) setLightboxId(p.id);
                                }}
                              >
                                <div className="pb-gallery-thumb-wrap">
                                  <GalleryThumb url={p.url} alt={p.caption || "Saved photo"} />
                                  {selecting && (
                                    <div className="pb-gallery-check">
                                      <SelectCheckbox checked={checked} />
                                    </div>
                                  )}
                                  {pressing && (
                                    <div className="pb-gallery-check">
                                      <LongPressRing />
                                    </div>
                                  )}
                                </div>
                                <div className="evol-card-meta pb-gallery-meta">
                                  <span>{new Date(p.time).toLocaleDateString()}</span>
                                  <span>· {p.filter}</span>
                                </div>
                                {p.caption && <div className="evol-card-body pb-gallery-caption">{p.caption}</div>}
                                {!selecting && (
                                  <div className="pb-gallery-card-actions" onClick={(e) => e.stopPropagation()}>
                                    <Tooltip title="Edit layers">
                                      <Button size="small" icon={<Pencil size={13} />} onClick={() => handleEditPhoto(p)} />
                                    </Tooltip>
                                    <Tooltip title="Download">
                                      <Button size="small" icon={<Download size={13} />} disabled={!p.url} onClick={() => handleDownloadGalleryItem(p)} />
                                    </Tooltip>
                                    <Tooltip title="Delete">
                                      <Button danger size="small" icon={<Trash2 size={13} />} onClick={() => handleDeletePhoto(p)} />
                                    </Tooltip>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {tab === "gallery" && longPress.selectMode && (
        <SelectionToolbar
          count={longPress.selectedCount}
          total={filteredPhotos.length}
          itemLabel="photo"
          deleting={bulkDeleting}
          onSelectAll={() => longPress.selectAll(filteredPhotos.map((p) => p.id))}
          onClearSelection={longPress.clearSelection}
          onCancel={longPress.exitSelectMode}
          onDelete={handleBulkDelete}
        />
      )}

      {lightboxPhoto && createPortal(
        <div className="pb-lightbox" onClick={() => setLightboxId(null)}>
          <div className="pb-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <div className="pb-lightbox-top">
              <div className="pb-lightbox-meta">
                <strong>{lightboxPhoto.caption || "Untitled capture"}</strong>
                <span>
                  {new Date(lightboxPhoto.time).toLocaleString()} · {lightboxPhoto.filter}
                </span>
              </div>
              <div className="pb-lightbox-actions">
                <Button size="small" icon={<Pencil size={13} />} onClick={() => handleEditPhoto(lightboxPhoto)}>
                  Edit
                </Button>
                <Button
                  size="small"
                  icon={<Download size={13} />}
                  disabled={!lightboxPhoto.url}
                  onClick={() => handleDownloadGalleryItem(lightboxPhoto)}
                >
                  Download
                </Button>
                <Button size="small" danger icon={<Trash2 size={13} />} onClick={() => handleDeletePhoto(lightboxPhoto)}>
                  Delete
                </Button>
                <Button size="small" icon={<X size={14} />} onClick={() => setLightboxId(null)} />
              </div>
            </div>

            <div className="pb-lightbox-stage">
              {lightboxIndex > 0 && (
                <button
                  type="button"
                  className="pb-lightbox-nav pb-lightbox-prev"
                  onClick={() => setLightboxId(filteredPhotos[lightboxIndex - 1].id)}
                  aria-label="Previous photo"
                >
                  <ChevronLeft size={22} />
                </button>
              )}

              {lightboxPhoto.url ? (
                <img
                  src={lightboxPhoto.url}
                  alt={lightboxPhoto.caption || "Photo preview"}
                  referrerPolicy="no-referrer"
                  className="pb-lightbox-img"
                />
              ) : (
                <div className="pb-gallery-broken pb-lightbox-broken">
                  <Camera size={34} />
                  <span>Image unavailable</span>
                </div>
              )}

              {lightboxIndex < filteredPhotos.length - 1 && (
                <button
                  type="button"
                  className="pb-lightbox-nav pb-lightbox-next"
                  onClick={() => setLightboxId(filteredPhotos[lightboxIndex + 1].id)}
                  aria-label="Next photo"
                >
                  <ChevronRight size={22} />
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}