import type { AiResult, DemoState, Mode } from "./types";
import { daysFromNow, today, tomorrow } from "./data";
import { answerQuestion } from "./queries";
import { deburr } from "./text";



const WORD_HOURS: Record<string, string> = {
  sedam: "07:00",
  osam: "08:00",
  devet: "09:00",
  deset: "10:00",
  jedanaest: "11:00",
  dvanaest: "12:00",
  trinaest: "13:00",
  cetrnaest: "14:00",
  petnaest: "15:00",
  sesnaest: "16:00",
  sedamnaest: "17:00",
  osamnaest: "18:00",
  devetnaest: "19:00",
  dvadeset: "20:00",
};

/** Lowercased, deburred words — the unit every name/hour match works on. */
const tokens = (deburred: string) => deburred.split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Iste reci, ali iz originalnog teksta — potrebne samo da nov klijent dobije ime
 * sa dijakritikom. `deburr` menja slovo za slovo, pa su granice reci iste i
 * pozicije se poklapaju sa `tokens()`.
 */
const rawTokens = (text: string) => text.split(/[^\p{L}0-9]+/u).filter(Boolean);

/** Vreme van 00:00-23:59 nije vreme. Bolje nijedno nego 25:00. */
function hhmm(h: string, m: string): string | undefined {
  const hh = Number(h);
  const mm = Number(m);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return undefined;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Broj ili rec postaju vreme SAMO uz predlog "u". Bez tog uslova je
 * "sedamdeset evra" davalo 07:00, "desetak minuta" 10:00, a "cena 120.50 evra"
 * cak 20:50 — cena se citala kao sat. Izmisljeno vreme je gore od nijednog,
 * jer kartica potvrde prikazuje sat koji korisnik nije izgovorio.
 */
export function parseTime(text: string): string | undefined {
  const t = deburr(text);

  // "17:30" uvek. "17.30" samo posle "u", inace bi datum "15.10." i
  // cena "120.50" bili procitani kao vreme.
  const hm =
    t.match(/(?<!\d)(\d{1,2}):(\d{2})(?!\d)/) ?? t.match(/\bu\s+(\d{1,2})\.(\d{2})(?!\d)/);
  if (hm) return hhmm(hm[1]!, hm[2]!);

  // `(?![\d:]|[.,]\d)` odbacuje "10:30" i "10.50", ali pusta "u 10," i "u 10."
  // — ranije je svaka interpunkcija iza sata gutala vreme.
  const num = t.match(/\bu\s+(\d{1,2})(?![\d:]|[.,]\d)/);
  if (num) return hhmm(num[1]!, "00");

  // Token mora da BUDE sat, ne da pocinje njime: "dvadeset peti u deset"
  // daje 10:00, jer je samo "deset" posle "u".
  const toks = tokens(t);
  for (let i = 1; i < toks.length; i++) {
    if (toks[i - 1] !== "u") continue;
    const hit = WORD_HOURS[toks[i]!];
    if (hit) return hit;
  }
  return undefined;
}

export function parseDate(text: string): string {
  const t = deburr(text);
  if (t.includes("prekosutra")) return daysFromNow(2);
  if (t.includes("sutra")) return tomorrow();
  if (t.includes("danas") || t.includes("veceras")) return today();
  return tomorrow();
}

/**
 * "1.200,50" -> 1200.5, "1.200" -> 1200, "120.50" -> 120.5, "90" -> 90.
 * U srpskom je "." hiljadarka a "," decimala; ASR ipak daje i "120.50", pa se
 * tacka tumaci kao hiljade samo kad je prate tacno tri cifre.
 */
function toAmount(raw: string): number {
  if (raw.includes(",")) return Number(raw.replace(/\./g, "").replace(",", "."));
  return /\.\d{3}(?!\d)/.test(raw) ? Number(raw.replace(/\./g, "")) : Number(raw);
}

function parsePrice(text: string): number | undefined {
  const t = deburr(text);
  // Jedan izraz hvata CEO broj, pa ga `toAmount` tumaci. Ranije su dve
  // alternative hvatale razlicite delove, pa je "12.500,00 evra" davalo 500.
  const m =
    t.match(/(?<!\d)(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:evr|eur|€)/) ??
    t.match(/cena\s*(?:je\s*)?(?<!\d)(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/);
  if (m) {
    const n = toAmount(m[1]!);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const words: Record<string, number> = { sto: 100, dvesta: 200, trista: 300, pedeset: 50 };
  for (const [w, v] of Object.entries(words)) if (t.includes(`${w} evr`)) return v;
  return undefined;
}

const DESCRIPTIONS: [RegExp, string][] = [
  [/bojler/, "Servis bojlera"],
  [/slavin/, "Popravka slavine"],
  [/kupatil/, "Radovi u kupatilu"],
  [/instalacij/, "Popravka instalacije"],
  [/krec|molera[js]|farb/, "Krečenje"],
  [/struj|elektr|osigurac|tabl/, "Električni radovi"],
  [/cev|voda|vodoinstalater|odgus/, "Vodoinstalaterski radovi"],
  [/klim/, "Montaža klime"],
  [/grejanj|kotl/, "Servis grejanja"],
];

function parseDescription(text: string, fallback = "Novi posao"): string {
  const t = deburr(text);
  for (const [re, label] of DESCRIPTIONS) if (re.test(t)) return label;
  return fallback;
}

/** Declension-tolerant stems: "Marko" → marko|mark, "Petar" → petar|peta|petr. */
function stems(name: string): string[] {
  const n = deburr(name);
  const out = [n];
  if (n.length > 4) out.push(n.slice(0, -1));
  if (n.endsWith("ar")) out.push(`${n.slice(0, -2)}r`); // Petar → Petra, Aleksandar → Aleksandra
  return out.filter((s) => s.length >= 3);
}

/**
 * How specifically this token names this person: the length of the longest stem it
 * starts with, 0 when it does not name them at all. "markovic" scores 8 for
 * „Marković" but only 5 for „Marko", so the longer name wins the token.
 */
function matchScore(token: string, name: string): number {
  let best = 0;
  for (const s of stems(name)) {
    // Padežni nastavak u srpskom je kratak (-a, -u, -om, -ima). Bez ove granice
    // je „Anastasije" bilo padež od „Ana", a „Milan" od „Mila".
    if (token.startsWith(s) && token.length - s.length <= 3) best = Math.max(best, s.length);
  }
  return best;
}

/**
 * Every token names at most one person: the one matching it most specifically. When two
 * people match a token equally well — „Nikola Jovanović" and „Jovanović Company" both
 * answer to "Jovanovića" — the one covering more of the sentence wins, so saying
 * "kod Jovanović Company" picks the company.
 * Results come back in the order the tokens appear, which is what multi-assignment pairs on.
 */
function claimBy<T>(tokens: string[], people: T[], namesOf: (p: T) => string[]): T[] {
  const scoreOf = (person: T, token: string) =>
    Math.max(0, ...namesOf(person).map((n) => matchScore(token, n)));

  const ranked = people
    .map((person, order) => ({
      person,
      order,
      total: tokens.reduce((sum, tok) => sum + scoreOf(person, tok), 0),
    }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total || a.order - b.order);

  const out: T[] = [];
  for (const tok of tokens) {
    let winner: T | null = null;
    let best = 0;
    // `ranked` is ordered by coverage, so a tie on score keeps the broader match.
    for (const r of ranked) {
      const score = scoreOf(r.person, tok);
      if (score > best) {
        best = score;
        winner = r.person;
      }
    }
    if (winner && !out.includes(winner)) out.push(winner);
  }
  return out;
}

/**
 * In Serbian the client is the one after "kod": „Pošalji Marka kod Petrovića.“
 * Those words belong to the customer; everything else may name a worker.
 * Without a "kod" we cannot tell them apart, so both sides see the whole sentence.
 */
function splitByKod(text: string) {
  const all = tokens(deburr(text));
  // Pozicije, ne stringovi. Sa Set<string> se radnikov token brisao SVUDA u
  // recenici, pa je "Posalji Marka kod Marka Petrovica" ostajalo bez radnika —
  // a to je normalna muska deklinacija (Marka, Milana, Stefana, Petra).
  const owned = new Set<number>();
  all.forEach((tok, i) => {
    if (tok !== "kod") return;
    // The client is normally one or two words: "kod Petrovića", "kod Marka Petrovića".
    // Obe reci ulaze u prozor; koja od njih je zaista deo imena odlucuje
    // `matchCustomers`, jer tek tamo postoji spisak klijenata.
    for (const j of [i + 1, i + 2]) if (all[j]) owned.add(j);
  });
  const ownedIdx = [...owned].sort((a, b) => a - b);
  return {
    customerTokens: ownedIdx.length ? ownedIdx.map((i) => all[i]!) : all,
    workerTokens: all.filter((_, i) => !owned.has(i)),
    /** Da li je klijent ogranicen na "kod ...", tj. znamo li tacno sta je izgovoreno. */
    kodScoped: ownedIdx.length > 0,
    /** Isti opseg nad originalnim tekstom — za ime novog klijenta sa dijakritikom. */
    spokenCustomer: ownedIdx.map((i) => rawTokens(text)[i] ?? all[i]!),
  };
}

const vowelStem = (w: string) => w.replace(/[aeiou]$/, "");

/**
 * Ime novog klijenta iz izgovorenog, vraćeno u nominativ koliko se pouzdano može.
 *
 * Prezime (poslednja reč): genitiv dodaje „a" na suglasnik — „Nikolića" ->
 * „Nikolić", „Tótha" -> „Tóth". Ime (ostale reči): žensko „-e" je genitiv od
 * „-a" — „Ane" -> „Ana", „Milice" -> „Milica".
 *
 * Muško ime na „-a" se NE dira: „Marka" je genitiv i od „Marko" i od „Marka",
 * a „Jovana" i od „Jovan" i od „Jovana". Pogrešan nominativ je gori od padeža,
 * jer padež korisnik prepozna i preimenuje, a pogrešno ime izgleda tačno.
 */
function toNominative(words: string[]): string[] {
  const vowel = /[aeiouAEIOU]$/;
  return words.map((w, i) => {
    const last = i === words.length - 1;
    if (last && w.length > 3 && /a$/i.test(w) && !vowel.test(w.slice(0, -1))) {
      return w.slice(0, -1);
    }
    if (!last && w.length > 2 && /e$/i.test(w)) return `${w.slice(0, -1)}a`;
    return w;
  });
}

const titleCase = (words: string[]) =>
  toNominative(words)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/** Delovi imena koji nose informaciju. "Ana" je kratko ali razlikuje — ulazi. */
const nameParts = (name: string) =>
  deburr(name)
    .split(" ")
    .filter((p) => p.length >= 3);

/**
 * Da li `person` pokriva SVE izgovorene delove imena, i to razlicitim delovima
 * svog imena. Bez uslova razlicitosti "Jovan Jovanovic" bi poklopio "Jovanović
 * Company", jer "jovanovic" pocinje sa "jovan".
 */
/**
 * Koliko izgovorena rec imenuje ovaj deo imena; 0 znaci da ga ne imenuje.
 * Tri slucaja, namerno u jednoj funkciji da se pravilo cita na jednom mestu:
 *  1. padez pokriven stemom       — "petrovica" -> "Petrovic"
 *  2. izgovoreno je skraceno      — "markov"    -> "Markovic"
 *  3. kratko ime menja samoglasnik — "ane"      -> "Ana"  (stems() skracuje tek >4 slova)
 */
function partScore(tok: string, part: string): number {
  const byStem = matchScore(tok, part);
  if (byStem) return byStem;
  if (part.startsWith(tok)) return tok.length;
  if (vowelStem(part) === vowelStem(tok)) return tok.length;
  return 0;
}

/** Da li `person` pokriva SVE izgovorene reci, i to RAZLICITIM delovima imena. */
function coversAll(spoken: string[], person: string[]): boolean {
  const used = new Set<number>();
  for (const tok of spoken) {
    let pick = -1;
    let best = 0;
    person.forEach((part, i) => {
      if (used.has(i)) return;
      const score = partScore(tok, part);
      if (score > best) {
        best = score;
        pick = i;
      }
    });
    if (pick < 0) return false;
    used.add(pick);
  }
  return true;
}

function matchCustomers(text: string, state: DemoState): string[] {
  const { customerTokens, kodScoped, spokenCustomer } = splitByKod(text);
  if (!kodScoped) {
    return claimBy(customerTokens, state.customers, (c) => nameParts(c.name)).map((c) => c.name);
  }

  // Koja izgovorena rec imenuje nekog poznatog klijenta? Signal koji vec imamo,
  // umesto liste zabranjenih reci — ona je padala na otvoreni recnik, pa je
  // "kod Petrovica SERVIS bojlera" pravilo fantomskog klijenta "Petrovica Servis".
  const names = customerTokens.map((tok) =>
    state.customers.some((c) => nameParts(c.name).some((p) => partScore(tok, p) > 0)),
  );

  // Red reci odlucuje: u srpskom opis stoji POSLE imena ("Petrovica servis"), a
  // ime PRE prezimena ("Jovana Jovanovica"). Zato se zadrzava sve do poslednje
  // reci koja nekog imenuje; ono iza nje je opis. Ako niko nije imenovan,
  // klijent je nov i uzima se sve izgovoreno.
  // Rec koja nikog ne imenuje a stoji PRE imena je ili ime novog klijenta
  // ("Jovana Jovanovica") ili oslovljavanje ("gospodina Petrovica"). Razlikuje
  // ih to sto je oslovljavanje zatvorena klasa — mozes je nabrojati. Opisi,
  // koje smo ranije pokusali da nabrojimo, to nisu, i zato je ona lista pala.
  const titles = customerTokens.map(
    (tok, i) => !names[i] && /^(gospod|gospodj|gdin|doktor|dr|majstor|komsij|firm|gazd|kum|tetk|cik|strin|ujk)/.test(tok),
  );

  const names2 = names.map((n, i) => n && !titles[i]);
  const last = names2.lastIndexOf(true);
  const keepTo = last < 0 ? customerTokens.length - 1 : last;
  const keep = (_: unknown, i: number) => i <= keepTo && !titles[i];
  const kept = customerTokens.filter(keep);
  const spoken = spokenCustomer.filter(keep);

  const fresh = () => [titleCase(spoken)].filter(Boolean);
  if (last < 0) return fresh();

  const claimed = claimBy(kept, state.customers, (c) => nameParts(c.name)).map((c) => c.name);
  if (kept.length === 1) return claimed;

  // Vise reci: pobednik mora da pokrije SVE, inace je "kod Marka Nikolica"
  // zavrsavalo kao "Marko Petrovic" — posao i dug na pogresnom coveku.
  const ok = claimed.filter((n) => coversAll(kept, nameParts(n)));
  return ok.length ? ok : fresh();
}



/**
 * `taken` su klijenti koje je rečenica već imenovala. Jedan token imenuje jednu
 * osobu: bez „kod" su obe strane gledale celu rečenicu, pa je „Zakaži Ani
 * Marković…" dodeljivalo radnika Marka, a „Napravi tim za Marka Petrovića"
 * pravilo tim od imena KLIJENTA. Kad „kod" postoji, podela je već napravljena.
 */
function matchWorkers(text: string, state: DemoState, taken: string[]): string[] {
  const { workerTokens, kodScoped } = splitByKod(text);
  const free = kodScoped
    ? workerTokens
    : workerTokens.filter((tok) => {
        // Samo NAJBOLJI klijent, ne svi usput zakačeni: bez „kod" `matchCustomers`
        // olako proglasi klijentom svakoga ko liči, pa je „napravi tim od Petra,
        // Milana i Jovana" gubilo Milana — on je i radnik i klijent (Milan Ilić).
        const asCustomer = taken[0]
          ? Math.max(0, ...nameParts(taken[0]).map((p) => partScore(tok, p)))
          : 0;
        const asWorker = Math.max(0, ...state.workers.map((w) => matchScore(tok, w.name)));
        return asWorker > asCustomer;
      });
  return claimBy(free, state.workers, (w) => [w.name]).map((w) => w.name);
}

function matchTeams(text: string, state: DemoState): string[] {
  const t = deburr(text);
  const out: string[] = [];
  if (/vodoinstalater/.test(t)) out.push("VODOINSTALATERI");
  if (/elektric|struj/.test(t)) out.push("ELEKTRIČARI");
  return out.filter((n) => state.teams.some((tm) => tm.name === n));
}

/** `\b` je bitno: bez njega je „STAvi Marka…" i „STAni, otkaži…" bilo pitanje. */
const isQuestion = (t: string) =>
  /^(ko|koji|koliko|kada|gde|sta|da li|ima li)\b/.test(deburr(t).trim()) || t.includes("?");

/** Deterministic local interpreter used when the AI service is unavailable. */
export function interpretLocal(text: string, mode: Mode, state: DemoState): AiResult {
  const t = deburr(text);
  const date = parseDate(text);
  const time = parseTime(text);
  const customers = matchCustomers(text, state);
  const workers = matchWorkers(text, state, customers);
  const teams = matchTeams(text, state);

  if (isQuestion(text)) {
    const answer = answerQuestion(text, mode, state);
    return {
      intent: "QUESTION",
      confidence: answer ? 0.9 : 0.4,
      answer:
        answer ??
        "Nisam sigurna šta tačno tražiš. Pitaj me npr. „Koji su poslovi danas?“ ili „Ko mi duguje novac?“",
      suggestedAction: "ANSWER",
      source: "local",
    };
  }

  // Mixed team creation
  if (/tim od|napravi tim|mixed|ekipu od|formiraj tim/.test(t) && workers.length >= 2) {
    const project =
      /petrovic/.test(t) ? "RENOVACIJA PETROVIĆ" : `PROJEKAT ${(customers[0] ?? "NOVI").toUpperCase()}`;
    return {
      intent: "CREATE_MIXED_TEAM",
      confidence: 0.9,
      project,
      members: workers.map((name) => ({
        name,
        trade: state.workers.find((w) => w.name === name)?.trade ?? "majstor",
      })),
      suggestedAction: "CREATE_MIXED_TEAM",
      source: "local",
    };
  }

  // Multi assignment (zadruga)
  if (mode === "zadruga" && (teams.length >= 2 || (teams.length >= 1 && customers.length >= 2))) {
    // Rečenica se deli na delove po „, a" / „ a", pa svaki deo nosi SVOJ tim,
    // klijenta i vreme. Ranije su timovi dodavani tvrdo kodiranim redom a parili
    // se po indeksu, pa je „pošalji ELEKTRIČARE kod X, a VODOINSTALATERE kod Y"
    // davalo obrnuto; drugo vreme se uopšte nije čitalo.
    const clauses = text.split(/,\s*a\s+|\s+a\s+/i);
    const byClause = clauses.flatMap((clause) =>
      matchTeams(clause, state).map((team) => ({
        team,
        customer: matchCustomers(clause, state)[0] ?? customers[0] ?? "Nepoznat klijent",
        time: parseTime(clause) ?? time ?? "08:00",
        date,
        description:
          team === "ELEKTRIČARI" ? "Električni radovi" : "Vodoinstalaterski radovi",
      })),
    );
    const assignments =
      byClause.length >= 2
        ? byClause
        : teams.map((team, i) => ({
            team,
            customer: customers[i] ?? customers[0] ?? "Nepoznat klijent",
            time: time ?? "08:00",
            date,
            description:
              team === "ELEKTRIČARI" ? "Električni radovi" : "Vodoinstalaterski radovi",
          }));
    return {
      intent: "MULTI_ASSIGNMENT",
      confidence: 0.92,
      assignments,
      suggestedAction: "CREATE_ASSIGNMENTS",
      source: "local",
    };
  }

  // Assign to a single worker or team
  if ((mode === "tim" || mode === "zadruga") && (workers.length === 1 || teams.length === 1)) {
    return {
      intent: "ASSIGN_JOB",
      confidence: 0.93,
      ...(workers[0] ? { worker: workers[0] } : {}),
      ...(teams[0] ? { team: teams[0] } : {}),
      ...(customers[0] ? { customer: customers[0] } : {}),
      description: parseDescription(text, "Radovi kod klijenta"),
      date,
      time: time ?? "09:00",
      ...(parsePrice(text) !== undefined ? { price: parsePrice(text)! } : {}),
      suggestedAction: "ASSIGN_JOB",
      source: "local",
    };
  }

  // Default: create a job
  if (customers.length || /idem kod|zakazi|zakazi mi|posao/.test(t)) {
    return {
      intent: "CREATE_JOB",
      confidence: 0.9,
      ...(customers[0] ? { customer: customers[0] } : {}),
      description: parseDescription(text),
      date,
      time: time ?? "09:00",
      ...(parsePrice(text) !== undefined ? { price: parsePrice(text)!, currency: "EUR" } : {}),
      suggestedAction: "CREATE_JOB",
      source: "local",
    };
  }

  const answer = answerQuestion(text, mode, state);
  return {
    intent: "UNKNOWN",
    confidence: 0.3,
    answer:
      answer ??
      "Nisam uspela da razumem. Probaj npr. „Sutra u deset idem kod Marka Petrovića da popravim bojler, cena 120 evra.“",
    suggestedAction: answer ? "ANSWER" : "UNKNOWN",
    source: "local",
  };
}
