import { supabase } from "./supabaseClient";
import { fetchMetadata, fetchPlaylistVideos, normalizeUrl, extractVideoId } from "./youtube";
import type { Track } from "../features/player/types";

export interface Playlist {
  id: number;
  user_id: string;
  name: string;
  created_at: string;
}

export interface PlaylistTrack extends Track {
  position: number;
  original_title: string;
  youtube_url: string;
}

// ---------------------------------------------------------------------------
// Tracks (shared library)
// ---------------------------------------------------------------------------

export async function getAllTracks(): Promise<Track[]> {
  const { data, error } = await supabase.from("tracks").select("*").order("id", { ascending: false });
  if (error) throw error;
  return data as Track[];
}

// ---------------------------------------------------------------------------
// Playlists
// ---------------------------------------------------------------------------

export async function getPlaylists(userId: string): Promise<Playlist[]> {
  const { data, error } = await supabase
    .from("playlists").select("*").eq("user_id", userId).order("id", { ascending: false });
  if (error) throw error;
  return data as Playlist[];
}

export async function createPlaylist(userId: string, name: string): Promise<void> {
  const { error } = await supabase.from("playlists").insert({
    user_id: userId, name: name.trim() || "Untitled playlist",
  });
  if (error) throw error;
}

export async function renamePlaylist(playlistId: number, newName: string): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) return;
  const { error } = await supabase.from("playlists").update({ name: trimmed }).eq("id", playlistId);
  if (error) throw error;
}

