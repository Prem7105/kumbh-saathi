import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";

const allowed = new Set(["cctv-official.geojson", "police-official.geojson", "chokepoints-official.geojson"]);
export async function GET(request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  if (!allowed.has(name)) return new Response("Not found", { status: 404 });
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return new Response("Sign in required", { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return new Response("Setup incomplete", { status: 503 });
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return new Response("Invalid session", { status: 401 });
  if (data.user.app_metadata.staff_role !== "organiser") return new Response("Organiser access required", { status: 403 });
  const content = await readFile(path.join(process.cwd(), "private-assets", "maps", name), "utf8");
  return new Response(content, { headers: { "Content-Type": "application/geo+json", "Cache-Control": "private, no-store" } });
}
