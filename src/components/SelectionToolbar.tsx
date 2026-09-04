import React from "react";
import { Trash2, X, CheckSquare, Square } from "lucide-react";
import "./SelectionToolbar.css";

interface Props {
  /** Number of currently checked rows. */
  count: number;
  /** Total selectable rows currently shown — used to drive the All/None toggle. */
  total: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onCancel: () => void;
  onDelete: () => void;
  deleting?: boolean;
  /** e.g. "place" -> "3 places selected". Defaults to "item". */
  itemLabel?: string;
}

export default function SelectionToolbar({
  count, total, onSelectAll, onClearSelection, onCancel, onDelete, deleting, itemLabel = "item",
}: Props) {
  const allSelected = total > 0 && count === total;

  return (
    <div className="selection-toolbar fade-in-up">
      <button className="selection-toolbar-cancel" onClick={onCancel} title="Exit select mode">
        <X size={15} />
      </button>

      <span className="selection-toolbar-count">
        {count} {itemLabel}{count === 1 ? "" : "s"} selected
      </span>

      <button
        className="selection-toolbar-btn"
        onClick={allSelected ? onClearSelection : onSelectAll}
      >
        {allSelected ? <Square size={14} /> : <CheckSquare size={14} />}
        {allSelected ? "None" : "All"}
      </button>

      <button
        className="selection-toolbar-btn selection-toolbar-delete"
        onClick={onDelete}
        disabled={count === 0 || deleting}
      >
        <Trash2 size={14} />
        {deleting ? "Deleting…" : "Delete"}
      </button>
    </div>
  );
}