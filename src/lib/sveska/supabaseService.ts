import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Customer, DemoState, Job, MixedTeam, Team, Worker } from "./types";

/**
 * Supabase Service — background persistence for SVESKA.
 *
 * Contract: SQL uses snake_case columns; app domain types use camelCase.
 * This module owns the mapping — nothing outside it speaks snake_case.
 *
 * Config: VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in .env.
 * Without them the app runs in local demo mode (localStorage only).
 */

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = (import.meta.env["VITE_SUPABASE_URL"] as string | undefined)?.trim();
  const anonKey = (import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined)?.trim();
  if (!url || !anonKey) return null;

  // Oblik se proverava ovde, jer pokvarena vrednost inače stiže do `fetch`-a kao
  // HTTP zaglavlje i ruši ga sa „Failed to execute 'fetch' on 'Window': Invalid
  // value" — poruka iz koje se ne vidi šta je uzrok. Desilo se u produkciji:
  // u tajnu je ušao ceo blok sa URL-om i prelomom reda umesto samog ključa.
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) {
    console.error(`[sveska] VITE_SUPABASE_URL ne liči na Supabase adresu: ${JSON.stringify(url.slice(0, 60))}`);
    return null;
  }
  if (!/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(anonKey)) {
    console.error(
      `[sveska] VITE_SUPABASE_ANON_KEY nije JWT (dužina ${anonKey.length}, počinje sa ${JSON.stringify(anonKey.slice(0, 6))}). ` +
        "Očekuje se jedan red oblika eyJ….….…, bez URL-a i bez preloma reda.",
    );
    return null;
  }
  return { url: url.replace(/\/$/, ""), anonKey };
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const cfg = getSupabaseConfig();
  if (!cfg) return null;
  client = createClient(cfg.url, cfg.anonKey);
  return client;
}

/* ---------- camelCase → snake_case rows ---------- */

const workerRow = (uid: string, org: string) => (w: Worker) => ({
  user_id: uid,
  org_id: org,
  id: w.id,
  name: w.name,
  role: w.role,
  trade: w.trade,
  team_id: w.teamId ?? null,
});

const teamRow = (uid: string, org: string) => (t: Team) => ({ user_id: uid, org_id: org, id: t.id, name: t.name, member_ids: t.memberIds });

const mixedTeamRow = (uid: string, org: string) => (t: MixedTeam) => ({
  user_id: uid,
  org_id: org,
  id: t.id,
  name: t.name,
  project: t.project,
  created_at: t.createdAt,
});

const mixedTeamMemberRows = (uid: string, org: string) => (t: MixedTeam) =>
  t.members.map((m) => ({
    user_id: uid,
    org_id: org,
    mixed_team_id: t.id,
    worker_id: m.workerId,
    responsibility: m.responsibility,
  }));

const customerRow = (uid: string, org: string) => (c: Customer) => ({
  user_id: uid,
  org_id: org,
  id: c.id,
  name: c.name,
  phone: c.phone,
  email: c.email,
  address: c.address,
  notes: c.notes,
});

const jobRow = (uid: string, org: string) => (j: Job) => ({
  user_id: uid,
  org_id: org,
  id: j.id,
  scope: j.scope,
  customer_id: j.customerId,
  description: j.description,
  date: j.date,
  time: j.time,
  location: j.location,
  price: j.price,
  status: j.status,
  paid: j.paid,
  assignee_type: j.assigneeType,
  assignee_id: j.assigneeId ?? null,
  notes: j.notes ?? null,
});

/**
 * Upserts the whole demo state. Order respects FK dependencies:
 * teams before workers (workers.team_id), everything before jobs, mixed_teams before members.
 * Throws on the first failing table.
 */
const PK = { onConflict: "user_id,id" };

