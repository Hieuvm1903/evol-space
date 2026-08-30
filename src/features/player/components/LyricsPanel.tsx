import React, { useEffect, useRef, useState } from "react";
import { Search, FileText, Loader2 } from "lucide-react";
import type { Track } from "../types";
import type { useLyrics } from "../hooks/useLyrics";
import { formatTime } from "../utils/time";
import BlurText from "../../../components/BlurText";
import GradientText from "../../../components/GradientText";

interface Props {
  visible: boolean;
  track: Track;
  lyrics: ReturnType<typeof useLyrics>;
  onSeek: (time: number) => void;
}

export default function LyricsPanel({ visible, track, lyrics, onSeek }: Props) {
  const {
    lyricsCandidates, selectedCandidateIdx, setSelectedCandidateIdx, selectedCandidate,
    activeLineIdx, manualTitle, setManualTitle, manualArtist, setManualArtist,
    manualSearching, runManualSearch,
  } = lyrics;

  const viewportRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef<HTMLDivElement>(null);

  // Which line index has finished its BlurText entrance and should now
  // render as the sustained GradientText shimmer instead.
  const [revealedIdx, setRevealedIdx] = useState<number | null>(null);

  // Reset the reveal state whenever the active line (or the whole
  // candidate) changes, so the new active line replays the BlurText
  // entrance rather than snapping straight to the gradient.
  useEffect(() => {
    setRevealedIdx(null);
  }, [activeLineIdx, selectedCandidate]);

  // Karaoke-style centering: keep the active line pinned at the
  // viewport's vertical center by translating the whole line list.
  useEffect(() => {
    if (!visible) return;

    function recenter() {
      const viewport = viewportRef.current;
      const linesEl = linesRef.current;
      if (!viewport || !linesEl) return;

      // Panel was `display:none` until just now (or hasn't laid out
      // yet) — offsetHeight would be 0 and produce a bogus transform.
      // Retry next frame instead of baking in a wrong jump.
      if (viewport.offsetHeight === 0) {
        requestAnimationFrame(recenter);
        return;
      }

      const idx = activeLineIdx >= 0 ? activeLineIdx : 0;
      const activeEl = linesEl.querySelector(`[data-line-idx="${idx}"]`) as HTMLElement | null;
      if (!activeEl) { linesEl.style.transform = "translateY(0px)"; return; }
      const offsetY = viewport.offsetHeight / 2 - (activeEl.offsetTop + activeEl.offsetHeight / 2);
      linesEl.style.transform = `translateY(${offsetY}px)`;
    }

    recenter();
  }, [visible, activeLineIdx, selectedCandidate]);

  return (
    <div className="lyrics-panel" style={{ display: visible ? "flex" : "none" }}>
      <div className="lyrics-search-row">
        <input
          className="np-input"
          placeholder="Song name"
          value={manualTitle}
          onChange={(e) => setManualTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") runManualSearch(); }}
        />
        <input
          className="np-input"
          placeholder="Artist (optional)"
          value={manualArtist}
          onChange={(e) => setManualArtist(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") runManualSearch(); }}
        />
        <button
          type="button"
          className="np-icon-btn"
          onClick={runManualSearch}
          disabled={!manualTitle.trim() || manualSearching}
          aria-label="Search lyrics"
        >
          {manualSearching ? <Loader2 size={13} className="np-spin" /> : <Search size={13} />}
        </button>
      </div>

      {lyricsCandidates && lyricsCandidates.length > 1 && (
        <select
          className="np-select lyrics-candidate-select"
          value={selectedCandidateIdx}
          onChange={(e) => setSelectedCandidateIdx(parseInt(e.target.value, 10))}
        >
          {lyricsCandidates.map((c, idx) => (
            <option key={idx} value={idx}>
              {c.artistName ? `${c.trackName} — ${c.artistName}` : c.trackName}
            </option>
          ))}
        </select>
      )}

      {lyricsCandidates === undefined && (
        <div className="lyrics-empty">
          <div className="lyrics-spinner" />
          <p>Loading lyrics…</p>
        </div>
      )}

      {lyricsCandidates && lyricsCandidates.length === 0 && (
        <div className="lyrics-empty">
          <FileText size={22} color="#3a3a3a" style={{ marginBottom: 8 }} />
          <p>No lyrics found.</p>
          <p className="lyrics-track-title">{track.title}</p>
          <div className="lyrics-links">
            <a href={`https://genius.com/search?q=${encodeURIComponent(track.title)}`} target="_blank" rel="noreferrer">
              Search Genius ↗
            </a>
            <a href={`https://www.musixmatch.com/search?query=${encodeURIComponent(track.title)}`} target="_blank" rel="noreferrer">
              Search Musixmatch ↗
            </a>
          </div>
        </div>
      )}

      {selectedCandidate && selectedCandidate.lines.length > 0 && (
        <div className="lyrics-viewport" ref={viewportRef}>
          {/* Static highlight box, always centered — frames whichever
              line the translateY math above has pinned to the middle. */}
          <div className="lyrics-active-frame" aria-hidden="true" />

          <div className="lyrics-lines" ref={linesRef}>
            {selectedCandidate.lines.map((line, i) => {
              const distance = activeLineIdx < 0 ? 0 : Math.abs(i - activeLineIdx);
              const isActive = i === activeLineIdx;
              return (
                <div
                  key={i}
                  data-line-idx={i}
                  data-time={formatTime(line.time)}
                  className={`lyrics-line${isActive ? " lyrics-line-active" : ""}`}
                  style={{ opacity: Math.max(1 - distance * 0.18, 0.28) }}
                  onClick={() => onSeek(line.time)}
                >
                  {isActive ? (
                    revealedIdx === i ? (
                      <GradientText
                        colors={["#8b6ff5", "#22d3ee", "#8b6ff5"]}
                        animationSpeed={3}
                        className="lyrics-gradient-text"
                      >
                        {line.text}
                      </GradientText>
                    ) : (
                      <BlurText
                        key={i}
                        text={line.text}
                        animateBy="words"
                        direction="top"
                        delay={40}
                        stepDuration={0.35}
                        className="lyrics-gradient-text"
                        onAnimationComplete={() => setRevealedIdx(i)}
                      />
                    )
                  ) : (
                    line.text
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}