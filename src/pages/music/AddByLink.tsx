import React, { useState } from "react";
import { Button, Input, message } from "antd";
import { Link2 } from "lucide-react";
import * as musicService from "../../lib/musicService";
import { extractPlaylistId } from "../../lib/youtube";

export default function AddByLink({ playlistId, addedBy, onAdded }: { playlistId: number; addedBy: string; onAdded: () => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function handleSubmit() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    // A `list=` id in the URL means it's a playlist link — pull in every
    // track from it. Otherwise treat it as a single video link.
    const result = extractPlaylistId(trimmed)
      ? await musicService.addPlaylistFromYoutube(playlistId, trimmed, addedBy)
      : await musicService.addTrackAndAttach(playlistId, trimmed, addedBy);
    setBusy(false);
    setMsg({ text: result.message, ok: result.ok });
    if (result.ok) { message.success(result.message); setUrl(""); onAdded(); }
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
        />
        <Button className="btn-glow" loading={busy} disabled={!url.trim()} onClick={handleSubmit}>Add</Button>
      </div>
      {msg && <p className={msg.ok ? "success" : "error"}>{msg.text}</p>}
    </div>
  );
}