"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";

export default function StaffGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!hasSupabaseConfig) { setReady(true); return; }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next); setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);
  async function signIn(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setError(error.message);
      else setPassword("");
    } catch { setError("Unable to connect. Please try again."); }
    finally { setBusy(false); }
  }
  if (!ready) return <main className="p-8">Checking staff session…</main>;
  if (session?.user.app_metadata?.staff_role === "organiser") return <>{children}</>;
  return <main className="min-h-screen bg-orange-50 flex items-center justify-center p-6">
    <section className="w-full max-w-md bg-white border-2 border-black p-8 shadow-lg">
      <p className="text-sm font-bold text-orange-700">KUMBH SAATHI</p>
      <h1 className="text-2xl font-black mt-2 mb-3">Command center sign-in</h1>
      {!hasSupabaseConfig ? <p>Setup is incomplete. Configure the Supabase URL and public key, then restart the app.</p>
        : session ? <><p>This account needs organiser access. Contact your administrator.</p><button className="neo-btn mt-4 p-3" onClick={() => supabase.auth.signOut()}>Sign out</button></>
        : <form onSubmit={signIn} className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">Use the staff account provided by your organiser.</p>
          <label>Email<input className="block w-full border p-3" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label>Password<input className="block w-full border p-3" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
          {error && <p role="alert" className="text-red-700">{error}</p>}
          <button disabled={busy} className="neo-btn bg-black text-white p-3">{busy ? "Signing in…" : "Sign in"}</button>
        </form>}
    </section>
  </main>;
}
