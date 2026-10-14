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
- Datume vrati kao YYYY-MM-DD koristeći prosleđene „Danas" i „Sutra". Vreme kao HH:mm,
  24-časovno („u sedamnaest" = 17:00).
- Pitanje o poslovima, zaradi, dugovanjima ili dostupnosti → intent ANSWER i kratak
  odgovor na srpskom u polju answer, izveden iz konteksta.
- Više zadataka odjednom → CREATE_ASSIGNMENTS.
- Formiranje tima od ljudi različitih struka → CREATE_MIXED_TEAM.
- Ako rečenicu ne razumeš, vrati UNKNOWN uz kratko objašnjenje u answer.`;

const MAX_TEXT_LEN = 1000;

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
          },
          required: ["team", "worker", "customer", "time", "date", "description"],
          additionalProperties: false,
        },
      },
    },
    required: ["intent", "confidence", "suggestedAction"],
    additionalProperties: false,
  },
};

/** Klijent ne razlikuje „polje ne postoji" od „polje je null", pa null izbacujemo. */
function dropNulls(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== null));
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
      text?: string;
      mode?: string;
      context?: unknown;
      todayDate?: string;
      tomorrowDate?: string;
    };
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key || !body.text || body.text.length > MAX_TEXT_LEN) {
      return json({ ok: false, reason: key ? "bad_input" : "no_api_key" });
    }

    const anthropic = new Anthropic({ apiKey: key });
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 4096,
      // Kratka ekstrakcija — niska potrošnja i brži odgovor, što je bitno za glas.
      output_config: { effort: "low" },
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [
        {
          role: "user",
          content: `Režim: ${body.mode}
Danas: ${body.todayDate}
Sutra: ${body.tomorrowDate}
Kontekst: ${JSON.stringify(body.context)}

Rečenica: "${body.text}"`,
        },
      ],
    });

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
