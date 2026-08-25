import { supabase } from "./supabaseClient";

export interface VideoMeta {
  title?: string;
  author?: string;
  thumbnail_url?: string;
}

export interface PlaylistVideo {
  video_id: string;
  title: string;
  thumbnail_url: string;
}

export interface SearchSongResult {
  video_id: string;
  title: string;
  artist: string;
  thumbnail_url: string;
  duration: string;
}

export interface SearchPlaylistResult {
  playlist_id: string;
  title: string;
  author: string;
  item_count: string | number;
  thumbnail_url: string;
}

async function callProxy<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("youtube-proxy", { body });
  if (error) throw error;
  return data as T;
}

// Client-side mirror of the same regex in the Python/Deno versions — used
// for instant validation before making a network round-trip.
const VIDEO_ID_RE = /(?:v=|\/embed\/|\/shorts\/|youtu\.be\/)([A-Za-z0-9_-]{11})/;

export function extractVideoId(url: string): string | null {
  const m = url.match(VIDEO_ID_RE);
  return m ? m[1] : null;
}

export function normalizeUrl(url: string): string | null {
  const id = extractVideoId(url.trim());
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

export function extractPlaylistId(url: string): string | null {
  const m = url.match(/[?&]list=([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

export async function fetchMetadata(url: string): Promise<VideoMeta> {
  return callProxy<VideoMeta>({ action: "metadata", url });
}

export async function fetchPlaylistVideos(url: string): Promise<PlaylistVideo[]> {
  return callProxy<PlaylistVideo[]>({ action: "playlist", url });
}

export async function searchSongs(query: string): Promise<SearchSongResult[]> {
  if (!query.trim()) return [];
  return callProxy<SearchSongResult[]>({ action: "search", query });
}

export async function searchPlaylists(query: string): Promise<SearchPlaylistResult[]> {
  if (!query.trim()) return [];
  return callProxy<SearchPlaylistResult[]>({ action: "search-playlists", query });
}
