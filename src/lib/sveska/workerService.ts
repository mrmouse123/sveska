import { getSupabase } from "./supabaseService";
import type { JobStatus } from "./types";

/**
 * Radnikov pogled ide direktno na Supabase, ne kroz demo store.
 * Izvor istine je baza, a ne localStorage — radnik ne seed-uje i ne sinhronizuje ništa.
 */
export interface WorkerJob {
  id: string;
  description: string;
  date: string;
  time: string;
  location: string;
  price: number;
  status: JobStatus;
  customer: string;
}

type Row = Record<string, unknown>;
const str = (r: Row, k: string) => (r[k] == null ? "" : String(r[k]));

/** Poslovi koje RLS pusti ovom nalogu — za radnika su to samo njegovi. */
export async function fetchMyJobs(): Promise<WorkerJob[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const [jobs, customers] = await Promise.all([
    sb.from("jobs").select("*"),
    sb.from("customers").select("id, name"),
  ]);
  if (jobs.error) throw new Error(jobs.error.message);
  if (customers.error) throw new Error(customers.error.message);

  const nameById = new Map<string, string>();
  for (const c of (customers.data ?? []) as Row[]) nameById.set(str(c, "id"), str(c, "name"));

  return ((jobs.data ?? []) as Row[])
    .map((r) => ({
      id: str(r, "id"),
      description: str(r, "description"),
      date: str(r, "date"),
      time: str(r, "time"),
      location: str(r, "location"),
      price: Number(r["price"] ?? 0),
      status: str(r, "status") as JobStatus,
      customer: nameById.get(str(r, "customer_id")) ?? "Nepoznat klijent",
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

/** Jedina izmena koju radnik sme: status posla. Bazu čuva okidač, ne samo UI. */
export async function setRemoteJobStatus(id: string, status: JobStatus): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase nije konfigurisan.");
  const { error } = await sb.from("jobs").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}
