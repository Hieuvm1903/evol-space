import { supabase } from "./supabaseClient";

export interface Photo {
  id: number;
  user_id: string;
  filename: string;
  caption: string;
  filter: string;
  time: string;
}

const BUCKET = "photos";

export async function savePhoto(userId: string, blob: Blob, caption: string, filterName: string): Promise<void> {
  const filename = `${crypto.randomUUID()}.jpg`;
  const storagePath = `${userId}/${filename}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET).upload(storagePath, blob, { contentType: "image/jpeg" });
  if (uploadError) throw uploadError;

  const { error } = await supabase.from("photos").insert({
    user_id: userId, filename: storagePath, caption, filter: filterName,
  });
  if (error) throw error;
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

export async function deletePhoto(photoId: number, userId: string, storagePath: string): Promise<void> {
  const { error } = await supabase.from("photos").delete().eq("id", photoId).eq("user_id", userId);
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([storagePath]); // best-effort, row's gone either way
}
