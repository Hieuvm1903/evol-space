import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import "./ConfirmDialog.css";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  /** Red/danger styling for the confirm button — use for deletes. */
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Replacement for window.confirm(). Resolves `true`/`false` depending on
 * what the person picked, same call shape as the browser version:
 *
 *   const confirmDialog = useConfirm();
 *   const ok = await confirmDialog({
 *     title: "Delete this place?",
 *     description: "This can't be undone.",
 *     confirmText: "Delete",
 *     danger: true,
 *   });
 *   if (!ok) return;
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (v: boolean) => void;
}

/** Mount once near the root of the app (see App.tsx). */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [closing, setClosing] = useState(false);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setClosing(false);
      setPending({ ...options, resolve });
    });
  }, []);

  const finish = useCallback((result: boolean) => {
    setPending((current) => {
      if (!current) return current;
      setClosing(true);
      setTimeout(() => {
        current.resolve(result);
        setPending(null);
      }, 150);
      return current;
    });
  }, []);

  useEffect(() => {
    if (!pending) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") finish(false);
      if (e.key === "Enter") finish(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pending, finish]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending &&
        createPortal(
          <div
            className={`confirm-overlay${closing ? " confirm-closing" : ""}`}
            onClick={() => finish(false)}
          >
            <div
              className={`confirm-card${closing ? " confirm-closing" : ""}`}
              role="alertdialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <div className={`confirm-icon${pending.danger ? " confirm-icon-danger" : ""}`}>
                <AlertTriangle size={19} />
              </div>
              <h3 className="confirm-title">{pending.title}</h3>
              {pending.description && <p className="confirm-desc">{pending.description}</p>}
              <div className="confirm-actions">
                <button className="confirm-btn confirm-btn-cancel" onClick={() => finish(false)}>
                  {pending.cancelText || "Cancel"}
                </button>
                <button
                  className={`confirm-btn ${pending.danger ? "confirm-btn-danger" : "confirm-btn-primary"}`}
                  onClick={() => finish(true)}
                  autoFocus
                >
                  {pending.confirmText || "Confirm"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </ConfirmContext.Provider>
  );
}