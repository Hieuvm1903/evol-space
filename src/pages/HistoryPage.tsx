import React, { useState } from "react";
import { Tabs, Empty } from "antd";
import { Disc3, Clapperboard, Gamepad2 } from "lucide-react";
import { POP, ANIME, BENDY } from "../content/musicLibrary";
import "./HistoryPage.css";

const VIDEO_ID_RE = /(?:v=|\/embed\/|\/shorts\/|youtu\.be\/)([A-Za-z0-9_-]{11})/;

function videoIdFromUrl(url: string): string | null {
  const m = url.match(VIDEO_ID_RE);
  return m ? m[1] : null;
}

function PlaylistTab({ playlist }: { playlist: [string, string][] }) {
  if (!playlist.length) {
    return <Empty description={<span style={{ color: "#9c97b8" }}>Nothing here yet.</span>} image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }
  return (
    <div>
      {playlist.map(([title, url], i) => {
        const videoId = videoIdFromUrl(url);
        return (
          <div className="history-track stagger-item" style={{ animationDelay: `${Math.min(i, 10) * 45}ms` }} key={url}>
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

export function HistoryPage() {
  const [activeTab, setActiveTab] = useState("pop");

  return (
    <div className="page">
      <h2 className="history-heading">
        <Disc3 size={22} style={{ verticalAlign: -4, marginRight: 8, color: "#8b6ff5" }} />
        His-tory
      </h2>
      <Tabs
        className="history-tabs"
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: "pop", label: <span><Disc3 size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Linh tinh</span>, children: <PlaylistTab playlist={POP} /> },
          { key: "anime", label: <span><Clapperboard size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Anime</span>, children: <PlaylistTab playlist={ANIME} /> },
          { key: "bendy", label: <span><Gamepad2 size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Bendy</span>, children: <PlaylistTab playlist={BENDY} /> },
        ]}
      />
    </div>
  );
}