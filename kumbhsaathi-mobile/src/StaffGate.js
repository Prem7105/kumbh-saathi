import { useEffect, useState } from "react";
import { ActivityIndicator, Button, SafeAreaView, Text, TextInput, View } from "react-native";
import { hasSupabaseConfig, setVolunteerIdentity, supabase } from "./supabase";

export default function StaffGate({ children }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(!hasSupabaseConfig);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setVolunteerIdentity(next?.user?.id || "");
      setSession(next); setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);
  if (!hasSupabaseConfig) return children;
  if (!ready) return <SafeAreaView><ActivityIndicator accessibilityLabel="Checking session" /></SafeAreaView>;
  const allowed = ["volunteer", "organiser"].includes(session?.user?.app_metadata?.staff_role);
  if (allowed) return <View style={{ flex: 1 }}>{children}<Button title="Sign out" onPress={() => supabase.auth.signOut()} /></View>;
  async function signIn() {
    setBusy(true); setError("");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setError(error.message); else setPassword("");
    } catch { setError("Unable to connect. Please try again."); }
    finally { setBusy(false); }
  }
  return <SafeAreaView style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#fff7ed" }}>
    <Text style={{ fontSize: 26, fontWeight: "bold", marginBottom: 16 }}>Kumbh Saathi staff sign-in</Text>
    {session ? <><Text>Your account needs volunteer or organiser access. Contact your administrator.</Text><Button title="Sign out" onPress={() => supabase.auth.signOut()} /></>
      : <>
        <Text>Email</Text><TextInput accessibilityLabel="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={{ padding: 12, borderWidth: 1, marginBottom: 12 }} />
        <Text>Password</Text><TextInput accessibilityLabel="Password" secureTextEntry value={password} onChangeText={setPassword} style={{ padding: 12, borderWidth: 1, marginBottom: 12 }} />
        {!!error && <Text accessibilityRole="alert" style={{ color: "#b91c1c", marginBottom: 12 }}>{error}</Text>}
        <Button title={busy ? "Signing in…" : "Sign in"} disabled={busy || !email || !password} onPress={signIn} />
      </>}
  </SafeAreaView>;
}
