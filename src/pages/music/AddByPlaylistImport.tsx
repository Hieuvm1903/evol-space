import React, { useState } from "react";
import { Button, Input, Skeleton, Empty, message } from "antd";
import { Search, ListMusic, Plus } from "lucide-react";
import * as musicService from "../../lib/musicService";
import { searchPlaylists, SearchPlaylistResult } from "../../lib/youtube";

export default function AddByPlaylistImport({ playlistId, addedBy, onAdded }: { playlistId: number; addedBy: string; onAdded: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchPlaylistResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [searchMsg, setSearchMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    const r = await searchPlaylists(query.trim());
    setResults(r);
    setSearched(true);
    setSearching(false);
  }

  async function handleAddFromSearch(pr: SearchPlaylistResult) {
    setAddingId(pr.playlist_id);
    setSearchMsg(null);
    const result = await musicService.addPlaylistFromYoutube(playlistId, `https://www.youtube.com/playlist?list=${pr.playlist_id}`, addedBy);
    setAddingId(null);
    setSearchMsg({ text: result.message, ok: result.ok });
    if (result.ok) { message.success(result.message); onAdded(); }
  }

  return (
    <div>
      {/* Pasting a playlist link directly now lives in the "Paste link" tab,
          which auto-detects whether the link is a single video or a
          playlist — no need for a separate link box here. */}
      <p className="evol-card-meta">Search for a playlist to add every track at once.</p>

      <div className="detail-row">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="playlist name..."
          onPressEnter={handleSearch}
          prefix={<Search size={13} color="var(--evol-muted)" />}
        />
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
    </div>
  );
}