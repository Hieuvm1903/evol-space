import React from "react";
import { Progress } from "antd";
import { Check, X, Music2 } from "lucide-react";
import type { ImportProgressItem } from "../../lib/musicService";

export default function ImportProgress({
  done, total, items,
}: { done: number; total: number; items: ImportProgressItem[] }) {
  if (total === 0) return null;
  const percent = Math.round((done / total) * 100);

  return (
    <div className="import-progress fade-in-up">
      <div className="import-progress-head">
        <Progress percent={percent} size="small" showInfo={false} strokeColor={{ "0%": "#8b6ff5", "100%": "#22d3ee" }} />
        <span className="import-progress-count">{done} / {total}</span>
      </div>
      <div className="import-progress-list">
        {items.slice().reverse().map((it, i) => (
          <div className="import-progress-row stagger-item" key={items.length - i}>
            {it.thumbnail_url
              ? <img src={it.thumbnail_url} alt="" />
              : <div className="import-progress-thumb-empty"><Music2 size={12} /></div>}
            <span className="import-progress-title">{it.title}</span>
            {it.ok
              ? <Check size={13} color={it.wasAdded ? "#22d3ee" : "#6a6690"} />
              : <X size={13} color="#e05555" />}
          </div>
        ))}
      </div>
    </div>
  );
}