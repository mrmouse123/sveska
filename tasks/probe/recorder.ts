/**
 * Glasovni unos preko servera (iOS / bez SpeechRecognition) — tok na lažnom
 * MediaRecorder-u i stubovanom fetch-u. Dokazuje ono što se MOŽE dokazati bez
 * iPhone-a i bez ključa provajdera: zahtev ide na pravu adresu sa pravim
 * zaglavljima, mikrofon se pušta na svakom izlazu, greške dobijaju prave
 * kodove, otkaz ne šalje ništa, tvrda granica sama završava.
 *
 * Kvalitet samog prepoznavanja na iOS-u ovo NE dokazuje — to je test na uređaju
 * sa postavljenim STT_API_KEY.
 *
 *   npx esbuild tasks/probe/recorder.ts --bundle --format=esm --platform=node \
 *     --outfile=.probe/recorder.mjs --define:import.meta.env=globalThis.__ENV \
 *     --banner:js='globalThis.__ENV={};' && node .probe/recorder.mjs
 */
import {
  createRecorderSession,
  shouldUseServerStt,
  type RecorderDeps,
} from "../../src/lib/sveska/recorderService";
import { VOICE_MESSAGES, type VoiceErrorCode, type VoiceStatus } from "../../src/lib/sveska/voiceService";

// ---------------------------------------------------------------- lažno okruženje
let stoppedTracks = 0;
const fakeStream = { getTracks: () => [{ stop: () => void stoppedTracks++ }] };
let getUserMediaImpl: () => Promise<unknown> = async () => fakeStream;

const nav = {
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0",
  maxTouchPoints: 0,
  mediaDevices: { getUserMedia: () => getUserMediaImpl() },
};
Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true, writable: true });
const g = globalThis as unknown as Record<string, unknown>;
g["window"] = globalThis;
g["isSecureContext"] = true;
g["location"] = { hostname: "localhost" };

class FakeRecorder {
  static isTypeSupported = (t: string) => t === "audio/webm;codecs=opus";
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  mimeType: string;
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(_s: unknown, opts?: { mimeType?: string }) {
    this.mimeType = opts?.mimeType ?? "";
  }
  start() {
    this.state = "recording";
    this.timer = setInterval(() => {
      this.ondataavailable?.({ data: new Blob(["x".repeat(1500)], { type: "audio/webm" }) });
    }, 5);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.state = "inactive";
    queueMicrotask(() => this.onstop?.());
  }
}
g["MediaRecorder"] = FakeRecorder;

// ---------------------------------------------------------------- pomoćnici
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) bad++;
  console.log(`${cond ? "OK  " : "LOSE"}  ${label}${cond ? "" : `   ${detail}`}`);
}

type Seen = { url: string; auth: string; apikey: string; audioSize: number };
function makeDeps(
  respond: () => Response,
  over: Partial<RecorderDeps> = {},
): { deps: RecorderDeps; seen: Seen[] } {
  const seen: Seen[] = [];
  const deps: RecorderDeps = {
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      const h = (init?.headers ?? {}) as Record<string, string>;
      const body = init?.body as FormData;
      const audio = body?.get?.("audio");
      seen.push({
        url: String(url),
        auth: h["Authorization"] ?? "",
        apikey: h["apikey"] ?? "",
        audioSize: audio instanceof Blob ? audio.size : -1,
      });
      return respond();
    }) as typeof fetch,
    getSession: async () => ({ access_token: "tok-123" }),
    getConfig: () => ({ url: "https://proj.supabase.co", anonKey: "anon-key" }),
    maxMs: 60_000,
    ...over,
  };
  return { deps, seen };
}

const okJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function session(deps: RecorderDeps) {
  const statuses: VoiceStatus[] = [];
  let delivered: string | null = null;
  let errorCode: VoiceErrorCode | null = null;
  let errorMsg = "";
  const s = createRecorderSession(
    {
      onStatus: (st) => void statuses.push(st),
      onFinish: (t) => void (delivered = t),
      onError: (c, m) => {
        errorCode = c;
        errorMsg = m;
      },
    },
    deps,
  );
  return {
    s,
    statuses,
    get delivered() {
      return delivered;
    },
    get errorCode() {
      return errorCode;
    },
    get errorMsg() {
      return errorMsg;
    },
  };
}

// ---------------------------------------------------------------- A: uspeh
{
  stoppedTracks = 0;
  const { deps, seen } = makeDeps(() => okJson({ ok: true, text: "pošalji Marka kod Ane Marković" }));
  const x = session(deps);
  x.s.startListening();
  await wait(40);
  x.s.finishVoiceInput();
  await wait(30);
  console.log("=== A: snimi -> ZAVRŠI -> tekst ===");
  check("tekst isporučen", x.delivered === "pošalji Marka kod Ane Marković", String(x.delivered));
  check("jedan zahtev", seen.length === 1, `zahteva: ${seen.length}`);
  check("adresa je edge funkcija transcribe", seen[0]?.url.endsWith("/functions/v1/transcribe") === true, seen[0]?.url);
  check("Authorization: Bearer <token>", seen[0]?.auth === "Bearer tok-123", seen[0]?.auth);
  check("apikey: anon", seen[0]?.apikey === "anon-key", seen[0]?.apikey);
  check("zvuk je u telu (>0 B)", (seen[0]?.audioSize ?? 0) > 0, String(seen[0]?.audioSize));
  check("mikrofon pušten", stoppedTracks >= 1, `stop() pozvan ${stoppedTracks}x`);
  check(
    "statusi: dozvola -> sluša -> obrađuje",
    JSON.stringify(x.statuses) === JSON.stringify(["requesting_permission", "listening", "processing"]),
    JSON.stringify(x.statuses),
  );
}

