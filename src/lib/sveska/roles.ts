import type { Mode } from "./types";
import { getSupabase } from "./supabaseService";

/**
 * Subscription level of an account. Stored in `public.profiles.role`, readable by the
 * owner and writable only through the service role — a user cannot promote themselves.
 * Levels are hierarchical: paying for more never takes the simpler screens away.
 */
export type Role = Mode;

const RANK: Record<Role, number> = { solo: 0, tim: 1, zadruga: 2 };

export const DEFAULT_ROLE: Role = "solo";

export const ROLE_LABEL: Record<Role, string> = {
  solo: "SOLO",
  tim: "TIM",
  zadruga: "ZADRUGA",
};

const isRole = (v: unknown): v is Role => typeof v === "string" && v in RANK;

/** zadruga ⊃ tim ⊃ solo */
export const canAccess = (role: Role, mode: Mode) => RANK[role] >= RANK[mode];

/**
 * Reads the signed-in user's role; RLS returns only their own row.
 * Falls back to the lowest level when there is no backend, no session, or no row yet,
 * so a missing profile locks the app down rather than opening it up.
 */
export async function fetchRole(): Promise<Role> {
  const sb = getSupabase();
  if (!sb) return DEFAULT_ROLE;
  const { data, error } = await sb.from("profiles").select("role").maybeSingle();
  if (error || !data) return DEFAULT_ROLE;
  const role = (data as { role?: unknown }).role;
  return isRole(role) ? role : DEFAULT_ROLE;
}
