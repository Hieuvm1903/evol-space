import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Dropdown, Empty, Input, Skeleton, Tooltip } from "antd";
import {
  Sparkles, Play, Shuffle, Repeat, Download, LogIn, Music2, Search, ArrowUpDown, Check,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { usePlayer } from "../features/player/PlayerProvider";
import { usePlayerStore } from "../features/player/store";
import type { Track } from "../features/player/types";
import { fetchSharedPlaylist, importSharedPlaylist, type SharedPlaylist } from "../lib/shareService";
import { notify } from "../lib/notify";
import "./music/MusicPage.css";

type SortMode = "default" | "name-asc" | "name-desc" | "artist-asc" | "artist-desc";
const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: "default", label: "Playlist order" },
  { key: "name-asc", label: "Name A–Z" },
  { key: "name-desc", label: "Name Z–A" },
  { key: "artist-asc", label: "Artist A–Z" },
  { key: "artist-desc", label: "Artist Z–A" },
];

// Shared playlists have no row id in the viewer's account. A stable negative
// number derived from the token lets the player store recognise "this shared
// album is playing" without colliding with real (positive) playlist ids.
function sharedPlaylistId(token: string): number {
  let h = 0;
  for (let i = 0; i < token.length; i++) h = (h * 31 + token.charCodeAt(i)) | 0;
  return -(Math.abs(h) + 1);
}

