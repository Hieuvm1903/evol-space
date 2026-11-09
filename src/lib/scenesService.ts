import { supabase } from "./supabaseClient";
import type { ModelSetRow, SceneDoc, SceneRow, SceneSummary } from "./workTypes";

export async function listScenes(userId: string): Promise<SceneSummary[]> {
  const { data, error } = await supabase
    .from("scenes").select("id, name, model_set_name, model_set_version, updated_at")
    .eq("user_id", userId).order("updated_at", { ascending: false });
  if (error) throw error;
  return data as SceneSummary[];
}

export async function getScene(id: number): Promise<SceneRow> {
  const { data, error } = await supabase.from("scenes").select("*").eq("id", id).single();
  if (error) throw error;
  return data as SceneRow;
}

/** Insert when `id` is null, otherwise update. Returns the saved row. */
export async function saveScene(args: {
  id: number | null; userId: string; name: string; set: ModelSetRow; doc: SceneDoc;
}): Promise<SceneRow> {
  const payload = {
    name: args.name,
    model_set_name: args.set.name,
    model_set_version: args.set.version,
    data: args.doc,
    updated_at: new Date().toISOString(),
  };
  const q = args.id === null
    ? supabase.from("scenes").insert({ ...payload, user_id: args.userId })
    : supabase.from("scenes").update(payload).eq("id", args.id);
  const { data, error } = await q.select("*").single();
  if (error) throw error;
  return data as SceneRow;
}

export async function deleteScene(id: number): Promise<void> {
  const { error } = await supabase.from("scenes").delete().eq("id", id);
  if (error) throw error;
}
