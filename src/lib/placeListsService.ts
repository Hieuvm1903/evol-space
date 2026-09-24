import { supabase } from "./supabaseClient";

export interface PlaceList {
  id: number;
  user_id: string;
  name: string;
  description: string;
  share_token: string | null;
  created_at: string;
  place_ids: number[]; // ordered
}

export interface SharedPlace {
  name: string; lat: number; lon: number; description: string; icon: string; tags: string;
}
export interface SharedPlaceList { name: string; description: string; owner: string; places: SharedPlace[] }

export async function getPlaceLists(userId: string): Promise<PlaceList[]> {
  const { data, error } = await supabase
    .from("place_lists").select("*, place_list_items(place_id, position)")
    .eq("user_id", userId).order("id", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((l: any) => ({
    ...l,
    place_ids: [...(l.place_list_items ?? [])]
      .sort((a: any, b: any) => a.position - b.position)
      .map((i: any) => i.place_id),
  }));
}

async function writeItems(listId: number, placeIds: number[]) {
  const { error: delErr } = await supabase.from("place_list_items").delete().eq("list_id", listId);
  if (delErr) throw delErr;
  if (!placeIds.length) return;
  const { error } = await supabase.from("place_list_items").insert(
    placeIds.map((place_id, position) => ({ list_id: listId, place_id, position })),
  );
  if (error) throw error;
}

export async function createPlaceList(userId: string, name: string, description: string, placeIds: number[]) {
  const { data, error } = await supabase.from("place_lists")
    .insert({ user_id: userId, name: name.trim() || "Untitled list", description: description.trim() })
    .select("id").single();
  if (error) throw error;
  await writeItems(data.id, placeIds);
}

export async function updatePlaceList(listId: number, name: string, description: string, placeIds: number[]) {
  const { error } = await supabase.from("place_lists")
    .update({ name: name.trim() || "Untitled list", description: description.trim() }).eq("id", listId);
  if (error) throw error;
  await writeItems(listId, placeIds);
}

export async function deletePlaceList(listId: number) {
  const { error } = await supabase.from("place_lists").delete().eq("id", listId);
  if (error) throw error;
}

export async function setListShareToken(listId: number, token: string | null) {
  const { error } = await supabase.from("place_lists").update({ share_token: token }).eq("id", listId);
  if (error) throw error;
}

export async function fetchSharedPlaceList(token: string): Promise<SharedPlaceList | null> {
  const { data, error } = await supabase.rpc("get_shared_place_list", { p_token: token });
  if (error) throw error;
  return (data as SharedPlaceList | null) ?? null;
}

export async function importSharedPlaceList(token: string): Promise<number> {
  const { data, error } = await supabase.rpc("import_shared_place_list", { p_token: token });
  if (error) throw error;
  return data as number;
}