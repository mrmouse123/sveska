/**
 * Tri komande koje su nedostajale, prijavljene sa terena:
 *   B  dva posla dvojici radnika u jednoj rečenici
 *   A  izmena i otkazivanje već zakazanog posla
 *   C  dodavanje člana u tim
 *
 * Pisano PRE implementacije i mora biti crveno (lekcija 20).
 *
 *   npx esbuild tasks/probe/commands.ts --bundle --format=esm --platform=node \
 *     --outfile=.probe/commands.mjs && node .probe/commands.mjs
 */
import { interpretLocal } from "../../src/lib/sveska/interpreter";
import { executeAiResult } from "../../src/lib/sveska/actions";
import { createInitialState } from "../../src/lib/sveska/data";
import type { Mode } from "../../src/lib/sveska/types";

const s = createInitialState();
let bad = 0;

function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(
    `${ok ? "OK  " : "LOSE"}  ${label}\n        ${JSON.stringify(got)}${ok ? "" : `\n        treba ${JSON.stringify(want)}`}`,
  );
}

const run = (text: string, mode: Mode = "tim") => interpretLocal(text, mode, s);

console.log("=== B: dva posla dvojici radnika ===");
{
  const r = run("Pošalji Marka kod Ane Marković, a Petra kod Milana Ilića sutra u osam.");
  check(
    "dve dodele, svaka svom radniku i klijentu",
    (r.assignments ?? []).map((a) => `${a.worker}->${a.customer}`),
    ["Marko->Ana Marković", "Petar->Milan Ilić"],
  );
}
{
  const r = run("Marko i Petar da poprave bojler i grejalicu.");
  check(
    "dva radnika, dva posla bez klijenta",
    (r.assignments ?? []).map((a) => `${a.worker}:${a.description}`),
    ["Marko:Servis bojlera", "Petar:Servis grejanja"],
  );
}
{
  const r = run("Pošalji Marka kod Ane Marković u osam, a Petra kod Milana Ilića u deset.");
  check(
    "dva radnika i DVA vremena",
    (r.assignments ?? []).map((a) => `${a.worker}@${a.time}`),
    ["Marko@08:00", "Petar@10:00"],
  );
}

console.log("\n=== A: otkazivanje i izmena postojećeg posla ===");
{
  const r = run("Otkaži posao kod Marka Petrovića.", "solo");
  check("otkazivanje daje CANCEL_JOB", r.suggestedAction, "CANCEL_JOB");
  const job = s.jobs.find((j) => j.id === r.jobId);
  check(
    "pogodio je posao kod Marka Petrovića",
    job ? s.customers.find((c) => c.id === job.customerId)?.name : "(nije našao posao)",
    "Marko Petrović",
  );
}
{
  // Opseg: u solo režimu Ana ima samo ZAVRŠEN posao; aktivan je u timu (targetJob
  // od 2026-10-22 ne gleda preko opsega — solo ne sme da pogodi posao tima).
  const r = run("Pomeri posao kod Ane Marković na 15 časova.", "tim");
  check("pomeranje daje UPDATE_JOB", r.suggestedAction, "UPDATE_JOB");
  check("novo vreme", r.time, "15:00");
}
{
  const r = run("Promeni cenu posla kod Milana Ilića na 200 evra.", "tim");
  check("promena cene daje UPDATE_JOB", r.suggestedAction, "UPDATE_JOB");
  check("nova cena", r.price, 200);
}
{
  const r = run("Otkaži posao kod Nepoznatog Čoveka.", "solo");
  check(
    "nepoznat klijent ne sme da otkaže tuđi posao",
    r.suggestedAction === "CANCEL_JOB" ? "OTKAZAO" : "odbio",
    "odbio",
  );
}

