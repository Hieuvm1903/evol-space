import { useEffect, useRef } from "react";

export interface DriveKeys {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  turnLeft: boolean;
  turnRight: boolean;
}

const EMPTY: DriveKeys = {
  forward: false, backward: false, left: false, right: false, turnLeft: false, turnRight: false,
};

const KEY_MAP: Record<string, keyof DriveKeys> = {
  w: "forward", arrowup: "forward",
  s: "backward", arrowdown: "backward",
  a: "left", arrowleft: "left",
  d: "right", arrowright: "right",
  q: "turnLeft",
  e: "turnRight",
};

/** Tracks WASD/arrow/Q-E state in a ref (not React state) so the render
 * loop can read it every frame without triggering re-renders on keypress. */
export function useKeyboardDrive(enabled: boolean) {
  const keysRef = useRef<DriveKeys>({ ...EMPTY });

  useEffect(() => {
    if (!enabled) {
      keysRef.current = { ...EMPTY };
      return;
    }

    function isTypingTarget(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    }
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e)) return;
      const key = KEY_MAP[e.key.toLowerCase()];
      if (key) { keysRef.current[key] = true; e.preventDefault(); }
    }
    function onKeyUp(e: KeyboardEvent) {
      const key = KEY_MAP[e.key.toLowerCase()];
      if (key) keysRef.current[key] = false;
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      keysRef.current = { ...EMPTY };
    };
  }, [enabled]);

  return keysRef;
}