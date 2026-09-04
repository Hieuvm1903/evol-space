import React from "react";
import { Popconfirm } from "antd";
import { Play, Music2, Pencil, Trash2 } from "lucide-react";
import * as musicService from "../../lib/musicService";
import TrackManagePanel from "./TrackManagePanel";
import type { LongPressSelect } from "../../hooks/useLongPressSelect";
import LongPressRing from "../../components/LongPressRing";
import SelectCheckbox from "../../components/SelectCheckBox";

export default function TrackRow({
  index, track, playlistId, expanded, playing, onToggleExpand, onPlay, onRemove, onChanged, longPress,
}: {
  index: number;
  track: musicService.PlaylistTrack;
  playlistId: number;
  expanded: boolean;
  playing: boolean;
  onToggleExpand: () => void;
  onPlay: () => void;
  onRemove: () => void;
  onChanged: () => void;
  /** Hold-1.5s-to-select template — see hooks/useLongPressSelect.ts */
  longPress: LongPressSelect<number>;
}) {
  const id = track.id!;
  const checked = longPress.isSelected(id);
  const pressing = longPress.isPressing(id);
  const lp = longPress.bind(id);

  return (
    <div className="track-row-wrap stagger-item" style={{ animationDelay: `${Math.min(index, 14) * 25}ms` }}>
      <div
        className={`track-row${expanded ? " track-row-expanded" : ""}${playing ? " track-row-playing" : ""}${checked ? " track-row-checked" : ""}${pressing ? " pressing" : ""}`}
        {...lp}
        onClick={(e) => {
          lp.onClick(e);
          if (!longPress.selectMode && !e.defaultPrevented) onToggleExpand();
        }}
      >
        {longPress.selectMode ? (
          <SelectCheckbox checked={checked} />
        ) : pressing ? (
          <LongPressRing />
        ) : null}

        <button className="track-row-play" onClick={(e) => { e.stopPropagation(); onPlay(); }} title="Play from here">
          {playing ? <span className="track-eq"><span /><span /><span /></span> : <Play size={13} />}
        </button>

        {track.thumbnail_url ? (
          <img className="track-row-thumb" src={track.thumbnail_url} alt="" />
        ) : (
          <div className="track-row-thumb track-row-thumb-empty"><Music2 size={14} /></div>
        )}

        <div className="track-row-info">
          <div className="track-row-title">{track.title}</div>
          {track.artist && <div className="track-row-artist">{track.artist}</div>}
        </div>

        {!longPress.selectMode && (
          <>
            <button className="track-row-manage" onClick={(e) => { e.stopPropagation(); onToggleExpand(); }} title="Manage">
              <Pencil size={13} />
            </button>

            <Popconfirm
              title="Remove from playlist?"
              okText="Remove"
              cancelText="Cancel"
              okButtonProps={{ danger: true }}
              onConfirm={(e) => { e?.stopPropagation?.(); onRemove(); }}
            >
              <button className="track-row-remove" onClick={(e) => e.stopPropagation()} title="Remove">
                <Trash2 size={13} />
              </button>
            </Popconfirm>
          </>
        )}
      </div>

      {expanded && !longPress.selectMode && <TrackManagePanel playlistId={playlistId} track={track} onChanged={onChanged} />}
    </div>
  );
}