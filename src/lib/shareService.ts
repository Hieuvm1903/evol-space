import { supabase } from "./supabaseClient";

export type ShareKind = "album" | "places";

export function newShareToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}
export function shareUrl(kind: ShareKind, token: string): string {
  return `${window.location.origin}/share/${kind}/${token}`;
}

export interface SharedTrack {
  title: string;
  artist: string | null;
  video_id: string;
  thumbnail_url: string | null;
  youtube_url: string | null;
}
export interface SharedPlaylist { name: string; owner: string; tracks: SharedTrack[] }

export async function setPlaylistShareToken(playlistId: number, token: string | null): Promise<void> {
  const { error } = await supabase.from("playlists").update({ share_token: token }).eq("id", playlistId);
  if (error) throw error;
}

export async function fetchSharedPlaylist(token: string): Promise<SharedPlaylist | null> {
  const { data, error } = await supabase.rpc("get_shared_playlist", { p_token: token });
  if (error) throw error;
  return (data as SharedPlaylist | null) ?? null;
}

export async function importSharedPlaylist(token: string): Promise<number> {
  const { data, error } = await supabase.rpc("import_shared_playlist", { p_token: token });
  if (error) throw error;
  return data as number;
}