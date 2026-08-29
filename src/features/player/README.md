# Now Playing widget — rewrite notes

## 1. Install the two new deps

```bash
npm install zustand react-youtube
```

`@dnd-kit/*`, `framer-motion`, and `lucide-react` are already in your `package.json` and are reused as-is.

## 2. Drop the files in

Copy this whole `player/` folder over `src/features/player/`, replacing it entirely. Paths map 1:1:

```
player/types.ts                    -> src/features/player/types.ts            (unchanged)
player/constants.ts                -> src/features/player/constants.ts        (unchanged)
player/lyricsProvider.ts           -> src/features/player/lyricsProvider.ts   (unchanged)
player/utils/*                     -> src/features/player/utils/*             (unchanged)
player/hooks/useDragPosition.ts    -> src/features/player/hooks/useDragPosition.ts (unchanged mechanics)
player/hooks/useLyrics.ts          -> src/features/player/hooks/useLyrics.ts  (adapted to a single track, not a queue index)
player/store.ts                    -> src/features/player/store.ts            (NEW — zustand)
player/QueueList.tsx               -> src/features/player/QueueList.tsx       (icons swapped to lucide)
player/NowPlaying.tsx              -> src/features/player/NowPlaying.tsx      (rewritten)
player/NowPlaying.css              -> src/features/player/NowPlaying.css      (rewritten)
player/PlayerProvider.tsx          -> src/features/player/PlayerProvider.tsx  (rewritten)
player/components/*                -> src/features/player/components/*       (rewritten, antd-free)
```

Delete the old `components/LyricsView.tsx`, `LyricsSearchBox.tsx`, `LyricsCandidatePicker.tsx`, `LyricsLines.tsx`, `LyricsEmptyStates.tsx` (merged into `components/LyricsPanel.tsx`), `components/VolumeRow.tsx` (replaced by `VolumeSlider.tsx`), and `hooks/usePlayerEngine.ts` (replaced by `store.ts`).

Nothing outside `src/features/player/` needs to change — `MusicWorkspace.tsx` and everywhere else calling `usePlayer()` keeps working unmodified, since the exposed API (`loadQueue`, `playPlaylistMode`, `playingPlaylistId`, `nowPlayingTrackId`, `isPlaying`, `currentMode`) is identical.

## 3. What changed and why

- **State**: all playback state (queue, play order, current index, mode, playing/curTime/duration, volume, view, expanded, snap) now lives in one `zustand` store (`store.ts`) instead of being split across `usePlayerEngine`, local `useState` in `NowPlaying.tsx`, and an `onEngineUpdate` ref callback that pushed state back up into `PlayerProvider`. Any component can read exactly the slice it needs via `usePlayerStore(s => s.foo)`.
- **YouTube player**: `react-youtube` replaces the ~80 lines that manually injected the IFrame API `<script>` tag and instantiated `YT.Player`. The visible player now just tracks `track.video_id` via props; a second hidden `<YouTube>` keeps the next queued track cued for a snappier transition (same intent as the old preload player, less code).
- **Drag-to-move**: unchanged — still `framer-motion`'s `useDragControls` + `useMotionValue` pattern with the same 8-point edge-snap math (`utils/snapPoints.ts`) and the same `localStorage` persistence (`evol_player_pos`, `evol_player_snap_mode`). This was already solid, so it's a straight carry-over — **this is the part to test first**: drag the pill/panel around, confirm it snaps to the nearest of the 8 dock points on release, toggle "snap to edges" off and confirm free positioning + viewport clamping still works, and reload the page to confirm the position persists.
- **Queue reordering**: unchanged — still `@dnd-kit` sortable list, just with `lucide-react` icons instead of `@ant-design/icons`.
- **UI controls**: `antd` (`Button`, `Segmented`, `Switch`, `Select`) dropped from this widget in favor of small styled-with-plain-CSS components (`np-icon-btn`, `np-segmented`, `np-snap-toggle`, `np-range`, `np-select`). `antd` is untouched everywhere else in the app.
- **Lyrics**: same LRCLIB fetch/cache/manual-search/persist logic (`lyricsProvider.ts`, `hooks/useLyrics.ts`), just merged the 5 old sub-components into one `components/LyricsPanel.tsx`.

## 4. Testing checklist

1. `npm install zustand react-youtube`
2. Load a playlist from the Music page → widget appears bottom/top-right.
3. **Drag it** by the pill or the panel header — confirm it snaps to whichever of the 8 edge/corner points is nearest on release.
4. Collapse/expand (tap) — confirm the saved position re-applies correctly at the new size.
5. Toggle the snap switch in the header off → drag → release — it should stay exactly where dropped (clamped to viewport) instead of snapping.
6. Reload the page — position and snap preference should persist.
7. Reorder the queue by dragging rows — confirm playback order updates and the currently-playing row stays highlighted correctly through a reorder.
8. Skip/prev, repeat-one, repeat-all, shuffle, volume, seek, and lyrics search/sync — all should behave as before.