export async function deletePlaylist(playlistId: number): Promise<void> {
  // playlist_tracks rows cascade-delete automatically (FK ON DELETE CASCADE).
  const { error } = await supabase.from("playlists").delete().eq("id", playlistId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Playlist <-> track links
// ---------------------------------------------------------------------------

async function nextPosition(playlistId: number): Promise<number> {
  const { data } = await supabase
    .from("playlist_tracks").select("position")
    .eq("playlist_id", playlistId).order("position", { ascending: false }).limit(1);
  return data && data.length ? data[0].position + 1 : 0;
}

export async function addTrackToPlaylist(playlistId: number, trackId: number): Promise<boolean> {
  const { data: existing } = await supabase
    .from("playlist_tracks").select("id")
    .eq("playlist_id", playlistId).eq("track_id", trackId);
  if (existing && existing.length) return false;

  const position = await nextPosition(playlistId);
  const { error } = await supabase.from("playlist_tracks").insert({
    playlist_id: playlistId, track_id: trackId, position,
  });
  if (error) throw error;
  return true;
}

export async function removeTrackFromPlaylist(playlistId: number, trackId: number): Promise<void> {
  const { error } = await supabase
    .from("playlist_tracks").delete()
    .eq("playlist_id", playlistId).eq("track_id", trackId);
  if (error) throw error;
}

export async function getPlaylistTracks(playlistId: number): Promise<PlaylistTrack[]> {
  const { data, error } = await supabase
    .from("playlist_tracks")
    .select("position, custom_title, tracks(*)")
    .eq("playlist_id", playlistId)
    .order("position");
  if (error) throw error;

  return (data ?? [])
    .filter((r: any) => r.tracks)
    .map((r: any) => {
      const custom = (r.custom_title ?? "").trim();
      return {
        ...r.tracks,
        position: r.position,
        original_title: r.tracks.title,
        title: custom || r.tracks.title,
      } as PlaylistTrack;
    });
}

// ---------------------------------------------------------------------------
// Add track (single link paste, or from search results) + attach
// ---------------------------------------------------------------------------

export async function addTrackAndAttach(
  playlistId: number,
  url: string,
  addedBy: string,
  known?: { title?: string; thumbnail_url?: string; artist?: string },
): Promise<{ ok: boolean; message: string; trackId?: number; wasAdded?: boolean }> {
  const normalized = normalizeUrl(url);
  if (!normalized) return { ok: false, message: "That doesn't look like a valid YouTube link." };
  const videoId = extractVideoId(normalized)!;

  const { data: existingRows } = await supabase
    .from("tracks").select("id, title").eq("video_id", videoId);

  let trackId: number;
  let title: string;

  if (existingRows && existingRows.length) {
    trackId = existingRows[0].id;
    title = existingRows[0].title;
  } else {
    let thumbnail = known?.thumbnail_url ?? "";
    let artist = known?.artist ?? "";
    title = known?.title ?? "";
    if (!title) {
      const meta = await fetchMetadata(normalized);
      title = meta.title || "Untitled track";
      thumbnail = thumbnail || meta.thumbnail_url || "";
      artist = artist || meta.author || "";
    }

    const { data: inserted, error } = await supabase.from("tracks").insert({
      title, artist, video_id: videoId, youtube_url: normalized,
      thumbnail_url: thumbnail, added_by: addedBy,
    }).select("id").single();
    if (error) throw error;
    trackId = inserted.id;
  }

  const wasAdded = await addTrackToPlaylist(playlistId, trackId);
  return { ok: true, message: `Added "${title}" to the playlist.`, trackId, wasAdded };
}

// ---------------------------------------------------------------------------
// Bulk import from a public YouTube playlist link
// ---------------------------------------------------------------------------

export interface ImportProgressItem {
  title: string;
  thumbnail_url?: string;
  ok: boolean;
  wasAdded: boolean;
}

export async function addPlaylistFromYoutube(
  playlistId: number, url: string, addedBy: string,
  onProgress?: (done: number, total: number, item: ImportProgressItem) => void,
): Promise<{ ok: boolean; message: string; added: number }> {
  const videos = await fetchPlaylistVideos(url);
  if (!videos.length) {
    return {
      ok: false, added: 0,
      message: "Couldn't read that playlist — make sure the link is public and includes a `list=...` id.",
    };
  }

  const seen = new Set<string>();
  const unique = videos.filter((v) => {
    if (!v.video_id || seen.has(v.video_id)) return false;
    seen.add(v.video_id);
    return true;
  });

  let added = 0;
  // Sequential, not batched — slower for huge playlists, but each track
  // lands in the playlist (and can be reported to the UI) one at a time,
  // instead of the old all-or-nothing batch insert that only surfaced a
  // single count at the very end with no incremental feedback.
  for (let i = 0; i < unique.length; i++) {
    const v = unique[i];
    const videoUrl = `https://www.youtube.com/watch?v=${v.video_id}`;
    let ok = false;
    let wasAdded = false;
    try {
      const result = await addTrackAndAttach(
        playlistId, videoUrl, addedBy,
        v.title ? { title: v.title, thumbnail_url: v.thumbnail_url } : undefined,
      );
      ok = result.ok;
      wasAdded = result.wasAdded ?? false;
      if (wasAdded) added++;
    } catch {
      ok = false;
    }
    onProgress?.(i + 1, unique.length, {
      title: v.title || "Untitled track",
      thumbnail_url: v.thumbnail_url,
      ok,
      wasAdded,
    });
  }

  if (added === 0) {
    return { ok: false, added: 0, message: "Every track in that playlist is already in this playlist." };
  }
  return { ok: true, added, message: `Added ${added} track(s) from the YouTube playlist.` };
}

// ---------------------------------------------------------------------------
// Cross-playlist copy
// ---------------------------------------------------------------------------

export async function copyPlaylistTracks(sourcePlaylistId: number, targetPlaylistId: number): Promise<number> {
  const sourceTracks = await getPlaylistTracks(sourcePlaylistId);
  if (!sourceTracks.length) return 0;
  const existingIds = new Set((await getPlaylistTracks(targetPlaylistId)).map((t) => t.id!));
  let added = 0;
  for (const t of sourceTracks) {
    if (!existingIds.has(t.id!)) {
      await addTrackToPlaylist(targetPlaylistId, t.id!);
      added++;
    }
  }
  return added;
}

// ---------------------------------------------------------------------------
// Per-playlist track title override
// ---------------------------------------------------------------------------

export async function renameTrackInPlaylist(playlistId: number, trackId: number, newTitle: string): Promise<void> {
  const trimmed = newTitle.trim();
  if (!trimmed) return;
  const { error } = await supabase
    .from("playlist_tracks").update({ custom_title: trimmed })
    .eq("playlist_id", playlistId).eq("track_id", trackId);
  if (error) throw error;
}

export async function resetTrackTitleInPlaylist(playlistId: number, trackId: number): Promise<void> {
  const { error } = await supabase
    .from("playlist_tracks").update({ custom_title: "" })
    .eq("playlist_id", playlistId).eq("track_id", trackId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Track details (artist / lyrics URL) — library-wide, same as the Now
// Playing widget's lyrics panel already does via PlayerProvider.
// ---------------------------------------------------------------------------

export async function updateTrackDetails(
  trackId: number, changes: { artist?: string; lyricsUrl?: string },
): Promise<void> {
  const payload: Record<string, string> = {};
  if (changes.artist !== undefined) payload.artist = changes.artist.trim();
  if (changes.lyricsUrl !== undefined) payload.lyrics_url = changes.lyricsUrl.trim();
  if (Object.keys(payload).length === 0) return;
  const { error } = await supabase.from("tracks").update(payload).eq("id", trackId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Export / import (share a playlist between accounts)
// ---------------------------------------------------------------------------

async function playlistName(playlistId: number): Promise<string> {
  const { data } = await supabase.from("playlists").select("name").eq("id", playlistId).single();
  return data?.name ?? "Untitled playlist";
}

export async function exportPlaylistJson(playlistId: number): Promise<string> {
  const name = await playlistName(playlistId);
  const tracks = await getPlaylistTracks(playlistId);
  return JSON.stringify({
    playlist_name: name,
    tracks: tracks.map((t) => ({ title: t.title, youtube_url: t.youtube_url })),
  }, null, 2);
}

export async function exportPlaylistText(playlistId: number): Promise<string> {
  const name = await playlistName(playlistId);
  const tracks = await getPlaylistTracks(playlistId);
  const lines = [`# ${name}`, ...tracks.map((t) => `${t.title} - ${t.youtube_url}`)];
  return lines.join("\n");
}

export async function importPlaylist(
  userId: string, raw: string,
): Promise<{ ok: boolean; message: string; added: number }> {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, message: "Nothing to import.", added: 0 };

  let name: string | null = null;
  const entries: { title: string | null; url: string }[] = [];

  let parsed: any = null;
  try { parsed = JSON.parse(trimmed); } catch { parsed = null; }

  if (parsed && typeof parsed === "object" && Array.isArray(parsed.tracks)) {
    name = parsed.playlist_name || "Imported playlist";
    for (const t of parsed.tracks) {
      const url = t.youtube_url || t.url;
      if (url) entries.push({ title: t.title ?? null, url });
    }
  } else {
    for (const rawLine of trimmed.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith("#")) {
        if (name === null) name = line.replace(/^#+/, "").trim();
        continue;
      }
      const sepIdx = line.lastIndexOf(" - ");
      if (sepIdx !== -1) {
        entries.push({ title: line.slice(0, sepIdx).trim(), url: line.slice(sepIdx + 3).trim() });
      } else {
        entries.push({ title: null, url: line });
      }
    }
  }

  if (entries.length === 0) return { ok: false, message: "Couldn't find any tracks to import in that text.", added: 0 };

  const finalName = name || "Imported playlist";
  await createPlaylist(userId, finalName);
  const playlists = await getPlaylists(userId);
  const playlistId = playlists[0].id; // most recently created

  let added = 0;
  for (const entry of entries) {
    const result = await addTrackAndAttach(playlistId, entry.url, userId, entry.title ? { title: entry.title } : undefined);
    if (result.ok) added++;
  }

  if (added === 0) {
    await deletePlaylist(playlistId);
    return { ok: false, message: "Couldn't import any valid tracks from that text.", added: 0 };
  }
  return { ok: true, message: `Imported "${finalName}" with ${added} track(s).`, added };
}
