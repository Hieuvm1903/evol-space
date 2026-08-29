import React from "react";
import YouTube from "react-youtube";
import type { YouTubePlayer } from "react-youtube";
import type { Track } from "../types";

interface Props {
  visible: boolean;
  track: Track;
  nextVideoId?: string;
  onReady: (e: { target: YouTubePlayer }) => void;
  onStateChange: (e: { data: number; target: YouTubePlayer }) => void;
}

// The visible player always stays mounted — react-youtube swaps the video
// via the `videoId` prop instead of us calling loadVideoById by hand — and
// only the CSS display toggles between the video and lyrics tabs, so
// playback survives switching tabs (same guarantee the old #yt-main div
// gave, just without the manual DOM/script bookkeeping).
export default function VideoView({ visible, track, nextVideoId, onReady, onStateChange }: Props) {
  return (
    <div id="video-shell" style={{ display: visible ? "block" : "none" }}>
      <YouTube
        videoId={track.video_id}
        opts={{ width: "100%", height: "100%", playerVars: { autoplay: 1, mute: 0, playsinline: 1, rel: 0 } }}
        onReady={onReady}
        onStateChange={onStateChange}
        className="np-yt-iframe-wrap"
        iframeClassName="np-yt-iframe"
      />
      {nextVideoId && (
        <div className="np-yt-preload" aria-hidden="true">
          <YouTube
            videoId={nextVideoId}
            opts={{ height: "0", width: "0", playerVars: { autoplay: 0, mute: 1 } }}
          />
        </div>
      )}
    </div>
  );
}
