import { supabase } from "./supabaseClient";
import type { EditState } from "./photoEditor";

export interface Photo {
  id: number;
  user_id: string;
  filename: string;                 // flattened/rendered image (gallery, download)
  original_filename: string | null; // untouched capture — null for photos saved before editing existed
  edit: EditState | null;           // editable layers
  caption: string;
  filter: string;
  time: string;
}

const BUCKET = "photos";

async function upload(userId: string, blob: Blob): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  return path;
}

export async function savePhoto(
  userId: string, originalBlob: Blob, renderedBlob: Blob, caption: string, edit: EditState,
): Promise<void> {
  const original = await upload(userId, originalBlob);
  const rendered = await upload(userId, renderedBlob);
  const { error } = await supabase.from("photos").insert({
    user_id: userId, filename: rendered, original_filename: original,
    caption, filter: edit.filter, edit,
  });
  if (error) throw error;
}

/** Re-saves an edited photo. Writes a NEW rendered file (no cache issues, no
 * storage update policy needed) then removes the old one. `legacyOriginal` is
 * only needed for photos that predate editing, so their base image is kept. */
export async function updatePhoto(
  photo: Photo, userId: string, renderedBlob: Blob, caption: string, edit: EditState, legacyOriginal?: Blob,
): Promise<void> {
  const newRendered = await upload(userId, renderedBlob);
  let original = photo.original_filename;
  if (!original && legacyOriginal) original = await upload(userId, legacyOriginal);

  const { error } = await supabase.from("photos")
    .update({ filename: newRendered, original_filename: original, caption, filter: edit.filter, edit })
    .eq("id", photo.id).eq("user_id", userId);
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([photo.filename]); // best-effort
}

export async function getPhotos(userId: string): Promise<Photo[]> {
  const { data, error } = await supabase
    .from("photos").select("*").eq("user_id", userId).order("id", { ascending: false });
  if (error) throw error;
  return data as Photo[];
}

export async function getPhotoUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
  if (error) return null;
  return data.signedUrl;
}

/** Downloads a stored image as a Blob (used to reopen a photo for editing). */
export async function downloadImage(storagePath: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  return data;
}

export async function deletePhoto(photo: Photo, userId: string): Promise<void> {
  const { error } = await supabase.from("photos").delete().eq("id", photo.id).eq("user_id", userId);
  if (error) throw error;
  const paths = [photo.filename, photo.original_filename].filter(Boolean) as string[];
  await supabase.storage.from(BUCKET).remove(paths); // best-effort
}