import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const hasSupabaseConfig = Boolean(url && key);
// The gate prevents requests when configuration is missing, including at build time.
export const supabase = createClient(url || "http://127.0.0.1:54321", key || "not-configured");
export async function fetchMap(name: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in required");
  const response = await fetch(`/api/maps/${name}`, {
    headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store",
  });
  if (!response.ok) throw new Error("Map layer unavailable. Please sign in again or retry.");
  return response;
}
