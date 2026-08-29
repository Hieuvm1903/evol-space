import { useEffect, useRef, useState } from "react";
import type { Track } from "../types";
import { splitArtistTitle } from "../utils/artist";
import {
  currentLineIndex, fetchLyrics, fetchLyricsCached, fetchLyricsByIdCached, LyricsCandidate,
} from "../lyricsProvider";

export type PersistLyricsSelection = (
  trackId: number,
  artistName: string | null,
  lyricsUrl: string,
) => void;

export function useLyrics(track: Track | undefined, curTime: number, onPersist: PersistLyricsSelection) {
  const [lyricsCandidates, setLyricsCandidates] = useState<LyricsCandidate[] | undefined>(undefined);
  const [selectedCandidateIdx, setSelectedCandidateIdx] = useState(0);
  const [manualTitle, setManualTitle] = useState("");
  const [manualArtist, setManualArtist] = useState("");
  const [manualSearching, setManualSearching] = useState(false);

  const autoCandidatesRef = useRef<LyricsCandidate[]>([]);
  const lastFetchKeyRef = useRef<string>("");
  const persistedCandidateIdRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const key = track ? track.video_id : "";
    if (key === lastFetchKeyRef.current) return;

    setLyricsCandidates(undefined);
    setSelectedCandidateIdx(0);
    autoCandidatesRef.current = [];
    if (!track) {
      lastFetchKeyRef.current = key;
      setManualTitle("");
      setManualArtist("");
      return;
    }

    let cancelled = false;
    const { artist: parsedArtist, title: parsedTitle } = splitArtistTitle(track.title);
    const fallbackArtist = track.artist || parsedArtist || undefined;
    setManualTitle(parsedTitle);
    setManualArtist(track.artist || parsedArtist || "");

    async function resolve() {
      if (track!.lyrics_url) {
        const saved = await fetchLyricsByIdCached(track!.lyrics_url);
        if (cancelled) return;
        if (saved) {
          lastFetchKeyRef.current = key;
          autoCandidatesRef.current = [saved];
          setLyricsCandidates([saved]);
          setSelectedCandidateIdx(0);
          persistedCandidateIdRef.current[key] = String(saved.id);
          return;
        }
      }

      const candidates = await fetchLyricsCached({ ...track!, artist: fallbackArtist });
      if (cancelled) return;
      lastFetchKeyRef.current = key;
      autoCandidatesRef.current = candidates;
      setLyricsCandidates(candidates);
      setSelectedCandidateIdx(0);
    }

    resolve();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.video_id]);

  async function runManualSearch() {
    const title = manualTitle.trim();
    if (!title) return;
    setManualSearching(true);
    try {
      const results = await fetchLyrics({
        title,
        artist: manualArtist.trim() || undefined,
        video_id: track?.video_id ?? "manual-search",
      });
      setLyricsCandidates([...results, ...autoCandidatesRef.current]);
      setSelectedCandidateIdx(0);
    } finally {
      setManualSearching(false);
    }
  }

  const selectedCandidate = lyricsCandidates?.[selectedCandidateIdx];
  const activeLineIdx = selectedCandidate ? currentLineIndex(selectedCandidate.lines, curTime) : -1;

  useEffect(() => {
    if (!selectedCandidate || !track || track.id == null) return;
    const key = track.video_id;
    const candidateKey = String(selectedCandidate.id);
    if (persistedCandidateIdRef.current[key] === candidateKey) return;

    persistedCandidateIdRef.current[key] = candidateKey;
    onPersist(track.id, selectedCandidate.artistName || null, candidateKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCandidate]);

  return {
    lyricsCandidates, selectedCandidateIdx, setSelectedCandidateIdx, selectedCandidate, activeLineIdx,
    manualTitle, setManualTitle, manualArtist, setManualArtist, manualSearching, runManualSearch,
  };
}
