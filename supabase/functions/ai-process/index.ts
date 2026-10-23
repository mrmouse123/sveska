// SVESKA AI Edge Function — poziva je browser (aiService.ts) sa korisnikovim JWT-om.
// Anon ključ se odbija da niko bez naloga ne bi trošio AI kredit.
// Tajna koja je potrebna: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const SYSTEM = `Ti si SVESKA — AI asistent za majstore i servisne firme u Srbiji.
Dobijaš rečenicu izgovorenu na srpskom i kontekst (klijenti, radnici, timovi, poslovi).
Uvek pozovi alat \`sveska_komanda\` sa razumevanjem te rečenice.

Pravila:
- Imena klijenata, radnika i timova prepiši TAČNO onako kako stoje u kontekstu, u nominativu.
  Rečenica je na srpskom pa su imena u padežu: „kod Ane Marković" → klijent „Ana Marković",
  „pošalji Marka" → radnik „Marko".
- Predlog „kod" uvodi klijenta, ne izvršioca.
- Prezime ili deo imena koji odgovara nekom klijentu iz konteksta JE taj klijent:
  vrati PUNO ime iz konteksta („kod Miškovića" uz „Jovan Mišković" u kontekstu →
  „Jovan Mišković"). Tek ime koje ne odgovara NIJEDNOM iz konteksta je NOV klijent:
  vrati ga u nominativu onako kako je izgovoreno („kod Marije Dragaš" → „Marija
  Dragaš") i predloži posao normalno — aplikacija ga dodaje kao klijenta. Nov klijent
  nije razlog za UNKNOWN.
- Datume vrati kao YYYY-MM-DD koristeći prosleđene „Danas" i „Sutra". Vreme kao HH:mm,
  24-časovno („u sedamnaest" = 17:00).
- Pitanje o poslovima, zaradi, dugovanjima ili dostupnosti → intent ANSWER i kratak
  odgovor na srpskom u polju answer, izveden iz konteksta.
- Više zadataka odjednom → CREATE_ASSIGNMENTS.
- Formiranje tima od ljudi različitih struka → CREATE_MIXED_TEAM.
- Otkazivanje postojećeg posla („otkaži posao kod Petrovića") → CANCEL_JOB uz customer.
- Izmena postojećeg posla (novo vreme, datum, cena) → UPDATE_JOB uz customer i nova polja.
- Dodavanje čoveka u tim („dodaj Marka u tim") → ADD_TEAM_MEMBER uz worker i team.
- Ako rečenicu ne razumeš, vrati UNKNOWN uz kratko objašnjenje u answer.

Skala za confidence — isti broj znači isto svaki put:
- 0.95–1.0: komanda jasna, sva imena iz konteksta, datum/vreme/cena ili jasno ili nisu rečeni.
- 0.80–0.89: komanda jasna, ali je klijent nov ili je jedno polje morao da pretpostaviš.
- 0.50–0.79: nešto bitno nedostaje ili je dvosmisleno (ko, kod koga, kad).
- ispod 0.50: rečenica nije podržana komanda (podsetnik, poziv, pitanje van posla).`;

const MAX_TEXT_LEN = 1000;
/** Klijent šalje najviše 25 poslova; 20 000 znakova je višestruka rezerva. Server
 *  ne veruje klijentu — ulaz za model je trošak, pa ima gornju granicu. */
