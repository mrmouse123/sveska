/**
 * recorderService — glasovni unos preko servera, za uređaje gde pregledačev
 * SpeechRecognition ne valja (iOS Safari: slab srpski) ili ne postoji (Firefox).
 *
 * Tok: MediaRecorder snima -> korisnik pritisne ZAVRŠI (ili istekne tvrda
 * granica) -> snimak ide na edge funkciju `transcribe` -> tekst se isporučuje
 * istim povratnim pozivima kao i pregledačev put, pa UI ne zna razliku.
 *
 * Namerno NEMA pravila tišine: na gradilištu tišina nije pouzdan signal, a
 * merenje jačine zvuka na iOS-u traži AudioContext koji sme da krene tek na
 * dodir. Eksplicitno ZAVRŠI je jednostavnije i iskrenije.
 */
import { getSupabaseConfig } from "./supabaseService";
import { getSession } from "./auth";
import {
  VOICE_MESSAGES,
  hasBrowserRecognition,
  isSecureContextOk,
  type VoiceCallbacks,
  type VoiceErrorCode,
  type VoiceSession,
} from "./voiceService";

export const MAX_RECORD_MS = 60_000;

/** Zavisnosti koje proba zamenjuje; u aplikaciji su podrazumevane. */
export type RecorderDeps = {
  fetch: typeof fetch;
  getSession: () => Promise<{ access_token: string } | null>;
  getConfig: () => { url: string; anonKey: string } | null;
  maxMs: number;
};

const defaultDeps = (): RecorderDeps => ({
  fetch: (...args) => fetch(...args),
  getSession,
  getConfig: getSupabaseConfig,
  maxMs: MAX_RECORD_MS,
});

export function canRecord(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

/** iPhone, iPad (i iPadOS koji se predstavlja kao Mac sa dodirom) i iPod. */
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent ?? "";
  if (/iP(hone|ad|od)/.test(ua)) return true;
  return /Mac/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
}

/**
 * Server se koristi SAMO tamo gde pregledač nema nikakav motor (Firefox).
 *
 * iOS je prvobitno išao na server zbog slabog srpskog u Apple-ovom motoru,
 * ali odluka je da projekat nema STT provajdera — a Claude API ne prima zvuk,
 * pa serverski put bez provajdera na iPhone-u daje samo „nije podešeno".
 * Apple-ov motor, kakav je, bolji je od zatvorenih vrata. Serverski put
 * ostaje spreman: čim se postavi STT_API_KEY i ovde vrati `isIos() ||`,
 * iPhone opet ide na server.
 */
export function shouldUseServerStt(): boolean {
  if (!canRecord()) return false;
  return !hasBrowserRecognition();
}

type TranscribeResult = { ok: true; text: string } | { ok: false; code: VoiceErrorCode };

/** Snimak -> tekst preko edge funkcije `transcribe`. */
export async function transcribeAudio(
  blob: Blob,
  deps: RecorderDeps = defaultDeps(),
  signal?: AbortSignal,
): Promise<TranscribeResult> {
  const cfg = deps.getConfig();
  if (!cfg) return { ok: false, code: "stt-unavailable" };
  const session = await deps.getSession();
  if (!session) return { ok: false, code: "signin-required" };

  const body = new FormData();
  body.append("audio", blob, "audio");
  let res: Response;
  try {
    res = await deps.fetch(`${cfg.url}/functions/v1/transcribe`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: cfg.anonKey },
      body,
      ...(signal ? { signal } : {}),
    });
  } catch {
    return { ok: false, code: "network" };
  }
  if (!res.ok) return { ok: false, code: res.status === 401 ? "signin-required" : "network" };

  const data = (await res.json().catch(() => null)) as
    | { ok: true; text: string }
    | { ok: false; reason: string }
    | null;
  if (!data) return { ok: false, code: "network" };
  if (data.ok) return { ok: true, text: (data.text ?? "").trim() };
  // Provajder nije podešen ili odbija ključ — korisniku je to ista stvar.
  if (data.reason === "no_api_key" || data.reason === "provider_auth") {
    return { ok: false, code: "stt-unavailable" };
  }
  return { ok: false, code: "network" };
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined;
  }
  // Opus u webm (Chrome, Firefox) pa AAC u mp4 (Safari). Prvi koji prođe.
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

