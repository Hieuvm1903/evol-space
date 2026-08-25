import { supabase } from "./supabaseClient";

export interface Place {
  id: number;
  user_id: string;
  name: string;
  lat: number;
  lon: number;
  description: string;
  icon: string;
  tags: string;
  time: string;
}

export async function getPlaces(userId: string): Promise<Place[]> {
  const { data, error } = await supabase
    .from("places").select("*").eq("user_id", userId).order("id", { ascending: false });
  if (error) throw error;
  return data as Place[];
}

export async function addPlace(
  userId: string, name: string, lat: number, lon: number,
  description: string, icon: string, tags = "",
): Promise<void> {
  const { error } = await supabase.from("places").insert({
    user_id: userId, name, lat, lon, description, icon, tags,
  });
  if (error) throw error;
}

export async function updatePlace(
  placeId: number, name: string, lat: number, lon: number,
  description: string, icon: string, tags = "",
): Promise<void> {
  const { error } = await supabase.from("places")
    .update({ name, lat, lon, description, icon, tags }).eq("id", placeId);
  if (error) throw error;
}

export async function deletePlace(placeId: number, userId: string): Promise<void> {
  const { error } = await supabase.from("places").delete().eq("id", placeId).eq("user_id", userId);
  if (error) throw error;
}

export function getAllTags(places: Place[]): string[] {
  const tags = new Set<string>();
  for (const p of places) {
    if (p.tags) p.tags.split(",").map((t) => t.trim()).filter(Boolean).forEach((t) => tags.add(t));
  }
  return Array.from(tags).sort();
}

// Haversine distance in km — same formula as map_page.py's _haversine_km.
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371.0;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
