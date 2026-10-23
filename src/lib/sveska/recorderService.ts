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
  getCtor,
  hasBrowserRecognition,
  isSecureContextOk,
  resetTrace,
  traceLine,
  type SR,
  type VoiceCallbacks,
  type VoiceErrorCode,
  type VoiceSession,
} from "./voiceService";

export const MAX_RECORD_MS = 60_000;

/**
 * Pregled uživo na serverskom putu: dok MediaRecorder snima za Groq, Apple-ov
 * motor paralelno prepoznaje SAMO za prikaz, reč po reč. Tačan tekst stiže od
 * Groq-a posle ZAVRŠI i zamenjuje pregled. Dva slušaoca na istom mikrofonu umeju
 * da se potuku na iOS-u — ako snimanje pukne (greška snimača, prekid ili
 * utišanje trake) u sesiji u kojoj je pregled RADIO, to se broji kao neuspeh.
 * Posle PREVIEW_MAX_FAILURES uzastopnih neuspeha pregled se više ne pokušava na
 * ovom uređaju; jedna uspešna sesija sa pregledom briše brojač. Tako jedan
 * telefonski poziv usred diktiranja ne gasi tekst uživo zauvek.
 */
export const PREVIEW_OFF_KEY = "sveska:voice-preview-failures";
export const PREVIEW_MAX_FAILURES = 2;

