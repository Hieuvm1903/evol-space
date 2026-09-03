import type { Mode } from "../types";

export function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// No more index-permutation layer — queue order == play order.
export function pickNextTrackIdx(queueLen: number, mode: Mode, currentIdx: number): number | null {
  if (queueLen <= 1) return mode === "repeatAll" ? currentIdx : null;
  const next = currentIdx + 1;
  if (next < queueLen) return next;
  return mode === "repeatAll" ? 0 : null;
}

export function pickPrevTrackIdx(queueLen: number, mode: Mode, currentIdx: number): number {
  const prev = currentIdx - 1;
  if (prev >= 0) return prev;
  return mode === "repeatAll" ? queueLen - 1 : 0;
}