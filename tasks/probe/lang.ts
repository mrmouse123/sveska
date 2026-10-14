/**
 * Jezički nalazi iz pregleda Faze 10/11 (N1-N7). Pisano PRE popravke i mora
 * biti crveno dok se ne popravi — proba napisana posle popravke meri ono što
 * već znam (lekcija 20).
 *
 *   npx esbuild tasks/probe/lang.ts --bundle --format=esm --platform=node \
 *     --outfile=.probe/lang.mjs && node .probe/lang.mjs
 */
import { interpretLocal } from "../../src/lib/sveska/interpreter";
import { createInitialState } from "../../src/lib/sveska/data";
import type { Customer, DemoState, Mode } from "../../src/lib/sveska/types";

const base = createInitialState();

/** Stanje sa izmišljenim imenikom — za sudare koje demo podaci nemaju. */
function withCustomers(names: string[]): DemoState {
  const customers: Customer[] = names.map((name, i) => ({
    id: `c-t${i}`,
    name,
    phone: "",
    email: "",
    address: "",
    notes: "",
  }));
  return { ...base, customers };
}

let bad = 0;
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(
    `${ok ? "OK  " : "LOSE"}  ${label}\n        dobijeno ${JSON.stringify(got)}${ok ? "" : `   treba ${JSON.stringify(want)}`}`,
  );
}

const customerOf = (text: string, s: DemoState = base, m: Mode = "solo") =>
  interpretLocal(text, m, s).customer;

console.log("=== N5: /^sta/ guta komande ===");
check(
  "Stavi Marka na posao…",
  interpretLocal("Stavi Marka na posao kod Marka Petrovica sutra u deset.", "tim", base)
    .suggestedAction,
  "ASSIGN_JOB",
);
check(
  "Stani, otkazi…",
  interpretLocal("Stani, otkazi posao kod Ane Markovic.", "tim", base).suggestedAction !== "ANSWER",
  true,
);
check(
  "Sta ima danas? (pravo pitanje)",
  interpretLocal("Sta ima danas?", "solo", base).suggestedAction,
  "ANSWER",
);

console.log("\n=== N1: deburr pokriva samo šđčćž ===");
// Ime na „-a" ostaje: „Petra" je genitiv i od „Petar" i od „Petra", a
// „Nenada" i od „Nenad" i od „Nenada". Pogrešan nominativ je gori od padeža.
check("kod Petra Tótha", customerOf("Idem kod Petra Tótha sutra u deset."), "Petra Tóth");
check("kod Lasla Müllera", customerOf("Idem kod Lasla Müllera sutra u deset."), "Lasla Müller");

console.log("\n=== N2: različiti ljudi se spajaju ===");
// NIJE popravljivo: „kod Rade" je i genitiv od „Rada" i nominativ drugog imena.
// Isto pravilo čini da „kod Ane" nađe Anu, pa bi uklanjanje pokvarilo češći
// slučaj. Zapisano kao prihvaćeno ograničenje, ne kao popravka.
check(
  "imenik [Rada Nikolić], rečeno 'kod Rade Nikolić' (poznato ograničenje)",
  customerOf("Idem kod Rade Nikolić sutra u deset.", withCustomers(["Rada Nikolić"])),
  "Rada Nikolić",
);
check(
  "imenik [Ana Marković], rečeno 'kod Anastasije Marković'",
  customerOf("Idem kod Anastasije Marković sutra u deset.", withCustomers(["Ana Marković"])),
  "Anastasija Marković",
);

console.log("\n=== N3: kratki delovi imena ispadaju ===");
check("kod Milice Pop", customerOf("Idem kod Milice Pop sutra u deset."), "Milica Pop");
check("kod Nenada Vuk", customerOf("Idem kod Nenada Vuk sutra u deset."), "Nenada Vuk");

console.log("\n=== N4: nova imena ostaju u padežu ===");
check("kod Marka Nikolića", customerOf("Idem kod Marka Nikolića sutra u deset."), "Marka Nikolić");
check("kod Ane Petrović", customerOf("Idem kod Ane Petrović sutra u deset."), "Ana Petrović");
check("kod Milice Jovića", customerOf("Idem kod Milice Jovića sutra u deset."), "Milica Jović");

console.log("\n=== N6: multi-dodela ===");
{
  const r = interpretLocal(
    "Sutra u osam posalji elektricare kod Jovanovic Company, a vodoinstalatere kod Marka Petrovica.",
    "zadruga",
    base,
  );
  check(
    "električari prvi -> parovi se ne smeju zameniti",
    (r.assignments ?? []).map((a) => `${a.team}->${a.customer}`),
    ["ELEKTRIČARI->Jovanović Company", "VODOINSTALATERI->Marko Petrović"],
  );
}
{
  const r = interpretLocal(
    "Vodoinstalatere kod Ane Markovic u osam, a elektricare kod Milana Ilica u deset.",
    "zadruga",
    base,
  );
  check(
    "dva vremena u rečenici",
    (r.assignments ?? []).map((a) => a.time),
    ["08:00", "10:00"],
  );
}

console.log("\n=== N7: bez 'kod' klijent se uzima za radnika ===");
check(
  "Zakaži Ani Marković… (tim) — ne sme da dodeli radnika",
  interpretLocal("Zakazi Ani Markovic sutra u deset servis bojlera.", "tim", base).worker,
  undefined,
);
check(
  "Napravi tim za Marka Petrovića — ne sme od imena klijenta",
  (interpretLocal("Napravi tim za Marka Petrovica.", "zadruga", base).members ?? []).length,
  0,
);

console.log("");
console.log(bad === 0 ? "SVE PROLAZI" : `${bad} pogresno`);
if (bad > 0) process.exitCode = 1;
