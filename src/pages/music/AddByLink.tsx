import React, { useEffect, useRef, useState } from "react";
import { Button, Input, message } from "antd";
import { Link2, Play, ExternalLink, ListMusic } from "lucide-react";
import * as musicService from "../../lib/musicService";
import { extractPlaylistId, extractVideoId, normalizeUrl, fetchMetadata, VideoMeta } from "../../lib/youtube";
import { openImportNotification } from "./useImportNotification";
import VideoPreviewModal from "../../components/VideoPreviewModal";
import PlaylistDetailModal from "./PlaylistDetailModal";

export default function AddByLink({ playlistId, addedBy, onAdded }: { playlistId: number; addedBy: string; onAdded: () => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [preview, setPreview] = useState<VideoMeta | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [modalAdding, setModalAdding] = useState(false);
  const [modalAdded, setModalAdded] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const trimmed = url.trim();
  const isPlaylistLink = !!extractPlaylistId(trimmed);
  const videoId = !isPlaylistLink ? extractVideoId(trimmed) : null;

  useEffect(() => {
    setPreview(null);
    setModalAdded(false);
    if (!videoId) return;
    let cancelled = false;
    setPreviewLoading(true);
    const t = setTimeout(async () => {
      const normalized = normalizeUrl(trimmed);
      if (!normalized) { if (!cancelled) setPreviewLoading(false); return; }
      const meta = await fetchMetadata(normalized);
      if (cancelled) return;
      setPreview(meta);
      setPreviewLoading(false);
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, trimmed]);

  async function handleSubmit() {
    if (!trimmed) return;
    setBusy(true);
    setMsg(null);

    if (isPlaylistLink) {
      const notice = openImportNotification("playlist");
      const result = await musicService.addPlaylistFromYoutube(playlistId, trimmed, addedBy, (done, total, item) => {
        notice.tick(done, total, item);
        if (item.wasAdded) onAdded();
      });
      notice.finish(result.message);
      if (mountedRef.current) { setBusy(false); setMsg({ text: result.message, ok: result.ok }); }
      if (result.ok) { message.success(result.message); if (mountedRef.current) setUrl(""); }
    } else {
      const result = await musicService.addTrackAndAttach(playlistId, trimmed, addedBy);
      if (mountedRef.current) { setBusy(false); setMsg({ text: result.message, ok: result.ok }); }
      if (result.ok) { message.success(result.message); if (mountedRef.current) setUrl(""); onAdded(); }
    }
  }

  async function handleAddFromVideoModal() {
    if (!trimmed) return;
    setModalAdding(true);
    const result = await musicService.addTrackAndAttach(playlistId, trimmed, addedBy, preview ? { title: preview.title, thumbnail_url: preview.thumbnail_url, artist: preview.author } : undefined);
    setModalAdding(false);
    if (result.ok) { message.success(result.message); setModalAdded(true); onAdded(); }
    else message.error(result.message);
  }

  return (
    <div>
      <p className="evol-card-meta">Paste a single video link, or a playlist link to add every track at once.</p>
      <div className="detail-row">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a YouTube video or playlist link..."
          onPressEnter={handleSubmit}
          prefix={<Link2 size={13} color="var(--evol-muted)" />}
          allowClear = {true}
        />
        <Button className="btn-glow" loading={busy} disabled={!trimmed} onClick={handleSubmit}>Add</Button>
      </div>

      {videoId && (previewLoading || preview) && (
        <div className="link-preview-card fade-in-up">
          {previewLoading ? (
            <div className="link-preview-thumb-empty"><span className="mini-spinner" /></div>
          ) : preview?.thumbnail_url ? (
            <img src={preview.thumbnail_url} alt="" className="link-preview-thumb" />
          ) : (
            <div className="link-preview-thumb-empty"><Play size={14} /></div>
          )}
          <div className="link-preview-info">
            <div className="link-preview-title">{previewLoading ? "Loading preview…" : preview?.title || "Untitled"}</div>
            {preview?.author && <div className="evol-card-meta">{preview.author}</div>}
          </div>
          <div className="link-preview-actions">
            <Button size="small" icon={<Play size={12} />} disabled={previewLoading} onClick={() => setShowVideoModal(true)}>
              Preview
            </Button>
            <a href={normalizeUrl(trimmed) ?? "#"} target="_blank" rel="noreferrer" className="link-preview-newtab" title="Open in new tab">
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
      )}

      {isPlaylistLink && (
        <div className="link-preview-card fade-in-up">
          <div className="link-preview-thumb-empty"><ListMusic size={16} /></div>
          <div className="link-preview-info">
            <div className="link-preview-title">Playlist link detected</div>
            <div className="evol-card-meta">View every track before importing.</div>
          </div>
          <div className="link-preview-actions">
            <Button size="small" onClick={() => setShowPlaylistModal(true)}>View details</Button>
            <a href={trimmed} target="_blank" rel="noreferrer" className="link-preview-newtab" title="Open in new tab">
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
      )}

      {msg && <p className={msg.ok ? "success" : "error"}>{msg.text}</p>}

      {videoId && (
        <VideoPreviewModal
          open={showVideoModal}
          onClose={() => setShowVideoModal(false)}
          videoId={videoId}
          title={preview?.title}
          onAdd={handleAddFromVideoModal}
          adding={modalAdding}
          added={modalAdded}
        />
      )}
      {isPlaylistLink && (
        <PlaylistDetailModal
          open={showPlaylistModal}
          onClose={() => setShowPlaylistModal(false)}
          playlistUrl={trimmed}
          title="Playlist preview"
          playlistId={playlistId}
          addedBy={addedBy}
          onAdded={onAdded}
        />
      )}
    </div>
  );
}