export function SharedAlbumPage() {
  const { token } = useParams<{ token: string }>();
  const { user } = useAuth();
  const player = usePlayer();
  const navigate = useNavigate();

  const [data, setData] = useState<SharedPlaylist | null | undefined>(undefined); // undefined = loading
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("default");

  const currentVideoId = usePlayerStore((s) => s.queue[s.currentIdx]?.video_id ?? null);

  useEffect(() => {
    if (!token) return;
    fetchSharedPlaylist(token).then(setData).catch(() => setData(null));
  }, [token]);

  const queue: Track[] = useMemo(
    () => (data?.tracks ?? []).map((t) => ({
      title: t.title, artist: t.artist, video_id: t.video_id, thumbnail_url: t.thumbnail_url ?? undefined,
    })),
    [data],
  );

  const filteredTracks = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? queue.filter((t) => t.title.toLowerCase().includes(q) || (t.artist ?? "").toLowerCase().includes(q))
      : queue;
    const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });
    switch (sortMode) {
      case "name-asc": return [...base].sort((a, b) => cmp(a.title, b.title));
      case "name-desc": return [...base].sort((a, b) => cmp(b.title, a.title));
      case "artist-asc": return [...base].sort((a, b) => cmp(a.artist ?? "", b.artist ?? ""));
      case "artist-desc": return [...base].sort((a, b) => cmp(b.artist ?? "", a.artist ?? ""));
      default: return base;
    }
  }, [queue, search, sortMode]);

  const playId = token ? sharedPlaylistId(token) : 0;
  const isThisPlaylist = player.playingPlaylistId === playId;
  const isPlaying = isThisPlaylist && player.isPlaying;
  const currentMode = isThisPlaylist ? player.currentMode : null;

  function playMode(modeLabel: string) {
    if (!queue.length) return;
    player.playPlaylistMode(playId, queue, modeLabel);
  }

  function playFromTrack(videoId: string) {
    const idx = queue.findIndex((t) => t.video_id === videoId);
    if (idx === -1) return;
    player.loadQueue(queue.slice(idx), "Normal", playId);
  }

  async function handleImport() {
    if (!token) return;
    setImporting(true);
    try {
      await importSharedPlaylist(token);
      notify.added(`"${data?.name}" saved to your albums.`);
      navigate("/music");
    } catch {
      notify.error("Couldn't save this album", "The link may have been turned off.");
    } finally { setImporting(false); }
  }

  if (data === undefined) return <div className="page"><Skeleton active paragraph={{ rows: 6 }} /></div>;
  if (data === null) {
    return (
      <div className="page">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="This album link is invalid or sharing was turned off." />
      </div>
    );
  }

  return (
    <div className="page music-page-shell">
      <div className="music-shell-header fade-in-up">
        <h2 className="music-title"><Sparkles size={20} className="music-title-icon" /> Shared album</h2>
        <p className="music-subtitle">
          {data.owner ? `Shared by ${data.owner}` : "Shared with you"} — play it here, or save a copy to your own albums.
        </p>
      </div>

      <div className="music-workspace" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
        <div className="music-pane music-pane-right">
          <div className="playlist-pane-body fade-in-up">
            {/* header: same 3 transport buttons as the Music page */}
            <div className="playlist-header-row">
              <div className="transport-row transport-row-inline">
                <Tooltip title="Play">
                  <button
                    className={`transport-glow-btn${isPlaying && currentMode === "normal" ? " transport-glow-btn-active" : ""}`}
                    onClick={() => playMode("Normal")}
                  ><Play size={16} /></button>
                </Tooltip>
                <Tooltip title="Shuffle">
                  <button
                    className={`transport-glow-btn${isPlaying && currentMode === "shuffle" ? " transport-glow-btn-active" : ""}`}
                    onClick={() => playMode("Shuffle")}
                  ><Shuffle size={16} /></button>
                </Tooltip>
                <Tooltip title="Repeat all">
                  <button
                    className={`transport-glow-btn${isPlaying && currentMode === "repeatAll" ? " transport-glow-btn-active" : ""}`}
                    onClick={() => playMode("Repeat All")}
                  ><Repeat size={16} /></button>
                </Tooltip>
              </div>

              <Input className="playlist-name-input" value={data.name} readOnly />

              {user ? (
                <Tooltip title="Save a copy to my albums">
                  <Button className="btn-glow" icon={<Download size={14} />} loading={importing} onClick={handleImport}>
                    Save
                  </Button>
                </Tooltip>
              ) : (
                <Link to="/login">
                  <Button icon={<LogIn size={14} />}>Log in to save</Button>
                </Link>
              )}
            </div>

            <div className="playlist-toolbar-row">
              <Input
                className="music-track-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tracks..."
                prefix={<Search size={14} color="var(--evol-muted)" />}
                allowClear
              />
              <Dropdown
                trigger={["click"]}
                menu={{
                  items: SORT_OPTIONS.map((opt) => ({
                    key: opt.key,
                    label: opt.label,
                    icon: sortMode === opt.key ? <Check size={13} /> : undefined,
                  })),
                  selectedKeys: [sortMode],
                  onClick: ({ key }) => setSortMode(key as SortMode),
                }}
              >
                <Tooltip title="Sort">
                  <Button
                    className={`glow-icon-btn${sortMode !== "default" ? " glow-icon-btn-active" : ""}`}
                    icon={<ArrowUpDown size={15} />}
                  />
                </Tooltip>
              </Dropdown>
            </div>

            <div className="playlist-track-count">
              {queue.length} track{queue.length === 1 ? "" : "s"}
            </div>

            <div className="playlist-track-list">
              {filteredTracks.length === 0 ? (
                <Empty
                  className="fade-in"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={queue.length === 0 ? "This album is empty." : "No tracks match your search."}
                />
              ) : (
                filteredTracks.map((t, i) => {
                  const isCurrent = isThisPlaylist && currentVideoId === t.video_id;
                  const rowPlaying = isCurrent && player.isPlaying;
                  return (
                    <div className="track-row-wrap stagger-item" key={t.video_id + i}
                      style={{ animationDelay: `${Math.min(i, 14) * 25}ms` }}>
                      <div className={`track-row${isCurrent ? " track-row-playing" : ""}`}>
                        <button className="track-row-play" title="Play from here"
                          onClick={() => playFromTrack(t.video_id)}>
                          {rowPlaying
                            ? <span className="track-eq"><span /><span /><span /></span>
                            : <Play size={13} />}
                        </button>
                        {t.thumbnail_url
                          ? <img className="track-row-thumb" src={t.thumbnail_url} alt="" />
                          : <div className="track-row-thumb track-row-thumb-empty"><Music2 size={14} /></div>}
                        <div className="track-row-info" onClick={() => playFromTrack(t.video_id)}>
                          <div className="track-row-title">{t.title}</div>
                          {t.artist && <div className="track-row-artist">{t.artist}</div>}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}