async function writeState(sb: SupabaseClient, uid: string, org: string, state: DemoState): Promise<void> {
  const steps: [string, () => PromiseLike<{ error: { message: string } | null }>][] = [
    ["teams", () => sb.from("teams").upsert(state.teams.map(teamRow(uid, org)), PK)],
    ["workers", () => sb.from("workers").upsert(state.workers.map(workerRow(uid, org)), PK)],
    ["customers", () => sb.from("customers").upsert(state.customers.map(customerRow(uid, org)), PK)],
    ["mixed_teams", () => sb.from("mixed_teams").upsert(state.mixedTeams.map(mixedTeamRow(uid, org)), PK)],
    ["jobs", () => sb.from("jobs").upsert(state.jobs.map(jobRow(uid, org)), PK)],
  ];
  for (const [table, run] of steps) {
    const { error } = await run();
    if (error) throw new Error(`${table}: ${error.message}`);
  }

  // Members have a surrogate uuid PK, so replace per team instead of upserting.
  const teamIds = state.mixedTeams.map((t) => t.id);
  if (teamIds.length) {
    const del = await sb.from("mixed_team_members").delete().in("mixed_team_id", teamIds);
    if (del.error) throw new Error(`mixed_team_members: ${del.error.message}`);
    const rows = state.mixedTeams.flatMap(mixedTeamMemberRows(uid, org));
    if (rows.length) {
      const ins = await sb.from("mixed_team_members").insert(rows);
      if (ins.error) throw new Error(`mixed_team_members: ${ins.error.message}`);
    }
  }
}

let inFlight: Promise<void> | null = null;
let queued: { uid: string; org: string; state: DemoState } | null = null;

/**
 * Public entry: serialises writes so two syncs never interleave. If a sync is
 * already running, the newest state is parked and written once it finishes
 * (intermediate states are dropped — only the latest matters).
 * No-op when Supabase isn't configured.
 */
export function syncStateToSupabase(uid: string, org: string, state: DemoState): Promise<void> {
  const sb = getSupabase();
  if (!sb) return Promise.resolve();
  queued = { uid, org, state }; // the newest state always supersedes anything parked
  if (inFlight) return inFlight;
  inFlight = (async () => {
    let failure: unknown = null;
    try {
      while (queued) {
        const current = queued;
        queued = null;
        try {
          await writeState(sb, current.uid, current.org, current.state);
        } catch (err) {
          // Do not abandon a newer state that is already waiting: finish the queue
          // first, then report the failure to the caller.
          failure ??= err;
        }
      }
    } finally {
      inFlight = null;
    }
    if (failure) throw failure;
  })();
  return inFlight;
}

/* ---------- snake_case rows → DemoState ---------- */

type Row = Record<string, unknown>;
const str = (r: Row, k: string) => (r[k] == null ? "" : String(r[k]));

/**
 * Reads the signed-in user's data. Returns null when the user has no rows yet
 * (fresh account) so the caller can seed demo data. Notifications are local-only.
 */
export async function loadStateFromSupabase(): Promise<Omit<DemoState, "notifications"> | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const [teams, workers, customers, mixedTeams, members, jobs] = await Promise.all([
    sb.from("teams").select("*"),
    sb.from("workers").select("*"),
    sb.from("customers").select("*"),
    sb.from("mixed_teams").select("*"),
    sb.from("mixed_team_members").select("*"),
    sb.from("jobs").select("*"),
  ]);
  for (const r of [teams, workers, customers, mixedTeams, members, jobs]) {
    if (r.error) throw new Error(r.error.message);
  }
  const all = [teams, workers, customers, mixedTeams, jobs].reduce((n, r) => n + (r.data?.length ?? 0), 0);
  if (all === 0) return null;

  const membersByTeam = new Map<string, { workerId: string; responsibility: string }[]>();
  for (const m of (members.data ?? []) as Row[]) {
    const key = str(m, "mixed_team_id");
    membersByTeam.set(key, [
      ...(membersByTeam.get(key) ?? []),
      { workerId: str(m, "worker_id"), responsibility: str(m, "responsibility") },
    ]);
  }

  return {
    teams: ((teams.data ?? []) as Row[]).map((r) => ({
      id: str(r, "id"),
      name: str(r, "name"),
      memberIds: (r["member_ids"] as string[] | null) ?? [],
    })),
    workers: ((workers.data ?? []) as Row[]).map((r) => ({
      id: str(r, "id"),
      name: str(r, "name"),
      role: str(r, "role"),
      trade: str(r, "trade"),
      teamId: r["team_id"] == null ? undefined : String(r["team_id"]),
    })),
    customers: ((customers.data ?? []) as Row[]).map((r) => ({
      id: str(r, "id"),
      name: str(r, "name"),
      phone: str(r, "phone"),
      email: str(r, "email"),
      address: str(r, "address"),
      notes: str(r, "notes"),
    })),
    mixedTeams: ((mixedTeams.data ?? []) as Row[]).map((r) => ({
      id: str(r, "id"),
      name: str(r, "name"),
      project: str(r, "project"),
      createdAt: str(r, "created_at"),
      members: membersByTeam.get(str(r, "id")) ?? [],
    })),
    jobs: ((jobs.data ?? []) as Row[]).map((r) => ({
      id: str(r, "id"),
      scope: str(r, "scope") as Job["scope"],
      customerId: str(r, "customer_id"),
      description: str(r, "description"),
      date: str(r, "date"),
      time: str(r, "time"),
      location: str(r, "location"),
      price: Number(r["price"] ?? 0),
      status: str(r, "status") as Job["status"],
      paid: Boolean(r["paid"]),
      assigneeType: str(r, "assignee_type") as Job["assigneeType"],
      assigneeId: r["assignee_id"] == null ? undefined : String(r["assignee_id"]),
      notes: r["notes"] == null ? undefined : String(r["notes"]),
    })),
  };
}