// ---------------------------------------------------------------- B: nema ključa
{
  const { deps } = makeDeps(() => okJson({ ok: false, reason: "no_api_key" }));
  const x = session(deps);
  x.s.startListening();
  await wait(30);
  x.s.finishVoiceInput();
  await wait(30);
  console.log("\n=== B: provajder nije podešen ===");
  check("kod greške stt-unavailable", x.errorCode === "stt-unavailable", String(x.errorCode));
  check("poruka za korisnika postoji", x.errorMsg === VOICE_MESSAGES["stt-unavailable"], x.errorMsg);
}

// ---------------------------------------------------------------- C: server 500
{
  const { deps } = makeDeps(() => okJson({ ok: false, reason: "exception" }, 500));
  const x = session(deps);
  x.s.startListening();
  await wait(30);
  x.s.finishVoiceInput();
  await wait(30);
  console.log("\n=== C: greška servera ===");
  check("kod greške network", x.errorCode === "network", String(x.errorCode));
}

// ---------------------------------------------------------------- D: prazan tekst
{
  const { deps } = makeDeps(() => okJson({ ok: true, text: "   " }));
  const x = session(deps);
  x.s.startListening();
  await wait(30);
  x.s.finishVoiceInput();
  await wait(30);
  console.log("\n=== D: ništa nije prepoznato ===");
  check("kod greške no-speech", x.errorCode === "no-speech", String(x.errorCode));
}

// ---------------------------------------------------------------- E: otkaz
{
  stoppedTracks = 0;
  const { deps, seen } = makeDeps(() => okJson({ ok: true, text: "x" }));
  const x = session(deps);
  x.s.startListening();
  await wait(30);
  x.s.cancelVoiceSession();
  await wait(30);
  console.log("\n=== E: otkaz usred snimanja ===");
  check("ništa nije poslato", seen.length === 0, `zahteva: ${seen.length}`);
  check("mikrofon pušten", stoppedTracks >= 1);
  check("status idle", x.statuses[x.statuses.length - 1] === "idle", String(x.statuses.at(-1)));
  check("ništa nije isporučeno", x.delivered === null);
}

// ---------------------------------------------------------------- F: nije prijavljen
{
  const { deps, seen } = makeDeps(() => okJson({ ok: true, text: "x" }), { getSession: async () => null });
  const x = session(deps);
  x.s.startListening();
  await wait(30);
  x.s.finishVoiceInput();
  await wait(30);
  console.log("\n=== F: bez sesije ===");
  check("kod greške signin-required", x.errorCode === "signin-required", String(x.errorCode));
  check("ništa nije poslato", seen.length === 0, `zahteva: ${seen.length}`);
}

// ---------------------------------------------------------------- G: tvrda granica
{
  const { deps, seen } = makeDeps(() => okJson({ ok: true, text: "automatski" }), { maxMs: 40 });
  const x = session(deps);
  x.s.startListening();
  await wait(100);
  console.log("\n=== G: tvrda granica trajanja sama završava ===");
  check("zahtev poslat bez ZAVRŠI", seen.length === 1, `zahteva: ${seen.length}`);
  check("tekst isporučen", x.delivered === "automatski", String(x.delivered));
}

// ---------------------------------------------------------------- H: dozvola odbijena
{
  stoppedTracks = 0;
  getUserMediaImpl = async () => {
    const e = new Error("denied");
    e.name = "NotAllowedError";
    throw e;
  };
  const { deps, seen } = makeDeps(() => okJson({ ok: true, text: "x" }));
  const x = session(deps);
  x.s.startListening();
  await wait(30);
  console.log("\n=== H: korisnik odbio mikrofon ===");
  check("kod greške not-allowed", x.errorCode === "not-allowed", String(x.errorCode));
  check("ništa nije poslato", seen.length === 0);
  getUserMediaImpl = async () => fakeStream;
}

// ---------------------------------------------------------------- I: izbor puta
{
  console.log("\n=== I: kad se koristi server ===");
  check("bez SpeechRecognition -> server", shouldUseServerStt() === true);
  g["SpeechRecognition"] = class {};
  check("desktop Chrome sa motorom -> pregledač", shouldUseServerStt() === false);
  nav.userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1";
  check("iPhone, čak i sa motorom -> server (Groq)", shouldUseServerStt() === true);
  delete g["SpeechRecognition"];
  check("iPhone bez motora -> server", shouldUseServerStt() === true);
  g["SpeechRecognition"] = class {};
  nav.userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605.1";
  nav.maxTouchPoints = 5;
  check("iPadOS koji se predstavlja kao Mac -> server", shouldUseServerStt() === true);
  nav.maxTouchPoints = 0;
  check("pravi Mac -> pregledač", shouldUseServerStt() === false);
}

console.log("");
console.log(bad === 0 ? "SVE PROLAZI" : `${bad} pogresno`);
if (bad > 0) process.exitCode = 1;
