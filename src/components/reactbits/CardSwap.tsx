import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ListMusic } from "lucide-react";
import "./CardSwap.css";

export interface CardSwapItem {
  id: number;
  title: string;
  subtitle?: string;
  gradient?: string;
}

interface CardSwapProps {
  items: CardSwapItem[];
  activeId: number | null;
  onSelect: (id: number) => void;
}

const MAX_VISIBLE = 4;

// react-bits' CardSwap is a GSAP-driven stacked-card swapper. This is a
// small, dependency-free recreation of the same interaction using plain
// CSS transitions: cards sit in an explicit stack order, the front one is
// the current selection, and clicking any card behind it (or the arrows)
// swaps it to the front with a springy stacked-card animation.
export default function CardSwap({ items, activeId, onSelect }: CardSwapProps) {
  const [order, setOrder] = useState<number[]>(() => items.map((i) => i.id));

  // Keep the stack order in sync when playlists are added/removed.
  useEffect(() => {
    setOrder((prev) => {
      const ids = items.map((i) => i.id);
      const kept = prev.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !kept.includes(id));
      return [...kept, ...added];
    });
  }, [items]);

  // Keep the front card in sync with whatever is selected elsewhere
  // (e.g. the page auto-selecting the first playlist on load).
  useEffect(() => {
    if (activeId == null) return;
    setOrder((prev) => {
      if (prev[0] === activeId || !prev.includes(activeId)) return prev;
      return [activeId, ...prev.filter((id) => id !== activeId)];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  function bringToFront(id: number) {
    if (id === order[0]) return;
    setOrder((prev) => [id, ...prev.filter((x) => x !== id)]);
    onSelect(id);
  }

  function cycle(direction: 1 | -1) {
    if (order.length < 2) return;
    setOrder((prev) => {
      const next = [...prev];
      if (direction === 1) next.push(next.shift()!);
      else next.unshift(next.pop()!);
      onSelect(next[0]);
      return next;
    });
  }

  const byId = new Map(items.map((i) => [i.id, i]));
  const visible = order.slice(0, MAX_VISIBLE);
  const activePos = Math.max(order.indexOf(activeId ?? order[0]), 0);

  return (
    <div className="cardswap-wrap">
      <div className="cardswap-stack">
        {visible.map((id, pos) => {
          const item = byId.get(id);
          if (!item) return null;
          return (
            <button
              key={id}
              type="button"
              className={`cardswap-card${pos === 0 ? " cardswap-card-front" : ""}`}
              style={{
                zIndex: MAX_VISIBLE - pos,
                transform: `translate(${pos * 8}px, ${pos * 14}px) scale(${1 - pos * 0.05}) rotate(${
                  pos === 0 ? 0 : (pos % 2 === 0 ? -1 : 1) * (1.5 + pos)
                }deg)`,
                opacity: 1 - pos * 0.16,
                background: item.gradient,
              }}
              onClick={() => bringToFront(id)}
              title={item.title}
            >
              <ListMusic size={18} className="cardswap-card-icon" />
              <span className="cardswap-card-title">{item.title}</span>
              {item.subtitle && <span className="cardswap-card-subtitle">{item.subtitle}</span>}
            </button>
          );
        })}
      </div>

      {order.length > 1 && (
        <div className="cardswap-nav">
          <button type="button" className="cardswap-nav-btn" onClick={() => cycle(-1)} title="Previous playlist">
            <ChevronLeft size={15} />
          </button>
          <span className="cardswap-nav-count">{activePos + 1} / {order.length}</span>
          <button type="button" className="cardswap-nav-btn" onClick={() => cycle(1)} title="Next playlist">
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}