/* ---------- pojedinačni upisi ----------
 * Svaka izmena šalje samo svoj red. Celo stanje se upisuje još samo na dva mesta:
 * pri seed-u novog naloga i na RESET. */

async function one(
  label: string,
  run: () => PromiseLike<{ error: { message: string } | null }>,
): Promise<void> {
  const { error } = await run();
  if (error) throw new Error(`${label}: ${error.message}`);
}

/** Nov posao ide ceo. Za IZMENU postojećeg vidi `patchJobRemote`. */
export async function saveJob(uid: string, org: string, job: Job): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await one("jobs", () => sb.from("jobs").upsert([jobRow(uid, org)(job)], PK));
}

/** Polja posla koja klijent sme da menja, i njihove kolone. `id` nije među njima. */
const JOB_COLUMNS: Record<string, string> = {
  scope: "scope",
  customerId: "customer_id",
  description: "description",
  date: "date",
  time: "time",
  location: "location",
  price: "price",
  status: "status",
  paid: "paid",
  assigneeType: "assignee_type",
  assigneeId: "assignee_id",
  notes: "notes",
};

/**
 * Upisuje SAMO izmenjene kolone.
 *
 * Pre ovoga je i najmanja izmena išla kao upsert celog reda. Pošto nema
 * realtime pretplate ni ponovnog čitanja (`loadStateFromSupabase` se zove
 * jednom, pri učitavanju strane), vlasnikov snimak stanja ume da bude star
 * satima. Klik na „označi kao plaćeno" je tako šiljao i `status` iz tog starog
 * snimka i vraćao radnikovo ZAVRŠENO na DODELJENO — bez ijedne greške,
 * vidljivo tek pri sledećem učitavanju. Nalaz B iz pregleda Faze 10.
 */
export async function patchJobRemote(
  uid: string,
  id: string,
  patch: Partial<Job>,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const row: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    const col = JOB_COLUMNS[key];
    if (!col) continue;
    const v = (patch as Record<string, unknown>)[key];
    row[col] = v === undefined ? null : v;
  }
  if (Object.keys(row).length === 0) return;
  // PK je (user_id, id), pa je ovo tačno jedan red; org filtrira RLS.
  //
  // `.select("id")` nije ukras: PostgREST na UPDATE koji ne pogodi nijedan red
  // vraća 200 i prazan niz, BEZ greške. Raniji `upsert` je takav red usput
  // stvarao, pa se stanje samo popravljalo; `update` to ne može, i bez ove
  // provere bi korisnik zauvek viđao uspeh dok se u bazi ne menja ništa.
  const { data, error } = await sb.from("jobs").update(row).eq("user_id", uid).eq("id", id).select("id");
  if (error) throw new Error(`jobs: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(`jobs: posao ${id} ne postoji u bazi, izmena nije upisana`);
  }
}

export async function saveCustomer(uid: string, org: string, customer: Customer): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await one("customers", () => sb.from("customers").upsert([customerRow(uid, org)(customer)], PK));
}

/** Članovi imaju surogat PK, pa se zamenjuju umesto da se upsertuju. */
export async function saveMixedTeam(uid: string, org: string, team: MixedTeam): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await one("mixed_teams", () => sb.from("mixed_teams").upsert([mixedTeamRow(uid, org)(team)], PK));
  await one("mixed_team_members", () =>
    sb.from("mixed_team_members").delete().eq("mixed_team_id", team.id),
  );
  const rows = mixedTeamMemberRows(uid, org)(team);
  if (rows.length) {
    await one("mixed_team_members", () => sb.from("mixed_team_members").insert(rows));
  }
}
