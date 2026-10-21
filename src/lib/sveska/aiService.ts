import type { AiResult, DemoState, Mode } from "./types";
import { interpretLocal, targetJob } from "./interpreter";
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
 * mikrofona, početak snimanja). Ping na serveru napravi jedan sićušan pravi
 * poziv (stoti deo centa) da zagreje i vezu i keš prompta — ping bez poziva
 * nije zagrevao prvi Claude poziv. Najviše jednom u 90 s; greške se gutaju.
 */
export function warmAi(): void {
  const now = Date.now();
  if (now - lastWarm < WARM_EVERY_MS) return;
  // Brojač se pomera odmah (dva poziva u istom trenutku — otvaranje app-a pa
  // mikrofon — ne smeju da naprave dva pinga), a vraća se na nulu ako ping ne
  // krene: ako se sesija još nije slegla, sledeći pritisak mora da prođe.
  lastWarm = now;
  void (async () => {
    try {
      const cfg = getSupabaseConfig();
      if (!cfg) return void (lastWarm = 0);
      const session = await getSession();
      if (!session) return void (lastWarm = 0);
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
      lastWarm = 0; // zagrevanje nije uspelo — sledeći pokušaj sme odmah
    }
  })();
}

/**
 * Spajanje AI i lokalnog rezultata — PO AKCIJI, ne slepo.
 *
 * Staro `{...local, ...ai}` je bilo bezopasno dok je AI umeo samo CREATE/ASSIGN:
 * lokalne podrazumevane vrednosti (sutra, 09:00) tamo su bile prihvatljive. Za
 * otkazivanje i izmenu one postaju pogrešan odgovor:
 *  - `jobId` ume da da samo lokalni interpreter (AI ne vidi ID-jeve poslova), pa
 *    bi otkazivanje po AI klijentu nasledilo lokalni posao DRUGOG klijenta;
 *  - „promeni cenu kod Petrovića" koji je lokal pročitao kao CREATE_JOB doneo bi
 *    izmeni i datum „sutra" i vreme „09:00" — posao bi se tiho pomerio.
 * Pravilo: lokal popunjava rupe samo kad su se složili oko akcije; `jobId` se
 * UVEK računa iznova iz spojenog klijenta; kad posla nema, kartica se ne nudi.
 */
export function mergeAiResult(
  local: AiResult,
  r: Partial<AiResult> & { suggestedAction: AiResult["suggestedAction"] },
  state: DemoState,
  mode: Mode,
): AiResult {
  const sameAction = r.suggestedAction === local.suggestedAction;
  const merged = {
    ...(sameAction ? local : {}),
    ...r,
    intent: r.intent ?? local.intent,
    confidence: typeof r.confidence === "number" ? r.confidence : 0.9,
    suggestedAction: r.suggestedAction,
    source: "ai",
  } as AiResult;
  delete merged.jobId;

  if (merged.suggestedAction === "CANCEL_JOB" || merged.suggestedAction === "UPDATE_JOB") {
    // Za otkazivanje izgovoreni datum KAŽE KOJI posao; za izmenu je to NOVI datum.
    const onDate = merged.suggestedAction === "CANCEL_JOB" ? merged.date : undefined;
    const job = targetJob(state, mode, merged.customer, onDate);
    if (!job) {
      return {
        ...merged,
        suggestedAction: "UNKNOWN",
        answer: merged.customer
          ? `Nemam aktivan posao kod „${merged.customer}".`
          : "Reci kod koga je posao na koji misliš.",
      };
    }
    merged.jobId = job.id;
  }
  return merged;
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
    // Prisilni poziv alata na Haiku 5.5 preskače razmišljanje, pa je odgovor
    // 2–4 s; 20 s je rezerva za hladan start — ako ne stigne, pada na lokalni
    // interpreter i demo ne staje.
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
    return mergeAiResult(
      local,
      data.result as Partial<AiResult> & { suggestedAction: AiResult["suggestedAction"] },
      state,
      mode,
    );
  } catch {
    return local;
  }
}
