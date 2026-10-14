import type { DemoState } from "../../src/lib/sveska/types";
import { createInitialState } from "../../src/lib/sveska/data";
import { interpretLocal } from "../../src/lib/sveska/interpreter";
import type { Mode } from "../../src/lib/sveska/types";

// Blok ispod je IZVUCEN iz src/lib/sveska/store.tsx skriptom, nije prepisan.
/** Bez dijakritike i malim slovima — "Petrovic" i "Petrović" su isti upit. */
const foldName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim();

const partsOf = (s: string) => foldName(s).split(/[^a-z0-9]+/).filter((p) => p.length >= 3);

/**
 * Čista pretraga klijenta po imenu — radi nad prosleđenim stanjem, bez zavisnosti od React-a.
 *
 * Stara verzija je poredila SAMO ime (`n.includes(c.name.split(" ")[0])`), pa je
 * 7 od 9 običnih srpskih imena pogrešno slepljivala: "Marko Nikolić",
 * "Marko Jovanović", "Nikola Marković" i "Milan Marković" su svi završavali kao
 * "Marko Petrović", a "Jovan Jovanović" kao firma "Jovanović Company".
 * Istovremeno "Petrovic" bez dijakritike NIJE nalazio Petrovića.
 *
 * Sada: svaki izgovoreni deo mora da se nađe u kandidatu, i to RAZLIČITIM
 * delovima njegovog imena — zato "Jovan Jovanović" ne poklapa "Jovanović
 * Company". Ako ništa ne odgovara, poziva se stvaranje novog klijenta.
 */
function lookupCustomer(s: DemoState, name: string): string | undefined {
  const n = foldName(name);
  if (!n) return undefined;

  const exact = s.customers.find((c) => foldName(c.name) === n);
  if (exact) return exact.id;

  const want = partsOf(name);
  if (!want.length) return undefined;

  return s.customers.find((c) => {
    const have = partsOf(c.name);
    const used = new Set<number>();
    return want.every((w) => {
      const i = have.findIndex((p, idx) => !used.has(idx) && (p.startsWith(w) || w.startsWith(p)));
      if (i < 0) return false;
      used.add(i);
      return true;
    });
  })?.id;
}

const s: DemoState = createInitialState();
const byId = new Map(s.customers.map((c) => [c.id, c.name]));
let bad = 0;

console.log("Klijenti u seed-u: " + s.customers.map((c) => c.name).join(" | "));
console.log("\n--- lookupCustomer (sloj 2) ---");
const lk: [string, string][] = [
  ["Marko Petrović", "Marko Petrović"],
  ["Marko Nikolić", "(nov)"],
  ["Marko Jovanović", "(nov)"],
  ["Ana Petrović", "(nov)"],
  ["Nikola Marković", "(nov)"],
  ["Milan Marković", "(nov)"],
  ["Jovan Jovanović", "(nov)"],
  ["Petrovic", "Marko Petrović"],
  ["Petrović", "Marko Petrović"],
  ["Marko", "Marko Petrović"],
  ["Ana Marković", "Ana Marković"],
  ["Jovanović Company", "Jovanović Company"],
  ["Milan Ilić", "Milan Ilić"],
  ["Nikola Jovanović", "Nikola Jovanović"],
];
for (const [input, want] of lk) {
  const id = lookupCustomer(s, input);
  const got = id ? byId.get(id)! : "(nov)";
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? "OK  " : "LOSE"}  ${JSON.stringify(input).padEnd(22)} -> ${got}${ok ? "" : "   [treba " + want + "]"}`);
}

console.log("\n--- interpreter (sloj 1) ---");
const it: [string, Mode, string][] = [
  ["Sutra u deset idem kod Marka Nikolica da popravim slavinu.", "solo", "Marka Nikolica"],
  ["Sutra u deset idem kod Ane Petrovic da montiram klimu.", "solo", "Ane Petrovic"],
  ["Sutra u deset idem kod Jovana Jovanovica da zamenim bojler.", "solo", "Jovana Jovanovica"],
  ["Sutra u sedamnaest idem kod Ane Markovic da montiram klimu.", "solo", "Ana Marković"],
  ["Sutra u deset idem kod Marka Petrovica da popravim bojler.", "solo", "Marko Petrović"],
  ["Zakazi kod Jovanovic Company u osamnaest servis kotlarnice.", "solo", "Jovanović Company"],
];
for (const [text, mode, want] of it) {
  const r = interpretLocal(text, mode, s);
  const ok = r.customer === want;
  if (!ok) bad++;
  console.log(`${ok ? "OK  " : "LOSE"}  klijent=${JSON.stringify(r.customer)}${ok ? "" : "   [treba " + want + "]"}`);
}

console.log("\n--- radnik se ne sme izgubiti (isti padezni oblik) ---");
const wk: [string, Mode, string | undefined][] = [
  ["Posalji Marka kod Marka Petrovica sutra u deset.", "tim", "Marko"],
  ["Posalji Milana kod Milana Ilica sutra u deset.", "tim", "Milan"],
  ["Posalji Marka sutra u deset kod Petrovica da popravi slavinu.", "tim", "Marko"],
];
for (const [text, mode, want] of wk) {
  const r = interpretLocal(text, mode, s);
  const ok = r.worker === want;
  if (!ok) bad++;
  console.log(`${ok ? "OK  " : "LOSE"}  akcija=${r.suggestedAction} radnik=${JSON.stringify(r.worker)} klijent=${JSON.stringify(r.customer)}${ok ? "" : "   [radnik treba " + want + "]"}`);
}

console.log("");
console.log(bad === 0 ? "SVE PROLAZI" : bad + " pogresno");
