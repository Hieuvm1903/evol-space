import React, { useEffect, useState } from "react";
import { Modal, Skeleton, Empty } from "antd";
import { ExternalLink, Music2 } from "lucide-react";
import { fetchPlaylistVideos, PlaylistVideo } from "../../lib/youtube";

interface Props {
  open: boolean;
  onClose: () => void;
  playlistUrl: string;
  title?: string;
}

export default function PlaylistDetailModal({ open, onClose, playlistUrl, title }: Props) {
  const [videos, setVideos] = useState<PlaylistVideo[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) { setVideos(null); return; }
    let cancelled = false;
    setLoading(true);
    fetchPlaylistVideos(playlistUrl)
      .then((v) => { if (!cancelled) { setVideos(v); setLoading(false); } })
      .catch(() => { if (!cancelled) { setVideos([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [open, playlistUrl]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
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
          <div className="evol-card-meta" style={{ marginBottom: 8 }}>
            {videos.length} track{videos.length === 1 ? "" : "s"}
          </div>
          <div className="playlist-detail-list">
            {videos.map((v, i) => (
              <div className="playlist-detail-row" key={v.video_id + i}>
                {v.thumbnail_url ? (
                  <img src={v.thumbnail_url} alt="" />
                ) : (
                  <div className="playlist-detail-thumb-empty"><Music2 size={12} /></div>
                )}
                <span className="playlist-detail-track-title">{v.title || "Untitled track"}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}