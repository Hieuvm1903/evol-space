import { useCallback, useRef, useState } from "react";

interface History<T> { present: T; past: T[]; future: T[] }

/** State with undo/redo. Pass a `key` to merge rapid successive edits (slider drags, typing)
 *  into one undo step. */
export function useUndoable<T>(initial: T) {
  const ref = useRef<History<T>>({ present: initial, past: [], future: [] });
  const [h, setH] = useState(ref.current);
  const last = useRef<{ key: string; t: number } | null>(null);

  const commit = (n: History<T>) => { ref.current = n; setH(n); };

  const set = useCallback((u: T | ((c: T) => T), key?: string) => {
    const s = ref.current;
    const next = typeof u === "function" ? (u as (c: T) => T)(s.present) : u;
    if (next === s.present) return;
    const now = Date.now();
    const coalesce = !!key && last.current?.key === key && now - last.current.t < 800;
    last.current = key ? { key, t: now } : null;
    commit({ present: next, past: coalesce ? s.past : [...s.past.slice(-49), s.present], future: [] });
  }, []);

  const undo = useCallback(() => {
    const s = ref.current;
    if (!s.past.length) return;
    last.current = null;
    commit({ present: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.present, ...s.future] });
  }, []);

  const redo = useCallback(() => {
    const s = ref.current;
    if (!s.future.length) return;
    last.current = null;
    commit({ present: s.future[0], past: [...s.past, s.present], future: s.future.slice(1) });
  }, []);

  const reset = useCallback((present: T) => { last.current = null; commit({ present, past: [], future: [] }); }, []);

  return { value: h.present, set, undo, redo, reset, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}
