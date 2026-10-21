/**
 * Vokativ za pozdrav — „Petare" je bio prijavljen sa terena. Proba pokriva
 * uobičajena srpska imena, oba roda, izuzetke i velika slova.
 *
 *   npx esbuild tasks/probe/vocative.ts --bundle --format=esm --platform=node \
 *     --outfile=.probe/vocative.mjs && node .probe/vocative.mjs
 */
import { vocative } from "../../src/lib/sveska/text";

const cases: [string, string][] = [
  ["Petar", "Petre"],
  ["Petar Petrović", "Petre"],
  ["PETAR", "PETRE"],
  ["Aleksandar", "Aleksandre"],
  ["Lazar", "Lazare"],
  ["Jovan", "Jovane"],
  ["Milan", "Milane"],
  ["Dragan", "Dragane"],
  ["Stefan", "Stefane"],
  ["Igor", "Igore"],
  ["Nenad", "Nenade"],
  ["Dušan", "Dušane"],
  ["Filip", "Filipe"],
  ["Vuk", "Vuče"],
  ["Novak", "Novače"],
  ["Predrag", "Predraže"],
  ["Miloš", "Miloše"],
  ["Uroš", "Uroše"],
  ["Matej", "Mateju"],
  ["Marko", "Marko"],
  ["Darko", "Darko"],
  ["Đorđe", "Đorđe"],
  ["Pavle", "Pavle"],
  ["Luka", "Luka"],
  ["Nikola", "Nikola"],
  ["Saša", "Saša"],
  ["Ana", "Ana"],
  ["Jovana", "Jovana"],
  ["Milica", "Milice"],
  ["Danica", "Danice"],
  ["Jovica", "Jovice"],
  ["", ""],
  ["  ", ""],
];

let bad = 0;
for (const [input, want] of cases) {
  const got = vocative(input);
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? "OK  " : "LOSE"}  ${JSON.stringify(input)} -> ${JSON.stringify(got)}${ok ? "" : `  (očekivano ${JSON.stringify(want)})`}`);
}
console.log("");
console.log(bad === 0 ? "SVE PROLAZI" : `${bad} pogresno`);
if (bad > 0) process.exitCode = 1;
