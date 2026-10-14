import { getSupabase } from "./supabaseService";

/**
 * Organizacija i članstvo. Odvojeno od `roles.ts`: tamo je *nivo pretplate*
 * (solo/tim/zadruga), ovde je *uloga u organizaciji* (vlasnik/radnik).
 * Jedan nalog pripada tačno jednoj organizaciji.
 */
export type OrgRole = "owner" | "worker";

export interface Membership {
  orgId: string;
  orgRole: OrgRole;
  /** Za radnika: koji red iz `workers` je taj čovek. Vlasnik nema. */
  workerId: string | null;
}

const isOrgRole = (v: unknown): v is OrgRole => v === "owner" || v === "worker";

/**
 * Članstvo prijavljenog naloga, ili null ako ga još nema (nov vlasnički nalog).
 *
 * Ide kroz RPC, ne kroz direktan select: polisa na `org_members` pušta sve članove
 * organizacije (trebaće za spisak tima), pa bi select vraćao i vlasnika i radnika.
 */
export async function fetchMembership(): Promise<Membership | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("my_membership");
  if (error || !Array.isArray(data) || data.length === 0) return null;
  const row = data[0] as { org_id?: unknown; role?: unknown; worker_id?: unknown };
  if (typeof row.org_id !== "string" || !isOrgRole(row.role)) return null;
  return {
    orgId: row.org_id,
    orgRole: row.role,
    workerId: typeof row.worker_id === "string" ? row.worker_id : null,
  };
}

/** Vlasnički nalog bez organizacije dobija svoju. Idempotentno. */
export async function ensureOrg(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("ensure_org");
  if (error) throw new Error(error.message);
  return typeof data === "string" ? data : null;
}

/** Vlasnik pravi kod pozivnice za konkretnog radnika. */
export async function createInvite(workerId: string): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase nije konfigurisan.");
  const { data, error } = await sb.rpc("create_invite", { p_worker_id: workerId });
  if (error) throw new Error(error.message);
  if (typeof data !== "string") throw new Error("Neispravan odgovor servera.");
  return data;
}

export type RedeemResult = { ok: true } | { ok: false; message: string };

/** Radnik unosi kod i time ulazi u organizaciju. */
export async function redeemInvite(code: string): Promise<RedeemResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, message: "Supabase nije konfigurisan." };
  const { error } = await sb.rpc("redeem_invite", { p_code: code });
  return error ? { ok: false, message: error.message } : { ok: true };
}
