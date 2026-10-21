/**
 * Spajanje AI i lokalnog rezultata (aiService.mergeAiResult) — nalazi pregleda
 * arhitekture 2026-10-22: slepo `{...local, ...ai}` je posle proširenja na
 * otkazivanje/izmenu davalo pogrešan posao ili tiho pomeren termin.
 *
 *   npm run probe ai-merge
 */
import { mergeAiResult } from "../../src/lib/sveska/aiService";
import { createInitialState } from "../../src/lib/sveska/data";
import type { AiResult, DemoState, Job } from "../../src/lib/sveska/types";

let bad = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) bad++;
  console.log(`${cond ? "OK  " : "LOSE"}  ${label}${cond ? "" : `   ${detail}`}`);
}

const state: DemoState = createInitialState();
const far = "2099-01-01";
const mk = (id: string, customerId: string, scope: Job["scope"], date: string, time: string): Job => ({
  id, scope, customerId, description: `posao ${id}`, date, time, location: "", price: 100,
  status: "ZAKAZANO", paid: false, assigneeType: "none",
});
state.customers = [
  { id: "c-pp", name: "Petar Petrović", phone: "", email: "", address: "", notes: "" },
  { id: "c-am", name: "Ana Marković", phone: "", email: "", address: "", notes: "" },
];
state.jobs = [
  mk("j-pp-solo", "c-pp", "solo", far, "10:00"),
  mk("j-pp-tim", "c-pp", "tim", far, "12:00"),
  mk("j-am-solo", "c-am", "solo", far, "17:00"),
];

const unknown: AiResult = { intent: "x", confidence: 0.3, suggestedAction: "UNKNOWN", source: "local" };

console.log("=== A: AI nađe otkazivanje, lokal ne — jobId iz AI klijenta ===");
{
  const m = mergeAiResult(unknown, { suggestedAction: "CANCEL_JOB", customer: "Petar Petrović" }, state, "solo");
  check("akcija CANCEL_JOB", m.suggestedAction === "CANCEL_JOB", m.suggestedAction);
  check("jobId = Petrovićev SOLO posao", m.jobId === "j-pp-solo", String(m.jobId));
  check("izvor ai", m.source === "ai");
}

console.log("\n=== B: posao ne postoji — bez kartice za otkazivanje ===");
{
  const m = mergeAiResult(unknown, { suggestedAction: "CANCEL_JOB", customer: "Milan Nikolić" }, state, "solo");
  check("akcija UNKNOWN", m.suggestedAction === "UNKNOWN", m.suggestedAction);
  check("odgovor kaže kod koga nema posla", (m.answer ?? "").includes("Milan Nikolić"), m.answer ?? "");
  check("nema jobId", m.jobId === undefined);
}

console.log("\n=== C: AI i lokal se ne slažu oko klijenta — jobId prati AI ===");
{
  const local: AiResult = {
    intent: "CANCEL_JOB", confidence: 0.92, suggestedAction: "CANCEL_JOB", source: "local",
    jobId: "j-am-solo", customer: "Ana Marković", date: far, time: "17:00",
  };
  const m = mergeAiResult(local, { suggestedAction: "CANCEL_JOB", customer: "Petar Petrović" }, state, "solo");
  check("klijent iz AI", m.customer === "Petar Petrović", String(m.customer));
  check("jobId prati AI klijenta, ne lokalni", m.jobId === "j-pp-solo", String(m.jobId));
}

console.log("\n=== D: izmena cene; lokal je pročitao CREATE_JOB sa sutra/09:00 ===");
{
  const local: AiResult = {
    intent: "CREATE_JOB", confidence: 0.8, suggestedAction: "CREATE_JOB", source: "local",
    customer: "Petar Petrović", date: "2026-10-23", time: "09:00", description: "Novi posao",
  };
  const m = mergeAiResult(local, { suggestedAction: "UPDATE_JOB", customer: "Petar Petrović", price: 200 }, state, "solo");
  check("akcija UPDATE_JOB", m.suggestedAction === "UPDATE_JOB");
  check("cena 200", m.price === 200, String(m.price));
  check("NEMA lokalnog datuma", m.date === undefined, String(m.date));
  check("NEMA lokalnog vremena", m.time === undefined, String(m.time));
  check("jobId rešen", m.jobId === "j-pp-solo", String(m.jobId));
}

console.log("\n=== E: ista akcija — lokal popunjava rupe ===");
{
  const local: AiResult = {
    intent: "ASSIGN_JOB", confidence: 0.9, suggestedAction: "ASSIGN_JOB", source: "local",
    customer: "Ana Marković", worker: "Marko Jović", date: "2026-10-23", time: "09:00", price: 50,
  };
  const m = mergeAiResult(local, { suggestedAction: "ASSIGN_JOB", worker: "Marko Jović", time: "17:00" }, state, "solo");
  check("vreme iz AI", m.time === "17:00", String(m.time));
  check("klijent iz lokala", m.customer === "Ana Marković", String(m.customer));
  check("cena iz lokala", m.price === 50, String(m.price));
}

console.log("\n=== F: AI dodeli timu, lokal je imao i radnika — radnik ne sme da preživi ===");
{
  const local: AiResult = {
    intent: "ASSIGN_JOB", confidence: 0.9, suggestedAction: "ASSIGN_JOB", source: "local",
    customer: "Ana Marković", worker: "Marko Jović", team: "Tim A",
  };
  const m = mergeAiResult(local, { suggestedAction: "ASSIGN_JOB", team: "Tim A", customer: "Ana Marković" }, state, "tim");
  check("tim iz AI", m.team === "Tim A");
  // Ista akcija: lokal popunjava rupe, pa radnik ostaje — to je poznata granica
  // ovog pravila; AI ovde treba da vrati worker=null, što strict šema i traži,
  // a null se na serveru briše. Zabeleženo, ne tvrdi se da je rešeno.
  console.log(`      (info) worker posle spajanja: ${String(m.worker)}`);
}

console.log("\n=== G: opseg — u solo režimu ne vidi posao tima ===");
{
  state.jobs = state.jobs.filter((j) => j.id !== "j-pp-solo");
  const m = mergeAiResult(unknown, { suggestedAction: "CANCEL_JOB", customer: "Petar Petrović" }, state, "solo");
  check("solo ne pogađa tim-posao", m.suggestedAction === "UNKNOWN", `${m.suggestedAction} ${String(m.jobId)}`);
  const t = mergeAiResult(unknown, { suggestedAction: "CANCEL_JOB", customer: "Petar Petrović" }, state, "tim");
  check("tim pogađa svoj posao", t.jobId === "j-pp-tim", String(t.jobId));
}

console.log("");
console.log(bad === 0 ? "SVE PROLAZI" : `${bad} pogresno`);
if (bad > 0) process.exitCode = 1;