function previewFailures(): number {
  try {
    return typeof localStorage === "undefined" ? 0 : Number(localStorage.getItem(PREVIEW_OFF_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

const previewDisabled = (): boolean => previewFailures() >= PREVIEW_MAX_FAILURES;

function notePreviewFailure(): void {
  try {
    localStorage.setItem(PREVIEW_OFF_KEY, String(previewFailures() + 1));
  } catch {
    /* privatni režim — broji se samo u ovoj sesiji */
  }
}

function notePreviewSuccess(): void {
  try {
    localStorage.removeItem(PREVIEW_OFF_KEY);
  } catch {
    /* ništa */
  }
}

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
 * Server se koristi SAMO tamo gde pregledač ne valja: iOS (slab srpski u
 * Apple-ovom motoru) i gde SpeechRecognition ne postoji (Firefox). Chrome
 * ostaje na pregledaču — radi, trenutan je i besplatan.
 *
 * Istorija: 2026-10-21 je iOS nakratko išao na Apple-ov motor jer provajdera
 * nije bilo (Claude API ne prima zvuk). Istog dana je napravljen Groq ključ
 * (`STT_API_KEY`), pa je iPhone vraćen na server.
 */
export function shouldUseServerStt(): boolean {
  if (!canRecord()) return false;
  return isIos() || !hasBrowserRecognition();
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
  // Provajder nije podešen, odbija ključ, ograničio nas je ili nije stigao —
  // ni u jednom od tih slučajeva internet korisnika nije kriv, pa poruka ne
  // sme da glasi „proveri internet".
  switch (data.reason) {
    case "no_api_key":
    case "provider_auth":
    case "rate_limited":
    case "timeout":
      return { ok: false, code: "stt-unavailable" };
    case "bad_input":
    case "too_large":
      return { ok: false, code: "unknown" };
    default:
      return { ok: false, code: "network" };
  }
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
  let preview: SR | null = null;
  /** Da li je pregled u OVOJ sesiji uopšte krenuo — prekidač gleda ovo, ne `preview`,
   *  jer sukob na iOS-u prvo ubije pregled (preview = null) pa tek onda snimanje. */
  let previewRan = false;
  let previewRestarts = 0;

  function stopPreview() {
    const p = preview;
    preview = null;
    if (!p) return;
    p.onresult = null;
    p.onerror = null;
    p.onend = null;
    try {
      p.abort();
    } catch {
      /* već stao */
    }
  }

  /** Snimanje je stradalo u sesiji sa pregledom: pregled je osumnjičen. */
  function recordingBroken(where: string) {
    traceLine(`${where} previewRan=${previewRan}`);
    if (previewRan) notePreviewFailure();
    stopPreview();
  }

  /** Apple-ov motor samo za prikaz; svaka greška ga tiho gasi, snimanje ide dalje. */
  function startPreview() {
    if (preview || !active || previewDisabled()) {
      traceLine(`preview: preskočen (failures=${previewFailures()})`);
      return;
    }
    const Ctor = getCtor();
    if (!Ctor) return traceLine("preview: nema motora");
    let p: SR;
    try {
      p = new Ctor();
      p.lang = "sr-RS";
      p.continuous = true;
      p.interimResults = true;
    } catch {
      return traceLine("preview: konstruktor bacio");
    }
    preview = p;
    p.onresult = (event: unknown) => {
      if (preview !== p) return;
      const e = event as { results: { length: number; [i: number]: { 0: { transcript: string } } } };
      const parts: string[] = [];
      for (let i = 0; i < e.results.length; i++) parts.push(e.results[i]![0].transcript.trim());
      const text = parts.filter(Boolean).join(" ");
      traceLine(`preview onresult n=${e.results.length} «${text}»`);
      // Sve ide kao „privremeno": konačan tekst daje Groq, ne ovaj motor.
      cb.onTranscript?.("", text);
    };
    p.onerror = (event: unknown) => {
      if (preview !== p) return;
      traceLine(`preview onerror ${(event as { error?: string }).error ?? "?"}`);
      stopPreview();
    };
    p.onend = () => {
      if (preview !== p || !active) return;
      // Safari ume da odbije start() na istoj instanci — onda nova; i gornja granica,
      // da start→onend ping-pong ne vrti motor u prazno do kraja snimanja.
      previewRestarts++;
      traceLine(`preview onend → restart #${previewRestarts}`);
      if (previewRestarts > 20) return stopPreview();
      try {
        p.start();
      } catch {
        stopPreview();
        startPreview();
      }
    };
    try {
      p.start();
      previewRan = true;
      traceLine("preview: pokrenut");
    } catch {
      traceLine("preview: start() bacio");
      stopPreview();
    }
  }

  const setStatus = (s: Parameters<NonNullable<VoiceCallbacks["onStatus"]>>[0]) =>
    cb.onStatus?.(s);

  function releaseMic() {
    // Mikrofon se pušta na SVAKOM izlazu — i uspehu i grešci i otkazu.
    stopPreview();
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  function clearCap() {
    if (capTimer) clearTimeout(capTimer);
    capTimer = null;
    cb.onCountdown?.(null);
  }

  function fail(code: VoiceErrorCode) {
    traceLine(`fail ${code}`);
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
    if (active) return; // dva starta bi otvorila dva toka; prvi bi ostao bez stop()
    resetTrace("startListening (snimač → server)");
    if (!canRecord()) return fail("unsupported");
    if (!isSecureContextOk()) return fail("insecure");
    chunks = [];
    previewRan = false;
    previewRestarts = 0;
    finished = false;
    active = true;
    clearCap();
    cb.onTranscript?.("", "");
    setStatus("requesting_permission");

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      // Otkazano dok je upit za dozvolu bio otvoren: korisnik je već na
      // početnom ekranu i ne sme tamo da dobije „nema dozvolu".
      if (!active) return;
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
      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => void handleStop();
      recorder.onerror = () => {
        recordingBroken("recorder onerror");
        fail("audio-capture");
      };
      // Komadi na svaku sekundu, da snimak ne zavisi od jednog velikog `stop`.
      // start() ume da baci (iOS ugasi zvučnu traku kad se ekran zaključa između
      // dozvole i starta) — izvan try bi to bilo neuhvaćeno odbijanje sa
      // mikrofonom koji ostaje upaljen.
      recorder.start(1000);
    } catch {
      return fail("audio-capture");
    }
    setStatus("listening");
    capTimer = setTimeout(() => finishVoiceInput(), deps.maxMs);
    // Tek POSLE starta snimanja: ako pregled zasmeta, snimanje je već u toku i
    // greška se vidi kao greška snimanja, pa se pregled gasi.
    startPreview();
    const track = stream.getTracks()[0];
    if (track) {
      track.onended = () => {
        if (!active) return;
        recordingBroken("track onended");
        fail("audio-capture");
      };
      // Sukob na iOS-u ume da traku samo UTIŠA, ne i prekine: snimak bi bio
      // tišina, Groq bi vratio prazno, i ništa ne bi ukazalo na pregled.
      track.onmute = () => {
        if (!active) return;
        recordingBroken("track onmute");
      };
    }
  }

  async function handleStop() {
    const blob = new Blob(chunks, { type: mime || chunks[0]?.type || "audio/webm" });
    traceLine(`handleStop blob=${blob.size}B previewRan=${previewRan}`);
    recorder = null;
    releaseMic();
    // Otkaz nikad ne stiže ovde (otkaz skida onstop pre stop()), pa prazan snimak
    // znači samo jedno: ZAVRŠI pre ijednog komada — recimo dok je upit za dozvolu
    // još otvoren. Ranija „otkaz" grana je taj slučaj gutala i panel je ostajao na
    // „čekamo dozvolu" zauvek.
    if (blob.size === 0) return fail("no-speech");

    setStatus("processing");
    upload = new AbortController();
    const result = await transcribeAudio(blob, deps, upload.signal);
    if (upload === null) return; // otkazano tokom slanja
    upload = null;
    traceLine(`transcribe ${result.ok ? `ok «${result.text}»` : `greška ${result.code}`}`);
    if (!result.ok) return fail(result.code);
    if (!result.text) return fail("no-speech");
    // Sesija sa pregledom je isporučila tekst: pregled nije smetao, brojač se briše.
    if (previewRan) notePreviewSuccess();
    cb.onTranscript?.(result.text, "");
    cb.onFinish?.(result.text);
  }

  /** ZAVRŠI ili tvrda granica trajanja. */
  function finishVoiceInput() {
    traceLine(`finish active=${active} finished=${finished} chunks=${chunks.length}`);
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
    traceLine("cancel");
    active = false;
    finished = true;
    clearCap();
    if (upload) {
      upload.abort();
      upload = null;
    }
    if (recorder) {
      // Rukovaoci se skidaju i kad je snimač već „inactive": posle ZAVRŠI su
      // poslednji dataavailable i stop još u redu događaja, i bez ovoga bi
      // otkaz u tom procepu ipak poslao snimak i isporučio tekst.
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          /* već stao */
        }
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
