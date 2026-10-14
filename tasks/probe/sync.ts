/**
 * Sync serialisation probe — runs the REAL supabaseService against a stubbed fetch.
 * Checks: (1) concurrent syncs never interleave and the newest state wins,
 *         (2) a failed write does not swallow a newer state that is already queued.
 */
import { syncStateToSupabase } from "../../src/lib/sveska/supabaseService";
import { createInitialState } from "../../src/lib/sveska/data";
import type { DemoState } from "../../src/lib/sveska/types";

/** Proba je zaostala: `org` je dodat u Fazi 7, a potpis ovde nije azuriran,
 *  pa je `state` padao u slot za `org` i writeState je dobijao undefined. */
const ORG = "00000000-0000-0000-0000-000000000001";

type Call = { table: string; jobs: number };
let calls: Call[] = [];
let inFlightRequests = 0;
let maxConcurrent = 0;
let failNext = 0;
const delayMs = 5;

const stateWith = (tag: string): DemoState => {
  const s = createInitialState();
  s.jobs = s.jobs.slice(0, 1).map((j) => ({ ...j, description: tag }));
  return s;
};

globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const href = String(url);
  const table = href.split("/rest/v1/")[1]?.split("?")[0] ?? "?";
  let jobs = 0;
  if (table === "jobs" && typeof init?.body === "string") {
    const rows = JSON.parse(init.body) as { description?: string }[];
    calls.push({ table, jobs: rows.length });
    jobs = rows.length;
    calls[calls.length - 1]!.jobs = jobs;
    (calls[calls.length - 1] as Call & { tag?: string }).tag = rows[0]?.description;
  } else {
    calls.push({ table, jobs: 0 });
  }
  inFlightRequests++;
  maxConcurrent = Math.max(maxConcurrent, inFlightRequests);
  await new Promise((r) => setTimeout(r, delayMs));
  inFlightRequests--;
  if (failNext > 0) {
    failNext--;
    return new Response(JSON.stringify({ message: "boom", code: "500" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

const tagsWritten = () =>
  calls
    .filter((c) => c.table === "jobs")
    .map((c) => (c as Call & { tag?: string }).tag)
    .filter(Boolean);

const assert = (name: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : ` — ${detail}`}`);
  if (!ok) process.exitCode = 1;
};

async function testNewestWins() {
  calls = [];
  maxConcurrent = 0;
  const a = syncStateToSupabase("u1", ORG, stateWith("A"));
  const b = syncStateToSupabase("u1", ORG, stateWith("B"));
  const c = syncStateToSupabase("u1", ORG, stateWith("C"));
  await Promise.all([a, b, c]);
  const tags = tagsWritten();
  assert("only one request in flight at a time", maxConcurrent === 1, `max=${maxConcurrent}`);
  assert("first and newest state written, stale B dropped",
    JSON.stringify(tags) === JSON.stringify(["A", "C"]), JSON.stringify(tags));
}

async function testFailureKeepsNewerState() {
  calls = [];
  failNext = 1; // the very first request (teams for state D) fails
  const d = syncStateToSupabase("u1", ORG, stateWith("D"));
  const e = syncStateToSupabase("u1", ORG, stateWith("E"));
  let rejected = false;
  await Promise.all([d.catch(() => { rejected = true; }), e.catch(() => {})]);
  const tags = tagsWritten();
  assert("caller still learns the write failed", rejected, "promise resolved instead of rejecting");
  assert("newer state E is written despite D failing", tags.includes("E"), JSON.stringify(tags));
}

await testNewestWins();
await testFailureKeepsNewerState();
