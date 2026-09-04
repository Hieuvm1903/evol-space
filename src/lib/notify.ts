import React from "react";
import { notification } from "antd";
import { CheckCircle2, XCircle, Info } from "lucide-react";
import "./notify.css";

type NotifyKind = "success" | "error" | "info";

interface NotifyOpts {
  description?: string;
  duration?: number; // seconds
}

const ICONS: Record<NotifyKind, React.ReactNode> = {
  success: React.createElement(CheckCircle2, { size: 18 }),
  error: React.createElement(XCircle, { size: 18 }),
  info: React.createElement(Info, { size: 18 }),
};

function push(kind: NotifyKind, message: string, opts: NotifyOpts = {}) {
  notification.open({
    message,
    description: opts.description,
    icon: ICONS[kind],
    placement: "bottomRight",
    duration: opts.duration ?? 3.5,
    className: `evol-notice evol-notice-${kind}`,
  });
}

/**
 * Small bottom-right notification service, styled to match the app's
 * glass theme (same corner/look as the playlist-import progress toast in
 * pages/music/useImportNotification.tsx). Call these directly from any
 * add/edit/delete handler — antd's notification portal is already
 * mounted globally, no extra wiring needed.
 *
 * Usage:
 *   notify.added(`"${name}" added.`);
 *   notify.updated(`"${name}" saved.`);
 *   notify.deleted("Place removed.");
 *   notify.error("Couldn't save", "Check your connection and try again.");
 */
export const notify = {
  success: (message: string, description?: string, duration?: number) =>
    push("success", message, { description, duration }),
  error: (message: string, description?: string, duration?: number) =>
    push("error", message, { description, duration }),
  info: (message: string, description?: string, duration?: number) =>
    push("info", message, { description, duration }),

  added: (description?: string) => push("success", "Added", { description }),
  updated: (description?: string) => push("success", "Saved", { description }),
  deleted: (description?: string) => push("success", "Deleted", { description }),
};