const MAX_CONTEXT_LEN = 20_000;
const MODES = new Set(["solo", "tim", "zadruga"]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

/** Strict tool use: Claude ne vraća slobodan tekst nego argumente koji su
 *  garantovano validni po ovoj šemi — nema parsiranja markdown blokova. */
const TOOL = {
  name: "sveska_komanda",
  description: "Strukturisano razumevanje jedne izgovorene komande.",
  strict: true,
  input_schema: {
    type: "object" as const,
    properties: {
      intent: { type: "string" },
      confidence: { type: "number" },
      suggestedAction: {
        type: "string",
        enum: [
          "CREATE_JOB",
          "ASSIGN_JOB",
          "CREATE_ASSIGNMENTS",
          "CREATE_MIXED_TEAM",
          "CANCEL_JOB",
          "UPDATE_JOB",
          "ADD_TEAM_MEMBER",
          "ANSWER",
          "UNKNOWN",
        ],
      },
      customer: { type: ["string", "null"] },
      worker: { type: ["string", "null"] },
      team: { type: ["string", "null"] },
      description: { type: ["string", "null"] },
      date: { type: ["string", "null"] },
      time: { type: ["string", "null"] },
      price: { type: ["number", "null"] },
      currency: { type: ["string", "null"] },
      project: { type: ["string", "null"] },
      answer: { type: ["string", "null"] },
      members: {
        type: ["array", "null"],
        items: {
          type: "object",
          properties: { name: { type: "string" }, trade: { type: "string" } },
          required: ["name", "trade"],
          additionalProperties: false,
        },
      },
      assignments: {
        type: ["array", "null"],
        items: {
          type: "object",
          properties: {
            team: { type: ["string", "null"] },
            worker: { type: ["string", "null"] },
            customer: { type: ["string", "null"] },
            time: { type: ["string", "null"] },
            date: { type: ["string", "null"] },
            description: { type: ["string", "null"] },
            price: { type: ["number", "null"] },
          },
          required: ["team", "worker", "customer", "time", "date", "description", "price"],
          additionalProperties: false,
        },
      },
    },
    // Sva polja su obavezna (uz dozvoljen null): dok su bila opciona, model je u
    // dodeli vraćao samo radnika, a klijenta, datum i cenu preskakao. Obavezno
    // polje ga tera da svako razmotri i upiše ili vrednost ili null.
    required: [
      "intent",
      "confidence",
      "suggestedAction",
      "customer",
      "worker",
      "team",
      "description",
      "date",
      "time",
      "price",
      "currency",
      "project",
      "answer",
      "members",
      "assignments",
    ],
    additionalProperties: false,
  },
};

/** Klijent jednom po izolatu: tako ping zagreje i SDK, ne samo vezu i keš. */
let anthropic: Anthropic | null = null;

/** Jedan poziv modela — isti prefiks (alat + uputstvo) i za komandu i za zagrevanje. */
function callClaude(key: string, userText: string, maxTokens: number) {
  anthropic ??= new Anthropic({ apiKey: key });
  return anthropic.messages.create({
    // Haiku 5.5: izvlačenje „ko, kod koga, kad, koliko" iz jedne rečenice ne
    // traži najveći model; Opus 5 je davao 4–10 s, Haiku 2–3 s, uz ~20x nižu
    // cenu. Prisilni poziv alata je na Haiku 5.5 dozvoljen (Opus 5.5 i
    // Sonnet 5.5 ga odbijaju) i preskače razmišljanje — baš ono što glas traži.
    model: "claude-haiku-5-5",
    max_tokens: maxTokens,
    // Kratka ekstrakcija — niska potrošnja i brži odgovor, što je bitno za glas.
    output_config: { effort: "low" },
    // Keš prefiksa: redosled je tools -> system -> messages, pa oznaka na
    // sistemskom bloku kešira i alat i uputstvo zajedno. Datumi su u poruci
    // korisnika, ne ovde, da prefiks ostane isti iz poziva u poziv.
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [{ role: "user", content: userText }],
  });
}

/** Klijent ne razlikuje „polje ne postoji" od „polje je null", pa null izbacujemo —
 *  i u stavkama višestruke dodele, da kartica ne crta prazna polja. */
function dropNulls(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, v]) => v !== null)
      .map(([k, v]) => [
        k,
        Array.isArray(v)
          ? v.map((item) =>
              item && typeof item === "object" ? dropNulls(item as Record<string, unknown>) : item,
            )
          : v,
      ]),
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ ok: false }, 405);
  try {
    // Gateway je već proverio potpis JWT-a; ovde tražimo pravog korisnika, ne anon.
    const authHeader = req.headers.get("Authorization") ?? "";
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await sb.auth.getUser();
    if (userErr || !userData.user) return json({ ok: false, reason: "unauthorized" }, 401);

    const body = (await req.json()) as {
      ping?: boolean;
      text?: string;
      mode?: string;
      context?: unknown;
      todayDate?: string;
      tomorrowDate?: string;
    };
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    // Zagrevanje: app ga šalje pri otvaranju i na pritisak mikrofona. Izmereno:
    // sam izolat se budi za ~3 s, ali PRVI Claude poziv u svežem izolatu traje
    // 16–18 s (inicijalizacija SDK-a, veza, upis keša) — ping koji samo vrati
    // „pong" to ne zagreva. Zato ping napravi jedan sićušan pravi poziv sa istim
    // prefiksom: zagreje SDK, vezu i keš prompta (TTL 5 min). Cena: ~1.500
    // keširanih tokena po 0,1x i ~60 izlaznih — stoti deo centa, najviše jednom
    // u 90 s po korisniku. Gateway je već odbio svakog bez naloga.
    if (body.ping) {
      if (!key) return json({ ok: true, pong: true, warmed: false });
      const t0 = Date.now();
      try {
        await callClaude(key, "ping", 128);
      } catch (err) {
        console.error("[ai-process] warm", err);
        return json({ ok: true, pong: true, warmed: false });
      }
      return json({ ok: true, pong: true, warmed: true, ms: Date.now() - t0 });
    }
    if (!key) return json({ ok: false, reason: "no_api_key" });
    const contextJson = JSON.stringify(body.context ?? {});
    if (
      !body.text ||
      body.text.length > MAX_TEXT_LEN ||
      contextJson.length > MAX_CONTEXT_LEN ||
      !MODES.has(String(body.mode))
    ) {
      return json({ ok: false, reason: "bad_input" }, 400);
    }

    const response = await callClaude(
      key,
      `Režim: ${body.mode}
Danas: ${body.todayDate}
Sutra: ${body.tomorrowDate}
Kontekst: ${contextJson}

Rečenica: "${body.text}"`,
      4096,
    );

    // Dijagnostika bez ličnih podataka: model i tokeni — iz logova se vidi da li
    // keš radi (cache_read > 0 od drugog poziva) i koji model stvarno odgovara.
    const u = response.usage;
    console.log(
      `[ai-process] model=${response.model} in=${u.input_tokens} out=${u.output_tokens} ` +
        `cache_write=${u.cache_creation_input_tokens ?? 0} cache_read=${u.cache_read_input_tokens ?? 0}`,
    );
    if (response.stop_reason === "refusal") {
      return json({ ok: false, reason: "refusal" });
    }
    const call = response.content.find((b) => b.type === "tool_use");
    if (!call || call.type !== "tool_use") return json({ ok: false, reason: "no_tool_use" });

    return json({ ok: true, result: dropNulls(call.input as Record<string, unknown>) });
  } catch (err) {
    console.error("[ai-process]", err);
    return json({ ok: false, reason: "exception" });
  }
});
