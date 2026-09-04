import { useCallback, useRef, useState } from "react";

const LONG_PRESS_MS = 1500; // keep in sync with LongPressRing.css's fill animation
const MOVE_CANCEL_PX = 10; // finger/mouse drifted too far — treat as a scroll, not a hold

/**
 * Generic "hold 1.5s to enter select mode, then tap to check/uncheck"
 * behavior for any list. Works with touch, mouse, and pen since it's
 * built on pointer events, and exposes `isPressing(id)` so a row can
 * show a circular fill indicator while the hold is in progress (see
 * components/LongPressRing.tsx).
 *
 * USAGE — drop into any row-rendering list:
 *
 *   const longPress = useLongPressSelect<number>();
 *
 *   {items.map((item) => {
 *     const lp = longPress.bind(item.id);
 *     return (
 *       <div
 *         key={item.id}
 *         className={`my-row${longPress.isSelected(item.id) ? " selected" : ""}`}
 *         {...lp}
 *         onClick={(e) => {
 *           lp.onClick(e);
 *           // only run your normal row action if this click wasn't
 *           // consumed by a long-press or a select-mode toggle:
 *           if (!longPress.selectMode && !e.defaultPrevented) openItem(item);
 *         }}
 *       >
 *         {longPress.selectMode ? (
 *           <SelectCheckbox checked={longPress.isSelected(item.id)} />
 *         ) : longPress.isPressing(item.id) ? (
 *           <LongPressRing />
 *         ) : null}
 *         ...row content...
 *       </div>
 *     );
 *   })}
 *
 *   {longPress.selectMode && (
 *     <SelectionToolbar
 *       count={longPress.selectedCount}
 *       total={items.length}
 *       onSelectAll={() => longPress.selectAll(items.map((i) => i.id))}
 *       onClearSelection={longPress.clearSelection}
 *       onCancel={longPress.exitSelectMode}
 *       onDelete={handleBulkDelete}
 *     />
 *   )}
 */
export function useLongPressSelect<Id extends string | number>() {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<Id>>(new Set());
  // Which row is currently mid-hold — drives the circular progress ring.
  // Not the same as `selectedIds`: this clears the instant the finger/
  // mouse lifts or the hold completes.
  const [pressingId, setPressingId] = useState<Id | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const longPressFiredRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Cancels an in-progress hold (release, drag-away, or the timer firing)
  // and hides the ring.
  const cancelPress = useCallback(() => {
    clearTimer();
    setPressingId(null);
  }, [clearTimer]);

  function toggle(id: Id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Spread the result onto a row: `<div {...longPress.bind(item.id)}>`. */
  const bind = useCallback(
    (id: Id) => ({
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        startPos.current = { x: e.clientX, y: e.clientY };
        longPressFiredRef.current = false;
        clearTimer();
        setPressingId(id);
        timerRef.current = setTimeout(() => {
          longPressFiredRef.current = true;
          setPressingId(null); // ring's done its job — checkbox takes over
          setSelectMode(true);
          setSelectedIds((prev) => new Set(prev).add(id));
          if (navigator.vibrate) navigator.vibrate(18);
        }, LONG_PRESS_MS);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (!startPos.current || !timerRef.current) return;
        const dx = e.clientX - startPos.current.x;
        const dy = e.clientY - startPos.current.y;
        if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) cancelPress();
      },
      onPointerUp: cancelPress,
      onPointerLeave: cancelPress,
      onPointerCancel: cancelPress,
      onClick: (e: React.MouseEvent) => {
        // Swallow the click that follows a long-press so the row's normal
        // click action (navigate, fly-to, open, ...) doesn't also fire.
        if (longPressFiredRef.current) {
          e.preventDefault();
          e.stopPropagation();
          longPressFiredRef.current = false;
          return;
        }
        if (selectMode) {
          e.preventDefault();
          e.stopPropagation();
          toggle(id);
        }
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearTimer, cancelPress, selectMode],
  );

  function isPressing(id: Id) {
    return pressingId === id;
  }

  function isSelected(id: Id) {
    return selectedIds.has(id);
  }

  function selectAll(ids: Id[]) {
    setSelectedIds(new Set(ids));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function enterSelectMode(id?: Id) {
    setSelectMode(true);
    if (id !== undefined) setSelectedIds((prev) => new Set(prev).add(id));
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  return {
    selectMode,
    selectedIds,
    selectedCount: selectedIds.size,
    bind,
    toggle,
    isSelected,
    isPressing,
    selectAll,
    clearSelection,
    enterSelectMode,
    exitSelectMode,
  };
}

export type LongPressSelect<Id extends string | number> = ReturnType<typeof useLongPressSelect<Id>>;