/**
 * Name-matching probe — the cases that broke in the real app, not just the demo buttons.
 * Runs the REAL interpreter from src/.
 */
import { interpretLocal, parseTime } from "../../src/lib/sveska/interpreter";
import { createInitialState } from "../../src/lib/sveska/data";
import type { Mode } from "../../src/lib/sveska/types";

const state = createInitialState();

const cases: { text: string; mode: Mode; expect: Record<string, unknown> }[] = [
  {
    // Found by E2E: "markovic" starts with "marko", so the shorter name stole the token.
    text: "Sutra u sedamnaest idem kod Ane Markovic da montiram klimu, cena 90 evra.",
    mode: "solo",
    expect: { suggestedAction: "CREATE_JOB", customer: "Ana Marković", time: "17:00", price: 90 },
  },
  {
    text: "Sutra u deset idem kod Marka Petrovića da popravim bojler, cena 120 evra.",
    mode: "solo",
    expect: { suggestedAction: "CREATE_JOB", customer: "Marko Petrović", time: "10:00", price: 120 },
  },
  {
    // "kod" marks the client, so "Marku" is free to be the worker.
    text: "Daj Marku popravku slavine kod Nikole Jovanovića sutra u deset.",
    mode: "tim",
    expect: { suggestedAction: "ASSIGN_JOB", worker: "Marko", customer: "Nikola Jovanović" },
  },
  {
    text: "Pošalji Marka sutra u deset kod Petrovića da popravi slavinu.",
    mode: "tim",
    expect: { suggestedAction: "ASSIGN_JOB", worker: "Marko", customer: "Marko Petrović" },
  },
  {
    text: "Zakaži kod Jovanović Company u osamnaest servis kotlarnice.",
    mode: "solo",
    expect: { suggestedAction: "CREATE_JOB", customer: "Jovanović Company", time: "18:00" },
  },
];

let failed = 0;
for (const c of cases) {
  const r = interpretLocal(c.text, c.mode, state) as unknown as Record<string, unknown>;
  const bad = Object.entries(c.expect).filter(([k, v]) => r[k] !== v);
  if (bad.length) {
    failed++;
    console.log(`FAIL  "${c.text.slice(0, 60)}…"`);
    for (const [k, v] of bad) console.log(`        ${k}: expected ${String(v)}, got ${String(r[k])}`);
  } else {
    console.log(`PASS  "${c.text.slice(0, 60)}…"`);
  }
}

// Word hours: prefixes must not win over the longer word, and "pedeset" is not "deset".
const hours: [string, string | undefined][] = [
  ["u sedamnaest", "17:00"],
  ["u osamnaest", "18:00"],
  ["u devetnaest", "19:00"],
  ["u sedam", "07:00"],
  ["u osam", "08:00"],
  ["za pedeset evra", undefined],
];
for (const [text, want] of hours) {
  const got = parseTime(text);
  if (got !== want) {
    failed++;
    console.log(`FAIL  parseTime("${text}") = ${String(got)}, expected ${String(want)}`);
  } else {
    console.log(`PASS  parseTime("${text}") = ${String(got)}`);
  }
}

if (failed) process.exitCode = 1;