console.log("\n=== C: dodavanje člana u tim ===");
{
  const r = run("Dodaj Marka u tim vodoinstalateri.", "zadruga");
  check("daje ADD_TEAM_MEMBER", r.suggestedAction, "ADD_TEAM_MEMBER");
  check("radnik", r.worker, "Marko");
  check("tim", r.team, "VODOINSTALATERI");
}
{
  const r = run("Ubaci Stefana u električare.", "zadruga");
  check("druga formulacija", r.suggestedAction, "ADD_TEAM_MEMBER");
  check("radnik", r.worker, "Stefan");
  check("tim", r.team, "ELEKTRIČARI");
}

console.log("\n=== ne sme da pokvari postojeće ===");
check(
  "običan nov posao i dalje radi",
  run("Sutra u deset idem kod Marka Petrovića da popravim bojler.", "solo").suggestedAction,
  "CREATE_JOB",
);
check(
  "pitanje i dalje radi",
  run("Koji su poslovi danas?", "solo").suggestedAction,
  "ANSWER",
);
check(
  "timska multi-dodela i dalje radi",
  (run(
    "Sutra u osam pošalji vodoinstalatere kod Marka Petrovića, a električare kod Ane Marković.",
    "zadruga",
  ).assignments ?? []).map((a) => a.team),
  ["VODOINSTALATERI", "ELEKTRIČARI"],
);

console.log("");

console.log("\n=== izvršavanje: komande moraju da MENJAJU stanje ===");
{
  const calls: string[] = [];
  const fake = {
    createJob: (input: { description: string; assigneeId?: string }) => {
      calls.push(`createJob:${input.description}:${input.assigneeId ?? "-"}`);
      return { ...input, id: "j-new" } as never;
    },
    createMixedTeam: () => ({ id: "mt-x", name: "X" }),
    ensureCustomer: (n: string) => `c-${n.slice(0, 4)}`,
    setJobStatus: (id: string, st: string) => calls.push(`setJobStatus:${id}:${st}`),
    updateJob: (id: string, patch: Record<string, unknown>) =>
      calls.push(`updateJob:${id}:${JSON.stringify(patch)}`),
    addTeamMember: (t: string, w: string) => calls.push(`addTeamMember:${t}:${w}`),
    addNotification: () => undefined,
  };

  const cancel = run("Otkaži posao kod Marka Petrovića.", "solo");
  calls.length = 0;
  const msg1 = executeAiResult(cancel, "solo", s, fake as never);
  check("otkazivanje zove setJobStatus sa OTKAZANO", calls[0]?.includes(":OTKAZANO"), true);
  console.log(`        poruka: ${JSON.stringify(msg1)}`);

  const upd = run("Pomeri posao kod Ane Marković na 15 časova.", "tim");
  calls.length = 0;
  const msg2 = executeAiResult(upd, "tim", s, fake as never);
  check("izmena zove updateJob sa novim vremenom", calls[0]?.includes('"time":"15:00"'), true);
  console.log(`        poruka: ${JSON.stringify(msg2)}`);

  // Jovan je moler i NIJE u vodoinstalaterima.
  const add = run("Dodaj Jovana u tim vodoinstalateri.", "zadruga");
  calls.length = 0;
  const msg3 = executeAiResult(add, "zadruga", s, fake as never);
  check("dodavanje zove addTeamMember", calls[0], "addTeamMember:t-vodo:w-jovan");
  console.log(`        poruka: ${JSON.stringify(msg3)}`);

  // Stefan JESTE u tom timu — ne sme dvaput.
  const dup = run("Dodaj Stefana u tim vodoinstalateri.", "zadruga");
  calls.length = 0;
  const msg4 = executeAiResult(dup, "zadruga", s, fake as never);
  check("postojeći član se ne dodaje ponovo", calls.length, 0);
  console.log(`        poruka: ${JSON.stringify(msg4)}`);

  const multi = run("Marko i Petar da poprave bojler i grejalicu.", "tim");
  calls.length = 0;
  executeAiResult(multi, "tim", s, fake as never);
  check(
    "dva radnika -> dva posla, svaki svom radniku",
    calls,
    ["createJob:Servis bojlera:w-marko", "createJob:Servis grejanja:w-petar"],
  );
}

console.log("");
console.log(bad === 0 ? "SVE PROLAZI" : `${bad} pogresno`);
