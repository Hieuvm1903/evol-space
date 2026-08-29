import { create } from "zustand";
import type { Track, Mode, View } from "./types";
import { MODE_MAP, EXPANDED_KEY } from "./constants";
import { shuffleArray, shuffleQueue, pickNextTrackIdx, pickPrevTrackIdx } from "./utils/queueOrder";

function readExpanded(): boolean {
  try { return localStorage.getItem(EXPANDED_KEY) === "1"; } catch { return false; }
}

interface PlayerStore {
  queue: Track[];
  order: number[];
  currentIdx: number;
  mode: Mode;
  playing: boolean;
  curTime: number;
  duration: number;
  volume: number;
  view: View;
  expanded: boolean;
  showUnmute: boolean;
  playingPlaylistId: number | null;

  loadQueue: (tracks: Track[], modeLabel: string, playlistId?: number) => void;
  setPlaylistMode: (modeLabel: string) => void;
  setMode: (m: Mode) => void;
  setOrder: (order: number[]) => void;
  reshuffle: () => void;
  playIdx: (idx: number) => void;
  advance: (step: number) => void;
  setPlaying: (p: boolean) => void;
  setProgress: (curTime: number, duration: number) => void;
  setVolume: (v: number) => void;
  setView: (v: View) => void;
  setExpanded: (e: boolean) => void;
  setShowUnmute: (b: boolean) => void;
  close: () => void;
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  queue: [],
  order: [],
  currentIdx: 0,
  mode: "normal",
  playing: false,
  curTime: 0,
  duration: 0,
  volume: 100,
  view: "video",
  expanded: readExpanded(),
  showUnmute: false,
  playingPlaylistId: null,

  loadQueue: (tracks, modeLabel, playlistId) => {
    const mapped = MODE_MAP[modeLabel] || "normal";
    const isShuffle = mapped === "shuffle";
    const finalTracks = isShuffle ? shuffleArray(tracks) : tracks;
    const order = isShuffle ? shuffleQueue(finalTracks.length) : finalTracks.map((_, i) => i);
    set({
      queue: finalTracks,
      order,
      currentIdx: 0,
      mode: isShuffle ? "repeatAll" : mapped,
      playingPlaylistId: playlistId ?? null,
      curTime: 0,
      duration: 0,
      showUnmute: false,
    });
  },

  // Used when the same playlist is already loaded and the user just
  // clicked a different Play/Shuffle/Repeat button — switches mode live
  // without restarting the current track.
  setPlaylistMode: (modeLabel) => {
    const mapped = MODE_MAP[modeLabel] || "normal";
    if (mapped === "shuffle") {
      set({ order: shuffleQueue(get().queue.length), mode: "repeatAll" });
    } else {
      set({ mode: mapped });
    }
  },

  setMode: (m) => {
    if (m === "shuffle") {
      set({ order: shuffleQueue(get().queue.length), mode: "repeatAll" });
    } else {
      set({ mode: m });
    }
  },

  setOrder: (order) => set({ order }),
  reshuffle: () => set({ order: shuffleQueue(get().queue.length) }),

  playIdx: (idx) => {
    if (!get().queue[idx]) return;
    set({ currentIdx: idx, curTime: 0 });
  },

  advance: (step) => {
    const { order, mode, currentIdx } = get();
    if (!order.length) return;
    const next = step > 0
      ? pickNextTrackIdx(order, mode, currentIdx)
      : pickPrevTrackIdx(order, mode, currentIdx);
    if (next === null) { set({ playing: false }); return; }
    get().playIdx(next);
  },

  setPlaying: (playing) => set({ playing }),
  setProgress: (curTime, duration) => set({ curTime, duration }),
  setVolume: (volume) => set({ volume }),
  setView: (view) => set({ view }),
  setExpanded: (expanded) => {
    set({ expanded });
    try { localStorage.setItem(EXPANDED_KEY, expanded ? "1" : "0"); } catch {}
  },
  setShowUnmute: (showUnmute) => set({ showUnmute }),

  close: () => set({ queue: [], order: [], currentIdx: 0, playingPlaylistId: null, playing: false }),
}));
