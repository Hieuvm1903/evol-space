import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, Checkbox, Empty, Tooltip } from "antd";
import { ListPlus, Share2, Pencil, Trash2, Eye, EyeOff, ArrowLeft, Search } from "lucide-react";
import type { Place } from "../../lib/placesService";
import * as listsService from "../../lib/placeListsService";
import type { PlaceList } from "../../lib/placeListsService";
import { newShareToken } from "../../lib/shareService";
import { iconForName, splitIcon } from "../../content/placeIcons";
import ShareDialog from "../../components/ShareDialog";
import { useConfirm } from "../../components/ConfirmDialog";
import { notify } from "../../lib/notify";

interface Props {
  userId: string;
  places: Place[];
  /** Place ids pre-selected from Browse's hold-to-select — opens the editor. */
  draftIds: number[] | null;
  onDraftConsumed: () => void;
  activeIds: number[] | null;
  onViewList: (ids: number[] | null, listId?: number) => void;
  activeListId: number | null;
}

export default function ListsTab({ userId, places, draftIds, onDraftConsumed, onViewList, activeListId }: Props) {
  const confirmDialog = useConfirm();
  const [lists, setLists] = useState<PlaceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"index" | "edit">("index");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [shareId, setShareId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try { setLists(await listsService.getPlaceLists(userId)); }
    catch { notify.error("Couldn't load your lists"); }
    setLoading(false);
  }
  useEffect(() => { load(); }, [userId, places]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (draftIds && draftIds.length) {
      startEdit(null, draftIds);
      onDraftConsumed();
    }
  }, [draftIds]); // eslint-disable-line react-hooks/exhaustive-deps

  function startEdit(list: PlaceList | null, ids: number[] = []) {
    setEditingId(list?.id ?? null);
    setName(list?.name ?? "");
    setDescription(list?.description ?? "");
    setPicked(list ? list.place_ids : ids);
    setQ("");
    setMode("edit");
  }

  function toggle(id: number) {
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function save() {
    setSaving(true);
    try {
      if (editingId === null) await listsService.createPlaceList(userId, name, description, picked);
      else await listsService.updatePlaceList(editingId, name, description, picked);
      notify.updated(`"${name.trim() || "Untitled list"}" saved.`);
      setMode("index");
      await load();
    } catch { notify.error("Couldn't save the list", "Please try again."); }
    setSaving(false);
  }

  async function remove(l: PlaceList) {
    const ok = await confirmDialog({
      title: `Delete "${l.name}"?`,
      description: "Your places stay on the map — only the list (and its share link) is removed.",
      confirmText: "Delete", danger: true,
    });
    if (!ok) return;
    await listsService.deletePlaceList(l.id);
    if (activeListId === l.id) onViewList(null);
    notify.deleted("List removed.");
    load();
  }

  async function setShare(listId: number, token: string | null) {
    await listsService.setListShareToken(listId, token);
    setLists((ls) => ls.map((l) => (l.id === listId ? { ...l, share_token: token } : l)));
  }

  const filteredPlaces = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? places.filter((p) => p.name.toLowerCase().includes(s)) : places;
  }, [places, q]);

  const shareList = lists.find((l) => l.id === shareId) ?? null;

  // ---------------- editor ----------------
  if (mode === "edit") {
    return (
      <div className="map-sidebar-body" style={{ paddingTop: 14 }}>
        <Button type="text" size="small" icon={<ArrowLeft size={13} />} onClick={() => setMode("index")}>Back</Button>

        <div className="map-form-row" style={{ marginTop: 8 }}>
          <span className="map-form-row-label">Name</span>
          <div className="map-form-row-content"><Input value={name} onChange={(e) => setName(e.target.value)} allowClear /></div>
        </div>
        <div className="map-form-row">
          <span className="map-form-row-label">About</span>
          <div className="map-form-row-content">
            <Input.TextArea rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Date-night spots, weekend trip…" />
          </div>
        </div>

        <Input size="small" prefix={<Search size={13} color="#9c97b8" />} value={q}
          onChange={(e) => setQ(e.target.value)} placeholder="Search your places…" allowClear />
        <div className="evol-card-meta" style={{ margin: "8px 0 6px" }}>
          {picked.length} of {places.length} selected
        </div>

        <div className="lists-picker">
          {filteredPlaces.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No places" />}
          {filteredPlaces.map((p) => {
            const { name: iconName, color } = splitIcon(p.icon);
            const Icon = iconForName(iconName);
            const on = picked.includes(p.id);
            return (
              <label key={p.id} className={`map-place-row${on ? " bulk-selected" : ""}`}>
                <Checkbox checked={on} onChange={() => toggle(p.id)} />
                <div className="map-place-swatch" style={{ ["--sw-color" as any]: color }}>
                  <Icon size={15} color="#fff" />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="map-place-name">{p.name}</div>
                </div>
              </label>
            );
          })}
        </div>

        <div className="map-form-actions">
          <Button type="primary" block loading={saving} disabled={picked.length === 0} onClick={save}>
            {editingId === null ? "Create list" : "Save list"}
          </Button>
          <Button block onClick={() => setMode("index")}>Cancel</Button>
        </div>
      </div>
    );
  }

  // ---------------- index ----------------
  return (
    <div className="map-sidebar-body" style={{ paddingTop: 14 }}>
      <Button type="primary" block className="btn-glow" icon={<ListPlus size={14} />}
        onClick={() => startEdit(null)} disabled={places.length === 0}>
        New list from my places
      </Button>
      <p className="evol-card-meta" style={{ margin: "8px 0" }}>
        Tip: hold a place in Browse for 1.5s, select several, then tap “New list”.
      </p>

      {loading ? (
        <p className="placeholder-note">Loading…</p>
      ) : lists.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<span style={{ color: "#9c97b8" }}>No lists yet.</span>} />
      ) : (
        lists.map((l) => {
          const viewing = activeListId === l.id;
          return (
            <div key={l.id} className={`map-place-row lists-row${viewing ? " active" : ""}`}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="map-place-name">{l.name}</div>
                <div className="map-place-desc">
                  {l.place_ids.length} place{l.place_ids.length === 1 ? "" : "s"}
                  {l.share_token ? " · shared" : ""}
                </div>
              </div>
              <div className="map-place-row-actions">
                <Tooltip title={viewing ? "Show all places" : "Show only this list on the map"}>
                  <Button size="small" icon={viewing ? <EyeOff size={13} /> : <Eye size={13} />}
                    onClick={() => onViewList(viewing ? null : l.place_ids, l.id)} />
                </Tooltip>
                <Tooltip title="Share"><Button size="small" icon={<Share2 size={13} />} onClick={() => setShareId(l.id)} /></Tooltip>
                <Tooltip title="Edit"><Button size="small" icon={<Pencil size={13} />} onClick={() => startEdit(l)} /></Tooltip>
                <Tooltip title="Delete"><Button size="small" danger icon={<Trash2 size={13} />} onClick={() => remove(l)} /></Tooltip>
              </div>
            </div>
          );
        })
      )}

      {shareList && (
        <ShareDialog
          open
          onClose={() => setShareId(null)}
          title={shareList.name}
          kind="places"
          token={shareList.share_token}
          onEnable={() => setShare(shareList.id, newShareToken())}
          onDisable={() => setShare(shareList.id, null)}
        />
      )}
    </div>
  );
}