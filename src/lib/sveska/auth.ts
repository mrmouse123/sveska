import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "./supabaseService";

/** Thin wrapper over supabase.auth so components never touch the client directly. */

export type AuthResult = { ok: true; needsEmailConfirm?: boolean } | { ok: false; message: string };

const NO_BACKEND = "Supabase nije konfigurisan (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).";

export async function getSession(): Promise<Session | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
}

export function onAuthChange(cb: (session: Session | null) => void): () => void {
  const sb = getSupabase();
  if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, message: NO_BACKEND };
  const { error } = await sb.auth.signInWithPassword({ email, password });
  return error ? { ok: false, message: translate(error.message) } : { ok: true };
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, message: NO_BACKEND };
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) return { ok: false, message: translate(error.message) };
  // With "Confirm email" on, Supabase returns a user but no session until the link is clicked.
  return { ok: true, needsEmailConfirm: !data.session };
}

export async function signOut(): Promise<void> {
  await getSupabase()?.auth.signOut();
}

function translate(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "Pogrešan email ili lozinka.";
  if (m.includes("email not confirmed")) return "Email nije potvrđen — proveri poštu.";
  if (m.includes("already registered")) return "Nalog sa tim emailom već postoji.";
  if (m.includes("password") && m.includes("at least")) return "Lozinka mora imati bar 6 karaktera.";
  if (m.includes("rate limit")) return "Previše pokušaja, sačekaj minut.";
  return msg;
}
