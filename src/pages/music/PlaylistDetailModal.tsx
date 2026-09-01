import React, { useEffect, useState } from "react";
import { Modal, Skeleton, Empty, Button, Checkbox } from "antd";
import { ExternalLink, Music2, Download } from "lucide-react";
import { fetchPlaylistVideos, PlaylistVideo } from "../../lib/youtube";
import * as musicService from "../../lib/musicService";
import { openImportNotification } from "./useImportNotification";

interface Props {
  open: boolean;
  onClose: () => void;
  playlistUrl: string;
  title?: string;
  /** When provided, shows an "Add selected to playlist" footer button. */
  playlistId?: number;
  addedBy?: string;
  onAdded?: () => void;
}

export default function PlaylistDetailModal({ open, onClose, playlistUrl, title, playlistId, addedBy, onAdded }: Props) {
  const [videos, setVideos] = useState<PlaylistVideo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  // video_ids currently checked — defaults to "everything", so the old
  // one-click "add the whole playlist" flow still works, it's just now
  // expressed as "all boxes start checked" instead of a separate code path.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) { setVideos(null); setSelected(new Set()); return; }
    let cancelled = false;
    setLoading(true);
    fetchPlaylistVideos(playlistUrl)
      .then((v) => {
        if (cancelled) return;
        setVideos(v);
        setSelected(new Set(v.map((x) => x.video_id)));
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setVideos([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [open, playlistUrl]);

  function toggleOne(videoId: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  }

  function toggleAll() {
    if (!videos) return;
    setSelected((cur) => (cur.size === videos.length ? new Set() : new Set(videos.map((v) => v.video_id))));
  }

  async function handleAddSelected() {
    if (playlistId === undefined || addedBy === undefined || !videos) return;
    const chosen = videos.filter((v) => selected.has(v.video_id));
    if (chosen.length === 0) return;

    setImporting(true);
    const notice = openImportNotification(title ? `"${title}"` : "playlist");
    let added = 0;

    // Same sequential add + per-item progress reporting as the bulk
    // import path (musicService.addPlaylistFromYoutube), just scoped to
    // the subset the person actually checked instead of the whole list.
    for (let i = 0; i < chosen.length; i++) {
      const v = chosen[i];
      const videoUrl = `https://www.youtube.com/watch?v=${v.video_id}`;
      let ok = false;
      let wasAdded = false;
      try {
        const result = await musicService.addTrackAndAttach(
          playlistId, videoUrl, addedBy,
          v.title ? { title: v.title, thumbnail_url: v.thumbnail_url } : undefined,
        );
        ok = result.ok;
        wasAdded = result.wasAdded ?? false;
        if (wasAdded) { added++; onAdded?.(); }
      } catch {
        ok = false;
      }
      notice.tick(i + 1, chosen.length, {
        title: v.title || "Untitled track",
        thumbnail_url: v.thumbnail_url,
        ok,
        wasAdded,
      });
    }

    notice.finish(
      added > 0
        ? `Added ${added} track(s) from the YouTube playlist.`
        : "Every selected track is already in this playlist."
    );
    setImporting(false);
    onClose();
  }

  const canImport = playlistId !== undefined && addedBy !== undefined;
  const allSelected = !!videos && videos.length > 0 && selected.size === videos.length;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={
        canImport ? (
          <Button
            type="primary"
            className="btn-glow"
            icon={<Download size={14} />}
            loading={importing}
            disabled={loading || !videos || videos.length === 0 || selected.size === 0}
            onClick={handleAddSelected}
          >
            {selected.size > 0 ? `Add ${selected.size} selected` : "Add selected"}
          </Button>
        ) : null
      }
      destroyOnClose
      centered
      width={480}
      title={
        <span className="playlist-modal-title">
          {title || "Playlist"}
          <a href={playlistUrl} target="_blank" rel="noreferrer" title="Open in new tab">
            <ExternalLink size={14} />
          </a>
        </span>
      }
      className="playlist-detail-modal"
    >
      {loading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : !videos || videos.length === 0 ? (
        <Empty description={<span style={{ color: "#9c97b8" }}>No tracks found.</span>} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <>
          {canImport && (
            <div className="playlist-detail-toolbar">
              <label className="playlist-detail-select-all">
                <Checkbox
                  checked={allSelected}
                  indeterminate={selected.size > 0 && !allSelected}
                  onChange={toggleAll}
                />
                Select all
              </label>
              <span className="evol-card-meta">{selected.size} of {videos.length} selected</span>
            </div>
          )}
          <div className="playlist-detail-list">
            {videos.map((v, i) => {
              const checked = selected.has(v.video_id);
              return (
                <div
                  className={`playlist-detail-row${canImport ? " playlist-detail-row-selectable" : ""}${checked && canImport ? " playlist-detail-row-checked" : ""}`}
                  key={v.video_id + i}
                  onClick={canImport ? () => toggleOne(v.video_id) : undefined}
                >
                  {canImport && (
                    <Checkbox
                      checked={checked}
                      onChange={() => toggleOne(v.video_id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  {v.thumbnail_url ? (
                    <img src={v.thumbnail_url} alt="" />
                  ) : (
                    <div className="playlist-detail-thumb-empty"><Music2 size={12} /></div>
                  )}
                  <span className="playlist-detail-track-title">{v.title || "Untitled track"}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Modal>
  );
}