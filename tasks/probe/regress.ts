/**
 * Regresije koje je protivnicki pregled nasao u popravkama od 2026-10-14.
 * Svaka od ovih recenica je JEDNOM radila, pa je moja popravka pokvarila.
 * Drzati zelenim.
 */
import { interpretLocal, parseTime } from "../../src/lib/sveska/interpreter";
import { createInitialState } from "../../src/lib/sveska/data";

const s = createInitialState();
console.log("--- F1: obicne recenice sa postojecim klijentom ---");
const f1 = [
  ["Sutra kod Petrovica servis bojlera", "Marko Petrović"],
  ["Kod Petrovica hitno, pukla cev", "Marko Petrović"],
  ["Idem kod Petrovica popodne", "Marko Petrović"],
  ["Idem kod gospodina Petrovica", "Marko Petrović"],
  ["Idem kod Ilica ujutru", "Milan Ilić"],
  ["Idem kod Jovanovica montaza klime", "Nikola Jovanović"],
  ["Idem kod Markovica posle podne", "Ana Marković"],
  ["Idem kod Petrovica da popravim bojler", "Marko Petrović"],
];
let bad = 0;
for (const [t, want] of f1) {
  const got = interpretLocal(t!, "solo", s).customer;
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? "OK  " : "LOSE"}  ${JSON.stringify(got)}${ok ? "" : `   [treba ${want}]`}  <- "${t}"`);
}

console.log("\n--- F2: vreme sa interpunkcijom posle sata ---");
const f2 = [
  ["Sutra u 10, kod Petrovica", "10:00"],
  ["Dolazim u 10.", "10:00"],
  ["Idem u 17, pukla cev", "17:00"],
  ["Sutra u 8. Donesi alat.", "08:00"],
  ["Sutra u 10 kod Petrovica", "10:00"],
];
for (const [t, want] of f2) {
  const got = parseTime(t!);
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? "OK  " : "LOSE"}  parseTime(${JSON.stringify(t)}) = ${String(got)}${ok ? "" : `   [treba ${want}]`}`);
}

console.log("\n--- F3: cena sa hiljadama I decimalama ---");
for (const t of ["1.200,50 evra", "12.500,00 evra", "1.200 evra", "0 evra"]) {
  const r = interpretLocal(`Sutra u deset kod Marka Petrovica, cena ${t}.`, "solo", s);
  console.log(`  "${t}" -> ${r.price}`);
}

console.log("");
console.log(bad === 0 ? "sve prolazi" : `${bad} pogresno`);
