import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.example to .env and fill them in."
  );
}
console.log({url,anonKey})

// persistSession + autoRefreshToken (both default true) give us the
// browser-side equivalent of the old "remember me" cookie for free —
// supabase-js stores the session in localStorage and refreshes it
// automatically, no manual cookie/token code needed like the Python side had.
export const supabase = createClient(url, anonKey);
