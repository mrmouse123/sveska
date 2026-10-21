// SVESKA transcribe — snimak glasa -> tekst, preko Whisper-kompatibilnog API-ja.
//
// Zašto postoji: aplikacija inače koristi pregledačev SpeechRecognition. Na
// Chrome-u to radi i besplatno je, ali na iOS Safariju srpski je slab, a u
// Firefox-u motora nema. Ova funkcija je put za te uređaje: klijent snimi
// zvuk i pošalje ga ovde, a mi ga prosledimo provajderu.
//
// Tajne (supabase secrets set …):
//   STT_API_KEY   obavezno — ključ provajdera (prihvata se i ime GROQ_API_KEY)
//   STT_BASE_URL  podrazumevano https://api.groq.com/openai/v1  (OpenAI-kompatibilno:
//                 za OpenAI stavi https://api.openai.com/v1)
//   STT_MODEL     podrazumevano whisper-large-v3  (za OpenAI: whisper-1)
//
// Anon ključ se odbija da niko bez naloga ne bi trošio kredit provajdera.
import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_BYTES = 8 * 1024 * 1024; // 60 s opus/aac je ispod 1 MB; 8 MB je komotno
const TIMEOUT_MS = 25_000;

/** Kratak nagoveštaj domena — Whisper ga koristi da bolje pogodi reči. Bez ličnih podataka. */
const PROMPT =
  "Zakazivanje poslova za majstore u Srbiji: klijenti, radnici, vreme, datumi, cene u evrima.";

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

/** Ime fajla po tipu — neki provajderi ga koriste da prepoznaju format. */
function fileNameFor(type: string): string {
  if (type.includes("mp4") || type.includes("m4a") || type.includes("aac")) return "audio.mp4";
  if (type.includes("ogg")) return "audio.ogg";
  if (type.includes("wav")) return "audio.wav";
  if (type.includes("mpeg") || type.includes("mp3")) return "audio.mp3";
  return "audio.webm";
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

    // Tajna je u dashboardu uneta kao GROQ_API_KEY; oba imena rade, STT_API_KEY ima prednost.
    const key = Deno.env.get("STT_API_KEY") ?? Deno.env.get("GROQ_API_KEY");
    if (!key) return json({ ok: false, reason: "no_api_key" });
    const base = (Deno.env.get("STT_BASE_URL") ?? "https://api.groq.com/openai/v1").replace(/\/$/, "");
    const model = Deno.env.get("STT_MODEL") ?? "whisper-large-v3";

    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) return json({ ok: false, reason: "bad_input" }, 400);
    if (audio.size > MAX_BYTES) return json({ ok: false, reason: "too_large" }, 413);

    const out = new FormData();
    out.append("file", audio, fileNameFor(audio.type));
    out.append("model", model);
    out.append("language", "sr");
    out.append("response_format", "json");
    out.append("temperature", "0");
    out.append("prompt", PROMPT);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${base}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: out,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      // Log je dijagnostički put — klijent dobija samo razlog, ne telo provajdera.
      console.error("[transcribe] provider", res.status, body);
      const reason =
        res.status === 401 || res.status === 403
          ? "provider_auth"
          : res.status === 429
            ? "rate_limited"
            : "provider_error";
      return json({ ok: false, reason, status: res.status });
    }

    const data = (await res.json()) as { text?: unknown };
    const text = typeof data.text === "string" ? data.text.trim() : "";
    return json({ ok: true, text });
  } catch (err) {
    console.error("[transcribe]", err);
    const aborted = err instanceof Error && err.name === "AbortError";
    return json({ ok: false, reason: aborted ? "timeout" : "exception" });
  }
});
