import React from "react";
import { notification as staticNotification } from "antd";
import type { NotificationInstance } from "antd/es/notification/interface";
import type { MessageInstance } from "antd/es/message/interface";
import { CheckCircle2, XCircle, Info } from "lucide-react";
import "./notify.css";

type NotifyKind = "success" | "error" | "info";

interface NotifyOpts {
  description?: string;
  duration?: number; // seconds
  key?: string;
}

const ICONS: Record<NotifyKind, React.ReactNode> = {
  success: React.createElement(CheckCircle2, { size: 18 }),
  error: React.createElement(XCircle, { size: 18 }),
  info: React.createElement(Info, { size: 18 }),
};

let boundNotification: NotificationInstance | null = null;
let boundMessage: MessageInstance | null = null;

/** Called once by AntdFeedbackBridge inside antd's <App> provider so imperative notifications inherit ConfigProvider theme context. */
export function bindAntdFeedback(notif: NotificationInstance, msg: MessageInstance) {
  boundNotification = notif;
  boundMessage = msg;
}

export function getNotificationApi(): NotificationInstance {
  return boundNotification ?? staticNotification;
}

export function getMessageApi(): MessageInstance | null {
  return boundMessage;
}

function push(kind: NotifyKind, message: string, opts: NotifyOpts = {}) {
  getNotificationApi().open({
    key: opts.key,
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
 * glass theme and backed by Ant Design's context-aware App.useApp() instance.
 */
export const notify = {
  success: (message: string, description?: string, duration?: number, key?: string) =>
    push("success", message, { description, duration, key }),
  error: (message: string, description?: string, duration?: number, key?: string) =>
    push("error", message, { description, duration, key }),
  info: (message: string, description?: string, duration?: number, key?: string) =>
    push("info", message, { description, duration, key }),

  added: (description?: string) => push("success", "Added", { description }),
  updated: (description?: string) => push("success", "Saved", { description }),
  deleted: (description?: string) => push("success", "Deleted", { description }),
};