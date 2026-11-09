import { supabase } from "./supabaseClient";
import type { ModelSetRow } from "./workTypes";

const BUCKET = "models";

export async function listModelSets(limit = 30): Promise<ModelSetRow[]> {
  const { data, error } = await supabase
    .from("model_sets").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data as ModelSetRow[];
}

export async function getModelSet(name: string, version: string): Promise<ModelSetRow | null> {
  const { data, error } = await supabase
    .from("model_sets").select("*").eq("name", name).eq("version", version).maybeSingle();
  if (error) throw error;
  return (data as ModelSetRow) ?? null;
}

export function fileUrl(set: ModelSetRow, key: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(`${set.base_path}/${set.files[key]}`).data.publicUrl;
}

/** Keys of the .glb files in a set (rack, tote, robot, ...) — layout.json is excluded. */
export function meshAssets(set: ModelSetRow | null): string[] {
  if (!set) return [];
  return Object.entries(set.files).filter(([, f]) => f.endsWith(".glb")).map(([k]) => k);
}

export async function fetchLayout(set: ModelSetRow): Promise<any | null> {
  if (!set.files.layout) return null;
  const res = await fetch(fileUrl(set, "layout"));
  return res.ok ? res.json() : null;
}
