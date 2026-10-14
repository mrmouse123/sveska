import { parseTime, interpretLocal } from "../../src/lib/sveska/interpreter";
import { createInitialState } from "../../src/lib/sveska/data";

const cases: [string, string | undefined][] = [
  // Padali pre popravke
  ["sedamdeset evra", undefined],
  ["osamdeset evra", undefined],
  ["desetak minuta", undefined],
  ["petnaestog u deset", "10:00"],
  ["dvadeset peti u deset", "10:00"],
  ["cena 120.50 evra", undefined],
  ["15.10. u deset", "10:00"],
  ["1.200 evra", undefined],
  ["u 24", undefined],
  ["u 25", undefined],
  ["u 99:99", undefined],
  // Moralo je da nastavi da radi
  ["u sedamnaest", "17:00"],
  ["u osamnaest", "18:00"],
  ["u sedam", "07:00"],
  ["u osam", "08:00"],
  ["u petnaest", "15:00"],
  ["u deset", "10:00"],
  ["u devet", "09:00"],
  ["u dvadeset", "20:00"],
  ["sutra u 17:30", "17:30"],
  ["u 17.30", "17:30"],
  ["u 9", "09:00"],
  ["u 0", "00:00"],
  ["u 23", "23:00"],
  ["danas u sedamnaest", "17:00"],
  ["sutra u osamnaest, cena osamdeset evra", "18:00"],
  ["cena osamdeset evra, sutra u osamnaest", "18:00"],
];

let bad = 0;
console.log("--- parseTime ---");
for (const [input, want] of cases) {
  const got = parseTime(input);
  const ok = got === want;
  if (!ok) bad++;
  console.log(
    `${ok ? "OK  " : "LOSE"}  ${JSON.stringify(input).padEnd(42)} -> ${String(got)}${ok ? "" : `   [treba ${String(want)}]`}`,
  );
}

console.log("\n--- cena kroz ceo interpreter ---");
const s = createInitialState();
const price: [string, number | undefined][] = [
  ["Sutra u deset idem kod Marka Petrovica, cena 120.50 evra.", 120.5],
  ["Sutra u deset idem kod Marka Petrovica, cena 90 evra.", 90],
  ["Sutra u deset idem kod Marka Petrovica, cena 1.200 evra.", 1200],
  ["Sutra u deset idem kod Marka Petrovica, cena 480 evra.", 480],
];
for (const [t, want] of price) {
  const r = interpretLocal(t, "solo", s);
  const ok = r.price === want;
  if (!ok) bad++;
  console.log(`${ok ? "OK  " : "LOSE"}  cena=${r.price} vreme=${r.time}${ok ? "" : `   [treba ${want}]`}`);
}

console.log("");
console.log(bad === 0 ? "SVE PROLAZI" : `${bad} pogresno`);
