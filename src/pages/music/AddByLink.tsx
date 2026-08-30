import React, { useEffect, useRef, useState } from "react";
import { Button, Input, message } from "antd";
import { Link2 } from "lucide-react";
import * as musicService from "../../lib/musicService";
import { extractPlaylistId } from "../../lib/youtube";
import { openImportNotification } from "./useImportNotification";

export default function AddByLink({ playlistId, addedBy, onAdded }: { playlistId: number; addedBy: string; onAdded: () => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // The import loop keeps running even if this panel unmounts (click
  // outside closes it) — guard state updates so we don't warn/crash, but
  // the notification + onAdded() calls below don't need this guard since
  // they're global/owned by the parent, not this component.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  async function handleSubmit() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    setMsg(null);

    if (extractPlaylistId(trimmed)) {
      const notice = openImportNotification("playlist");
      const result = await musicService.addPlaylistFromYoutube(playlistId, trimmed, addedBy, (done, total, item) => {
        notice.tick(done, total, item);
        if (item.wasAdded) onAdded(); // each added track appears in the list right away
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