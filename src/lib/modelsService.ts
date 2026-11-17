import { supabase } from "./supabaseClient";
import type { ModelSetRow } from "./workTypes";
import { DEMO_LAYOUT, DEMO_MODEL_SET } from "../pages/work/proceduralTwin";

const BUCKET = "models";

export async function listModelSets(limit = 30): Promise<ModelSetRow[]> {
  try {
    const { data, error } = await supabase
      .from("model_sets").select("*").order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    const rows = (data as ModelSetRow[]) ?? [];
    return [...rows, DEMO_MODEL_SET];
  } catch {
    return [DEMO_MODEL_SET];
  }
}

export async function getModelSet(name: string, version: string): Promise<ModelSetRow | null> {
  if (name === DEMO_MODEL_SET.name && version === DEMO_MODEL_SET.version) {
    return DEMO_MODEL_SET;
  }
  const { data, error } = await supabase
    .from("model_sets").select("*").eq("name", name).eq("version", version).maybeSingle();
  if (error) throw error;
  return (data as ModelSetRow) ?? null;
}

export function fileUrl(set: ModelSetRow, key: string): string {
  if (set.base_path.startsWith("procedural://")) {
    return `${set.base_path}/${set.files[key]}`;
  }
  return supabase.storage.from(BUCKET).getPublicUrl(`${set.base_path}/${set.files[key]}`).data.publicUrl;
}

/** Keys of the 3D assets in a set (rack, tote, robot, ...) — layout.json is excluded. */
export function meshAssets(set: ModelSetRow | null): string[] {
  if (!set) return [];
  if (set.base_path.startsWith("procedural://")) {
    return Object.keys(set.files).filter((k) => k !== "layout");
  }
  return Object.entries(set.files).filter(([, f]) => f.endsWith(".glb")).map(([k]) => k);
}

export async function fetchLayout(set: ModelSetRow): Promise<any | null> {
  if (set.base_path.startsWith("procedural://")) return DEMO_LAYOUT;
  if (!set.files.layout) return null;
  const res = await fetch(fileUrl(set, "layout"));
  return res.ok ? res.json() : null;
}
