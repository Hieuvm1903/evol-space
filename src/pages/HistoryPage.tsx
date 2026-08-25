import React, { useState } from "react";
import { POP, ANIME, BENDY } from "../content/musicLibrary";

const VIDEO_ID_RE = /(?:v=|\/embed\/|\/shorts\/|youtu\.be\/)([A-Za-z0-9_-]{11})/;

function videoIdFromUrl(url: string): string | null {
  const m = url.match(VIDEO_ID_RE);
  return m ? m[1] : null;
}

function PlaylistTab({ playlist }: { playlist: [string, string][] }) {
  return (
    <div>
      {playlist.map(([title, url]) => {
        const videoId = videoIdFromUrl(url);
        return (
          <div className="history-track" key={url}>
            <p className="history-track-title">{title}</p>
            {videoId && (
              <div className="history-embed-wrap">
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}`}
                  title={title}
                  frameBorder={0}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const TABS = [
  { label: "🎶 Linh tinh", playlist: POP },
  { label: "🎬 Anime", playlist: ANIME },
  { label: "🎮 Bendy", playlist: BENDY },
];

export function HistoryPage() {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="page">
      <h2>🕰️ His-tory</h2>
      <div className="tabs">
        {TABS.map((t, i) => (
          <button key={t.label} className={activeTab === i ? "active" : ""} onClick={() => setActiveTab(i)}>
            {t.label}
          </button>
        ))}
      </div>
      <PlaylistTab playlist={TABS[activeTab].playlist} />
    </div>
  );
}
