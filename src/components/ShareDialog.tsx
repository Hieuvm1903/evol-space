import React, { useState } from "react";
import { Modal, Input, Button, Switch } from "antd";
import { Copy, Share2, Link2 } from "lucide-react";
import { shareUrl, type ShareKind } from "../lib/shareService";
import { notify } from "../lib/notify";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  kind: ShareKind;
  token: string | null | undefined;
  onEnable: () => Promise<void>;
  onDisable: () => Promise<void>;
}

export default function ShareDialog({ open, onClose, title, kind, token, onEnable, onDisable }: Props) {
  const [busy, setBusy] = useState(false);
  const url = token ? shareUrl(kind, token) : null;

  async function toggle(on: boolean) {
    setBusy(true);
    try { on ? await onEnable() : await onDisable(); }
    catch { notify.error("Couldn't update sharing", "Please try again."); }
    finally { setBusy(false); }
  }

  async function copy() {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); notify.success("Link copied"); }
    catch { notify.error("Couldn't copy", "Select the link and copy it manually."); }
  }

  return (
    <Modal open={open} onCancel={onClose} footer={null} centered width={440}
      title={<span style={{ display: "flex", alignItems: "center", gap: 8 }}><Share2 size={16} /> Share "{title}"</span>}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "8px 0 14px" }}>
        <span>Anyone with the link can view</span>
        <Switch checked={!!token} loading={busy} onChange={toggle} />
      </div>

      {url ? (
        <>
          <div className="detail-row">
            <Input value={url} readOnly prefix={<Link2 size={13} />} onFocus={(e) => e.target.select()} />
            <Button className="btn-glow" icon={<Copy size={14} />} onClick={copy}>Copy</Button>
          </div>
          {typeof navigator.share === "function" && (
            <Button block icon={<Share2 size={14} />} onClick={() => navigator.share({ title, url }).catch(() => {})}>
              Share via…
            </Button>
          )}
          <p className="evol-card-meta" style={{ marginTop: 10 }}>
            Viewers can see the {kind === "album" ? "tracks" : "places"} and save their own copy.
            Turn sharing off to invalidate this link.
          </p>
        </>
      ) : (
        <p className="evol-card-meta">Sharing is off. Switch it on to create a link.</p>
      )}
    </Modal>
  );
}