import React, { useEffect, useRef, useState } from "react";
import { Button, Input, InputNumber, Skeleton, Empty, message, Tooltip } from "antd";
import { Search, ListMusic, Plus, ExternalLink } from "lucide-react";
import * as musicService from "../../lib/musicService";
import { searchPlaylists, SearchPlaylistResult } from "../../lib/youtube";
import { openImportNotification } from "./useImportNotification";
import PlaylistDetailModal from "./PlaylistDetailModal";

const MAX_RESULTS_CAP = 30;

export default function AddByPlaylistImport({ playlistId, addedBy, onAdded }: { playlistId: number; addedBy: string; onAdded: () => void }) {
  const [query, setQuery] = useState("");
  const [maxResults, setMaxResults] = useState(8);
  const [results, setResults] = useState<SearchPlaylistResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [searchMsg, setSearchMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [activeDetail, setActiveDetail] = useState<SearchPlaylistResult | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    const r = await searchPlaylists(query.trim(), maxResults);
    setResults(r);
    setSearched(true);
    setSearching(false);
  }

  async function handleAddFromSearch(pr: SearchPlaylistResult) {
    setAddingId(pr.playlist_id);
    setSearchMsg(null);
    const notice = openImportNotification(`"${pr.title}"`);
    const result = await musicService.addPlaylistFromYoutube(
      playlistId, `https://www.youtube.com/playlist?list=${pr.playlist_id}`, addedBy,
      (done, total, item) => {
        notice.tick(done, total, item);
        if (item.wasAdded) onAdded();
      },
    );
    notice.finish(result.message);
    if (mountedRef.current) { setAddingId(null); setSearchMsg({ text: result.message, ok: result.ok }); }
    if (result.ok) message.success(result.message);
  }

  return (
    <div>
      <p className="evol-card-meta">Search for a playlist to add every track at once.</p>

      <div className="detail-row">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="playlist name..."
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
          results.map((pr, i) => (
            <div className="search-result-row stagger-item" style={{ animationDelay: `${i * 30}ms` }} key={pr.playlist_id}>
              {pr.thumbnail_url
                ? <img src={pr.thumbnail_url} alt="" />
                : <div className="search-result-thumb-empty"><ListMusic size={14} /></div>}
              <div className="search-result-info">
                <div className="search-result-title">{pr.title}</div>
                <div className="evol-card-meta">{pr.author}{pr.item_count ? ` · ${pr.item_count} tracks` : ""}</div>
              </div>
              <Tooltip title="View details">
                <button className="search-result-icon-btn" onClick={() => setActiveDetail(pr)}>
                  <ListMusic size={13} />
                </button>
              </Tooltip>
              
               <a href={`https://www.youtube.com/playlist?list=${pr.playlist_id}`} target="_blank" rel="noreferrer"
                className="search-result-icon-btn" title="Open in new tab"
              >
                <ExternalLink size={13} />
              </a>
              <button
                className="search-result-add"
                onClick={() => handleAddFromSearch(pr)}
                disabled={addingId === pr.playlist_id}
                title="Import this playlist"
              >
                {addingId === pr.playlist_id ? <span className="mini-spinner" /> : <Plus size={14} />}
              </button>
            </div>
          ))
        )}
        {searched && !searching && results.length === 0 && (
          <Empty className="fade-in" image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No importable playlists found for "${query.trim()}".`} />
        )}
      </div>
      {searchMsg && <p className={searchMsg.ok ? "success" : "error"}>{searchMsg.text}</p>}

      {activeDetail && (
        <PlaylistDetailModal
          open={!!activeDetail}
          onClose={() => setActiveDetail(null)}
          playlistUrl={`https://www.youtube.com/playlist?list=${activeDetail.playlist_id}`}
          title={activeDetail.title}
        />
      )}
    </div>
  );
}