import type { AiResult, DemoState, Mode } from "./types";
import { interpretLocal } from "./interpreter";
import { today, tomorrow } from "./data";
import { assigneeLabel } from "./queries";
import { getSupabaseConfig } from "./supabaseService";
import { getSession } from "./auth";

function buildContext(state: DemoState, mode: Mode) {
  const jobs = state.jobs.filter((j) => j.scope === mode);
  return {
    customers: state.customers.map((c) => c.name),
    workers: state.workers.map((w) => `${w.name} (${w.trade})`),
    teams: state.teams.map((t) => t.name),
    mixedTeams: state.mixedTeams.map((t) => t.name),
    jobs: jobs.slice(0, 25).map((j) => ({
      klijent: state.customers.find((c) => c.id === j.customerId)?.name,
      opis: j.description,
      datum: j.date,
      vreme: j.time,
      izvrsilac: assigneeLabel(state, j),
      status: j.status,
      cena: j.price,
      placeno: j.paid,
    })),
  };
}

const WARM_EVERY_MS = 90_000;
let lastWarm = 0;

/**
 * Zagrevanje edge funkcije. Hladan start je merio 21 s, a app čeka 20 — prva
 * komanda posle pauze je zato tiho padala na lokalni interpreter. Ping budi
 * funkciju dok korisnik još bira šta će reći (otvaranje app-a, pritisak
 * mikrofona, početak snimanja); Claude se pri pingu ne poziva, pa ne košta.
 * Najviše jednom u 90 s; greške se gutaju — ovo je optimizacija, ne funkcija.
 */
export function warmAi(): void {
  const now = Date.now();
  if (now - lastWarm < WARM_EVERY_MS) return;
  void (async () => {
    try {
      const cfg = getSupabaseConfig();
      if (!cfg) return;
      const session = await getSession();
      if (!session) return;
      // Brojač se pomera tek kad ping stvarno krene: ako se pri otvaranju app-a
      // sesija još nije slegla, pritisak mikrofona 10 s kasnije mora da prođe.
      lastWarm = Date.now();
      await fetch(`${cfg.url}/functions/v1/ai-process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: cfg.anonKey,
        },
        body: JSON.stringify({ ping: true }),
      });
    } catch {
      /* zagrevanje nije uspelo — pravi poziv će sam probuditi funkciju */
    }
  })();
}

/**
 * Primary AI entry point. Calls the Supabase edge function `ai-process` with the
 * user's JWT and transparently falls back to the deterministic local interpreter
 * (no config, signed out, network error, timeout, or {ok:false}).
 */
export async function processVoiceCommand(
  text: string,
  mode: Mode,
  state: DemoState,
): Promise<AiResult> {
  const local = interpretLocal(text, mode, state);
  const cfg = getSupabaseConfig();
  if (!cfg) return local;
  const session = await getSession();
  if (!session) return local; // edge function only serves signed-in users
  try {
    const controller = new AbortController();
    // Claude sa uključenim razmišljanjem ume da traje duže od starog modela;
    // ako ne stigne, pada na lokalni interpreter i demo ne staje.
    const timer = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(`${cfg.url}/functions/v1/ai-process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: cfg.anonKey,
      },
      body: JSON.stringify({
        text,
        mode,
        todayDate: today(),
        tomorrowDate: tomorrow(),
        context: buildContext(state, mode),
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return local;
    const data = (await res.json()) as { ok?: boolean; result?: Partial<AiResult> };
    if (!data.ok || !data.result?.suggestedAction) return local;
    const r = data.result;
    // Merge: AI output wins, local parsing fills gaps.
    return {
      ...local,
      ...r,
      intent: r.intent ?? local.intent,
      confidence: typeof r.confidence === "number" ? r.confidence : 0.9,
      suggestedAction: r.suggestedAction,
      source: "ai",
    } as AiResult;
  } catch {
    return local;
  }
}
