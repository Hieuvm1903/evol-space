import React, { useEffect, useRef } from "react";
import type { Track } from "../types";
import { loadYouTubeIframeApi } from "../hooks/useYoutubeIframeApi";

// Mirrors react-youtube's onReady/onStateChange shape so NowPlaying.tsx
// doesn't need to change its handlers.
interface Props {
  visible: boolean;
  track: Track;
  nextVideoId?: string;
  retryNonce?: number;
  onReady: (e: { target: any }) => void;
  onStateChange: (e: { data: number; target: any }) => void;
  onError?: (e: { data: number; target: any }) => void;
}

export default function VideoView({ visible, track, nextVideoId, retryNonce = 0, onReady, onStateChange, onError }: Props) {
  const mainElRef = useRef<HTMLDivElement>(null);
  const preloadElRef = useRef<HTMLDivElement>(null);
  const mainPlayerRef = useRef<any>(null);
  const preloadPlayerRef = useRef<any>(null);
  const currentVideoId = useRef<string | null>(null);
  const lastRetryNonce = useRef<number>(retryNonce);
  const latestVideoIdRef = useRef<string>(track.video_id);
  latestVideoIdRef.current = track.video_id;

  const callbacksRef = useRef({ onReady, onStateChange, onError });
  callbacksRef.current = { onReady, onStateChange, onError };

  // Create both players exactly once for the widget's lifetime.
  useEffect(() => {
    let cancelled = false;
    loadYouTubeIframeApi()
      .then(() => {
        if (cancelled || !mainElRef.current) return;
        const YT = (window as any).YT;
        if (!YT?.Player) {
          callbacksRef.current.onError?.({ data: -100, target: null });
          return;
        }

        const initialVideoId = latestVideoIdRef.current?.trim() || "";
        try {
          mainPlayerRef.current = new YT.Player(mainElRef.current, {
            width: "100%",
            height: "100%",
            videoId: initialVideoId,
            playerVars: { autoplay: 1, mute: 0, playsinline: 1, rel: 0 },
            events: {
              onReady: (e: any) => {
                currentVideoId.current = initialVideoId;
                callbacksRef.current.onReady(e);
                const latest = latestVideoIdRef.current?.trim() || "";
                if (latest && latest !== currentVideoId.current) {
                  currentVideoId.current = latest;
                  try { e.target.loadVideoById(latest); } catch {
                    callbacksRef.current.onError?.({ data: -101, target: e.target });
                  }
                }
              },
              onStateChange: (e: any) => callbacksRef.current.onStateChange(e),
              onError: (e: any) => callbacksRef.current.onError?.(e),
            },
          });
        } catch {
          callbacksRef.current.onError?.({ data: -101, target: null });
        }

        if (preloadElRef.current) {
          try {
            preloadPlayerRef.current = new YT.Player(preloadElRef.current, {
              videoId: "",
              playerVars: { mute: 1, controls: 0 },
            });
          } catch { /* preload is best-effort */ }
        }
      })
      .catch(() => {
        if (!cancelled) callbacksRef.current.onError?.({ data: -100, target: null });
      });
    return () => {
      cancelled = true;
      try { mainPlayerRef.current?.destroy?.(); } catch { }
      try { preloadPlayerRef.current?.destroy?.(); } catch { }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap videos in place instead of remounting the iframe — this is the
  // key difference from react-youtube, which tears down/recreates the
  // iframe on prop changes and can interrupt playback.
  useEffect(() => {
    const isRetry = retryNonce !== lastRetryNonce.current;
    lastRetryNonce.current = retryNonce;
    const vid = track.video_id?.trim() || "";
    if (!vid) {
      currentVideoId.current = "";
      callbacksRef.current.onError?.({ data: 2, target: mainPlayerRef.current });
      return;
    }
    if (!isRetry && currentVideoId.current === vid) return;
    currentVideoId.current = vid;
    if (!mainPlayerRef.current?.loadVideoById) return;
    try {
      mainPlayerRef.current.loadVideoById(vid);
    } catch {
      callbacksRef.current.onError?.({ data: -101, target: mainPlayerRef.current });
    }
  }, [track.video_id, retryNonce]);

  useEffect(() => {
    if (!nextVideoId) return;
    try { preloadPlayerRef.current?.cueVideoById?.(nextVideoId); } catch { }
  }, [nextVideoId]);

  return (
    <div id="video-shell" style={{ display: visible ? "block" : "none" }}>
      <div className="np-yt-iframe-wrap"><div ref={mainElRef} className="np-yt-iframe" /></div>
      <div className="np-yt-preload" aria-hidden="true"><div ref={preloadElRef} /></div>
    </div>
  );
}


// import React from "react";
// import ReactPlayer from "react-player/youtube";
// import type { Track } from "../types";

// interface Props {
//   visible: boolean;
//   track: Track;
//   onReady: (e: { target: any }) => void;
//   onStateChange: (e: { data: number; target: any }) => void;
//   onProgress?: (curTime: number, duration: number) => void;
// }

// // react-player has its own onEnded/onPlay/onPause/onProgress callbacks
// // instead of a single onStateChange, so this adapts them back into the
// // same { data } shape NowPlaying.tsx already expects (0=ended,1=playing,2=paused).
// export default function VideoView({ visible, track, onReady, onStateChange, onProgress }: Props) {
//   const playerRef = React.useRef<ReactPlayer>(null);

//   return (
//     <div id="video-shell" style={{ display: visible ? "block" : "none" }}>
//       <div className="np-yt-iframe-wrap">
//         <ReactPlayer
//           ref={playerRef}
//           url={`https://www.youtube.com/watch?v=${track.video_id}`}
//           playing
//           controls={false}
//           width="100%"
//           height="100%"
//           progressInterval={500}
//           config={{ youtube: { playerVars: { autoplay: 1, playsinline: 1, rel: 0 } } }}
//           onReady={() => onReady({ target: wrapInternalPlayer(playerRef.current) })}
//           onPlay={() => onStateChange({ data: 1, target: wrapInternalPlayer(playerRef.current) })}
//           onPause={() => onStateChange({ data: 2, target: wrapInternalPlayer(playerRef.current) })}
//           onEnded={() => onStateChange({ data: 0, target: wrapInternalPlayer(playerRef.current) })}
//           onProgress={({ playedSeconds }) => {
//             const dur = playerRef.current?.getDuration() ?? 0;
//             if (dur > 0) onProgress?.(playedSeconds, dur);
//           }}
//         />
//       </div>
//     </div>
//   );
// }

// // Gives callers the same getCurrentTime/getDuration/seekTo/setVolume/
// // isMuted/unMute/getPlayerState surface the rest of NowPlaying.tsx expects,
// // backed by react-player's instance methods.
// function wrapInternalPlayer(rp: ReactPlayer | null) {
//   return {
//     getCurrentTime: () => rp?.getCurrentTime() ?? 0,
//     getDuration: () => rp?.getDuration() ?? 0,
//     seekTo: (s: number) => rp?.seekTo(s, "seconds"),
//     setVolume: (v: number) => rp?.getInternalPlayer()?.setVolume?.(v),
//     isMuted: () => rp?.getInternalPlayer()?.isMuted?.() ?? false,
//     unMute: () => rp?.getInternalPlayer()?.unMute?.(),
//     getPlayerState: () => rp?.getInternalPlayer()?.getPlayerState?.() ?? -1,
//     playVideo: () => rp?.getInternalPlayer()?.playVideo?.(),
//     pauseVideo: () => rp?.getInternalPlayer()?.pauseVideo?.(),
//     stopVideo: () => rp?.getInternalPlayer()?.stopVideo?.(),
//   };
// }