import React, { useState } from "react";
import { Button, Input, InputNumber, Skeleton, Tooltip, message } from "antd";
import { Search, Music2, Plus, Play, ExternalLink } from "lucide-react";
import * as musicService from "../../lib/musicService";
import { searchSongs, SearchSongResult } from "../../lib/youtube";
import VideoPreviewModal from "../../components/VideoPreviewModal";

const MAX_RESULTS_CAP = 30;

export default function AddBySearch({ playlistId, addedBy, onAdded }: { playlistId: number; addedBy: string; onAdded: () => void }) {
  const [query, setQuery] = useState("");
  const [maxResults, setMaxResults] = useState(8);
  const [results, setResults] = useState<SearchSongResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [activePreview, setActivePreview] = useState<SearchSongResult | null>(null);

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setResults(await searchSongs(query.trim(), maxResults));
    setSearching(false);
  }

  async function handleAdd(r: SearchSongResult) {
    setAddingId(r.video_id);
    await musicService.addTrackAndAttach(
      playlistId, `https://www.youtube.com/watch?v=${r.video_id}`, addedBy,
      { title: r.title, thumbnail_url: r.thumbnail_url, artist: r.artist },
    );
    setAddingId(null);
    message.success(`Added "${r.title}"`);
    onAdded();
  }

  return (
    <div>
      <div className="detail-row">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="song title or artist..."
          onPressEnter={handleSearch}
          prefix={<Search size={13} color="var(--evol-muted)" />}
        />
        <Tooltip title="Max results">
          <InputNumber size="middle" min={1} max={MAX_RESULTS_CAP} value={maxResults} onChange={(v) => setMaxResults(v ?? 8)} style={{ width: 64 }} />
        </Tooltip>
        <Button className="btn-glow" loading={searching} disabled={!query.trim()} onClick={handleSearch}>Search</Button>
      </div>
      <div className="search-result-list">
        {searching ? (
          <Skeleton active paragraph={{ rows: 2 }} className="fade-in" />
        ) : (
          results.map((r, i) => (
            <div className="search-result-row stagger-item" style={{ animationDelay: `${i * 30}ms` }} key={r.video_id}>
              {r.thumbnail_url
                ? <img src={r.thumbnail_url} alt="" />
                : <div className="search-result-thumb-empty"><Music2 size={14} /></div>}
              <div className="search-result-info">
                <div className="search-result-title">{r.title}</div>
                <div className="evol-card-meta">{r.artist}{r.duration ? ` · ${r.duration}` : ""}</div>
              </div>
              <Tooltip title="Preview">
                <button className="search-result-icon-btn" onClick={() => setActivePreview(r)}>
                  <Play size={13} />
                </button>
              </Tooltip>
              <a
                href={`https://www.youtube.com/watch?v=${r.video_id}`} target="_blank" rel="noreferrer"
                className="search-result-icon-btn" title="Open in new tab">
              
                <ExternalLink size={13} />
              </a>
              <button className="search-result-add" onClick={() => handleAdd(r)} disabled={addingId === r.video_id}>
                {addingId === r.video_id ? <span className="mini-spinner" /> : <Plus size={14} />}
              </button>
            </div>
          ))
        )}
      </div>

      {activePreview && (
        <VideoPreviewModal
          open={!!activePreview}
          onClose={() => setActivePreview(null)}
          videoId={activePreview.video_id}
          title={activePreview.title}
        />
      )}
    </div>
  );
}