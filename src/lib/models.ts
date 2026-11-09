// src/lib/models.ts
import { supabase } from "./supabaseClient";

export async function getLatestModelSet(name = "warehouse") {
  const { data, error } = await supabase
    .from("model_sets").select("*").eq("name", name)
    .order("created_at", { ascending: false }).limit(1).single();
  if (error) throw error;
  const url = (file: string) =>
    supabase.storage.from("models").getPublicUrl(`${data.base_path}/${file}`).data.publicUrl;
  return {
    version: data.version,
    glb: (k: string) => url(data.files[k]),         // glb("robot")
    layout: async () => (await fetch(url(data.files.layout))).json(),
  };
}