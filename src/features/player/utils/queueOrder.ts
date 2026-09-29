import type { Mode } from "../types";

// ---------------------------------------------------------------------
// This file supports BOTH call styles so nothing else has to change:
//
//  1. Old, index-permutation style (used by hooks/usePlayerEngine.ts):
//       order = [2, 0, 1]   // play order, values are track indices
//       pickNextTrackIdx(order, mode, currentTrackIdx)
//
//  2. New, queue-order-is-play-order style (used by store.ts / NowPlaying):
//       pickNextTrackIdx(queue.length, mode, currentIdx)
// ---------------------------------------------------------------------

export function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Old API: returns a shuffled permutation of [0..n-1]. */
export function shuffleQueue(n: number): number[] {
  return shuffleArray(Array.from({ length: n }, (_, i) => i));
}

function wraps(mode: Mode): boolean {
  return mode === "repeatAll" || mode === "shuffle";
}

// ------------------------------- next --------------------------------

export function pickNextTrackIdx(queueLen: number, mode: Mode, currentIdx: number): number | null;
export function pickNextTrackIdx(order: number[], mode: Mode, currentTrackIdx: number): number | null;
export function pickNextTrackIdx(
  source: number | number[], mode: Mode, current: number,
): number | null {
  if (Array.isArray(source)) {
    const order = source;
    if (order.length === 0) return null;
    const pos = order.indexOf(current);
    if (order.length === 1) return wraps(mode) ? order[0] : null;
    if (pos === -1) return order[0];
    const nextPos = pos + 1;
    if (nextPos < order.length) return order[nextPos];
    return wraps(mode) ? order[0] : null;
  }

  const queueLen = source;
  if (queueLen <= 1) return wraps(mode) ? current : null;
  const next = current + 1;
  if (next < queueLen) return next;
  return wraps(mode) ? 0 : null;
}

// ------------------------------- prev --------------------------------

export function pickPrevTrackIdx(queueLen: number, mode: Mode, currentIdx: number): number;
export function pickPrevTrackIdx(order: number[], mode: Mode, currentTrackIdx: number): number;
export function pickPrevTrackIdx(
  source: number | number[], mode: Mode, current: number,
): number {
  if (Array.isArray(source)) {
    const order = source;
    if (order.length === 0) return current;
    const pos = order.indexOf(current);
    if (pos === -1) return order[0];
    if (pos - 1 >= 0) return order[pos - 1];
    return wraps(mode) ? order[order.length - 1] : order[0];
  }

  const queueLen = source;
  const prev = current - 1;
  if (prev >= 0) return prev;
  return wraps(mode) ? queueLen - 1 : 0;
}