export function createRecorderSession(
  cb: VoiceCallbacks,
  deps: RecorderDeps = defaultDeps(),
): VoiceSession {
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let mime = "";
  let active = false;
  let finished = false;
  let capTimer: ReturnType<typeof setTimeout> | null = null;
  let upload: AbortController | null = null;

  const setStatus = (s: Parameters<NonNullable<VoiceCallbacks["onStatus"]>>[0]) =>
    cb.onStatus?.(s);

  function releaseMic() {
    // Mikrofon se pušta na SVAKOM izlazu — i uspehu i grešci i otkazu.
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  function clearCap() {
    if (capTimer) clearTimeout(capTimer);
    capTimer = null;
    cb.onCountdown?.(null);
  }

  function fail(code: VoiceErrorCode) {
    active = false;
    finished = true;
    clearCap();
    if (recorder && recorder.state !== "inactive") {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch {
        /* već stao */
      }
    }
    recorder = null;
    releaseMic();
    setStatus("error");
    cb.onError?.(code, VOICE_MESSAGES[code]);
  }

  async function startListening() {
    if (!canRecord()) return fail("unsupported");
    if (!isSecureContextOk()) return fail("insecure");
    chunks = [];
    finished = false;
    active = true;
    clearCap();
    cb.onTranscript?.("", "");
    setStatus("requesting_permission");

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") return fail("not-allowed");
      if (name === "NotFoundError" || name === "OverconstrainedError") return fail("audio-capture");
      return fail("unknown");
    }
    if (!active) {
      // Otkazano dok smo čekali dozvolu.
      releaseMic();
      return;
    }

    const picked = pickMimeType();
    mime = picked ?? "";
    try {
      recorder = picked ? new MediaRecorder(stream, { mimeType: picked }) : new MediaRecorder(stream);
    } catch {
      return fail("audio-capture");
    }
    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => void handleStop();
    recorder.onerror = () => fail("audio-capture");
    // Komadi na svaku sekundu, da snimak ne zavisi od jednog velikog `stop`.
    recorder.start(1000);
    setStatus("listening");
    capTimer = setTimeout(() => finishVoiceInput(), deps.maxMs);
  }

  async function handleStop() {
    const blob = new Blob(chunks, { type: mime || chunks[0]?.type || "audio/webm" });
    recorder = null;
    releaseMic();
    if (finished && !active && upload === null && blob.size === 0) {
      // Stigli smo ovde preko otkaza — ništa ne šaljemo.
      return;
    }
    if (blob.size === 0) return fail("no-speech");

    setStatus("processing");
    upload = new AbortController();
    const result = await transcribeAudio(blob, deps, upload.signal);
    if (upload === null) return; // otkazano tokom slanja
    upload = null;
    if (!result.ok) return fail(result.code);
    if (!result.text) return fail("no-speech");
    cb.onTranscript?.(result.text, "");
    cb.onFinish?.(result.text);
  }

  /** ZAVRŠI ili tvrda granica trajanja. */
  function finishVoiceInput() {
    if (!active || finished) return;
    finished = true;
    active = false;
    clearCap();
    if (recorder && recorder.state !== "inactive") {
      recorder.stop(); // -> onstop -> handleStop
    } else {
      void handleStop();
    }
  }

  function cancelVoiceSession() {
    active = false;
    finished = true;
    clearCap();
    if (upload) {
      upload.abort();
      upload = null;
    }
    if (recorder && recorder.state !== "inactive") {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch {
        /* već stao */
      }
    }
    recorder = null;
    chunks = [];
    releaseMic();
    setStatus("idle");
  }

  return {
    startListening: () => void startListening(),
    stopListening: cancelVoiceSession,
    finishVoiceInput,
    // Pravilo tišine ovde ne postoji; poziv je bezopasan da UI ne mora da zna.
    resetSilenceTimer: () => undefined,
    cancelVoiceSession,
    getVoiceStatus: () => ({ active, hasSpoken: chunks.length > 0, finalText: "" }),
  };
}
