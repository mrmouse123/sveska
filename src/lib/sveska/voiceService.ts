/**
 * voiceService — real browser SpeechRecognition (sr-RS) with a 10 second
 * silence rule. A browser recognition session ending is NOT the end of the
 * user's input: we restart it silently until 10s pass without new speech,
 * or the user presses ZAVRŠI.
 */

export const SILENCE_MS = 10_000;

export type VoiceStatus =
  | "idle"
  | "requesting_permission"
  | "listening"
  | "paused"
  | "processing"
  | "error";

export type VoiceErrorCode =
  | "unsupported"
  | "insecure"
  | "not-allowed"
  | "audio-capture"
  | "no-speech"
  | "network"
  | "stt-unavailable"
  | "signin-required"
  | "language-not-supported"
  | "unknown";

export const VOICE_MESSAGES: Record<VoiceErrorCode, string> = {
  unsupported: "Ovaj browser trenutno ne podržava glasovni unos.",
  insecure: "Glasovni unos radi samo preko sigurne (HTTPS) veze.",
  "not-allowed":
    "SVESKA nema dozvolu za mikrofon. Otvori dozvole za ovaj sajt, uključi Mikrofon i pokušaj ponovo.",
  "audio-capture": "Mikrofon trenutno nije dostupan. Proveri podešavanja uređaja.",
  "no-speech": "Nisam čula šta si rekao. Pokušaj ponovo.",
  network: "Glasovna usluga trenutno nije dostupna. Proveri internet i pokušaj ponovo.",
  unknown: "Glasovni unos trenutno nije dostupan. Možeš i da otkucaš komandu.",
  "stt-unavailable":
    "Prepoznavanje govora preko servera još nije podešeno. Možeš i da otkucaš komandu.",
  "signin-required": "Prijavi se da bi glasovni unos radio na ovom uređaju.",
  "language-not-supported":
    "Ovaj uređaj ne prepoznaje srpski govor. Možeš i da otkucaš komandu.",
};

export type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: unknown) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

export function getCtor(): (new () => SR) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"] ?? null) as
    | (new () => SR)
    | null;
}

/** Da li pregledač ima SOPSTVENI motor za prepoznavanje (Chrome: da, Firefox: ne). */
export const hasBrowserRecognition = (): boolean => Boolean(getCtor());

export function isVoiceSupported(): boolean {
  return hasBrowserRecognition();
}

export function isSecureContextOk(): boolean {
  if (typeof window === "undefined") return true;
  return window.isSecureContext || window.location.hostname === "localhost";
}

export type VoiceCallbacks = {
  onStatus?: (s: VoiceStatus) => void;
  onTranscript?: (text: string, interim: string) => void;
  /** Seconds remaining before auto-finish; null while the user is speaking. */
  onCountdown?: (secondsLeft: number | null) => void;
  onError?: (code: VoiceErrorCode, message: string) => void;
  onFinish?: (finalText: string) => void;
};

const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
const joinText = (a: string, b: string) => `${a} ${b}`.replace(/\s+/g, " ").trim();

/**
 * Trag događaja prepoznavača — samo u memoriji, poslednjih TRACE_MAX redova.
 * Dupliranje na Androidu je popravljano dva puta na osnovu PRETPOSTAVKE šta motor
 * šalje; treći put se popravlja iz stvarnog toka. Dugme DIJAGNOSTIKA kopira trag
 * u klipbord; ništa se ne šalje nigde (trag sadrži izgovoreni tekst).
 */
const TRACE_MAX = 300;
let trace: string[] = [];
let traceT0 = 0;
function traceLine(line: string) {
  const t = traceT0 ? String(Date.now() - traceT0).padStart(6, " ") : "     0";
  trace.push(`${t}ms ${line}`);
  if (trace.length > TRACE_MAX) trace = trace.slice(-TRACE_MAX);
}
export function getVoiceTrace(): string {
  const ua = typeof navigator === "undefined" ? "?" : navigator.userAgent;
  return [`SVESKA glas · ${new Date().toISOString()}`, `UA: ${ua}`, ...trace].join("\n");
}

export function createVoiceSession(cb: VoiceCallbacks) {
  let rec: SR | null = null;
  let finalText = "";
  /** Konačan tekst iz sesija pre poslednjeg restarta prepoznavanja. */
  let committed = "";
  /** Konačan tekst TEKUĆE sesije — gradi se iznova iz celog niza, nikad dopisuje. */
  let sessionFinal = "";
  /** Poslednja konačna rečenica tekuće sesije — tačno ono što Android zna da ponovi. */
  let lastFinal = "";
  /** Čuvari posle restarta: poslednja rečenica prethodne sesije, i ceo njen tekst. */
  let replayGuards: string[] = [];
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let deadline = 0;
  let hasSpoken = false;
  let active = false; // session (not browser recognition) is running
  let finished = false;
  let permissionBlocked = false;

  const setStatus = (s: VoiceStatus) => cb.onStatus?.(s);

  /** Ako nova sesija počinje rečenicom kojom je prethodna završila, to je ponovna isporuka. */
  function dropReplay(text: string): string {
    const t = norm(text);
    // Duži čuvar prvi, da ceo tekst sesije ima prednost nad poslednjom rečenicom.
    for (const guard of [...replayGuards].sort((a, b) => b.length - a.length)) {
      const g = norm(guard);
      if (!g) continue;
      if (t === g) return "";
      if (t.startsWith(`${g} `)) return text.trim().slice(guard.trim().length).trim();
    }
    return text;
  }

  function clearTimers() {
    if (silenceTimer) clearTimeout(silenceTimer);
    if (tickTimer) clearInterval(tickTimer);
    silenceTimer = null;
    tickTimer = null;
    deadline = 0;
    cb.onCountdown?.(null);
  }

  /**
   * Called on every meaningful speech activity. Only one timer ever exists.
   * `visible=false` naoružava rok bez odbrojavanja na panelu — za mikrofon koji
   * je tek otvoren, da korisnik ne gleda „10s, 9s…" pre nego što išta kaže.
   */
  function resetSilenceTimer(visible = true) {
    clearTimers();
    if (visible) hasSpoken = true;
    deadline = Date.now() + SILENCE_MS;
    silenceTimer = setTimeout(() => finishVoiceInput(), SILENCE_MS);
    if (!visible) return;
    tickTimer = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      cb.onCountdown?.(left);
    }, 250);
  }

  function stopRecognition() {
    const r = rec;
    rec = null;
    if (!r) return;
    r.onresult = null;
    r.onerror = null;
    r.onend = null;
    r.onstart = null;
    try {
      r.abort();
    } catch {
      /* ignore */
    }
  }

  function startRecognition() {
    const Ctor = getCtor();
    if (!Ctor) return;
    // Nikad dva živa prepoznavača. Bez ovoga je stari ostajao vezan i nastavljao
    // da dopisuje u isti `finalText`, pa se svaka rečenica pojavljivala dvaput.
    stopRecognition();
    const r = new Ctor();
    rec = r;
    r.lang = "sr-RS";
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    // Svaki rukovalac proverava da li je JOŠ aktuelan. Zamenjena instanca ume
    // da ispali događaj i posle zamene — to je bio drugi izvor dupliranja.
    const current = () => r === rec;

    r.onstart = () => {
      traceLine(`onstart current=${current()} active=${active}`);
      if (!current() || !active) return;
      setStatus("listening");
      // Pravilo tišine se naoružava od prvog starta, ne od prve reči: ko otvori
      // mikrofon i ne kaže ništa, inače bi vrteo restart-petlju bez kraja, a
      // panel tvrdi „automatski završavam posle 10 s tišine".
      if (!silenceTimer) resetSilenceTimer(false);
    };

    r.onresult = (event: unknown) => {
      if (!current()) return;
      const e = event as {
        resultIndex: number;
        results: {
          length: number;
          [i: number]: { isFinal: boolean; 0: { transcript: string } };
        };
      };
      // Android Chrome isporučuje KUMULATIVNO: svaki događaj nosi sve dosadašnje
      // rečenice iznova, sve konačne, uz resultIndex 0. Dopisivanje od resultIndex
      // je zato drugu rečenicu videlo kao „prva + druga", treću kao „prva + druga
      // + treća" — i tako se svaka rečenica pojavljivala po više puta. Desktop
      // šalje pravi indeks, pa tamo nije dupliralo. Lek: tekuća sesija se gradi
      // iznova iz CELOG niza, pa je kumulativna isporuka bezopasna.
      const finals: string[] = [];
      let interim = "";
      const raw: string[] = [];
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i]!;
        const chunk = res[0].transcript.trim();
        raw.push(`${res.isFinal ? "F" : "I"}«${chunk}»`);
        if (!chunk) continue;
        if (res.isFinal) finals.push(chunk);
        else interim += ` ${chunk}`;
      }
      const joined = finals.join(" ");
      sessionFinal = dropReplay(joined);
      if (finals.length) lastFinal = finals[finals.length - 1]!;
      finalText = joinText(committed, sessionFinal);
      traceLine(
        `onresult idx=${e.resultIndex} n=${e.results.length} ${raw.join(" ")} | ` +
          `guards=${JSON.stringify(replayGuards)} drop=«${joined}»→«${sessionFinal}» | ` +
          `committed=«${committed}» t=«${finalText}» i=«${interim.trim()}»`,
      );
      if (finalText || interim.trim()) resetSilenceTimer();
      cb.onTranscript?.(finalText, interim.trim());
    };

    r.onerror = (event: unknown) => {
      if (!current()) return;
      const raw = (event as { error?: string }).error ?? "unknown";
      traceLine(`onerror ${raw}`);
      if (raw === "aborted") return;
      if (raw === "no-speech") return; // keep the session alive; 10s rule decides
      if (raw === "not-allowed" || raw === "service-not-allowed") {
        permissionBlocked = true;
        fail("not-allowed");
        return;
      }
      if (raw === "audio-capture") return fail("audio-capture");
      if (raw === "network") return fail("network");
      // iOS Safari za jezik koji Apple-ov motor nema vraća baš ovaj kod —
      // tester mora da vidi razlog, ne opšte „nije dostupan".
      if (raw === "language-not-supported") return fail("language-not-supported");
      fail("unknown");
    };

    r.onend = () => {
      // A browser session ending is NOT the end of the user's input.
      // Na Androidu `continuous` jedva radi, pa ovo okida posle SVAKE rečenice —
      // ono što je na desktopu redak slučaj, na telefonu je pravilo.
      traceLine(`onend current=${current()} active=${active} finished=${finished} sessionFinal=«${sessionFinal}»`);
      if (!current() || !active || finished || permissionBlocked) return;
      // Sesija se zatvara: njen tekst prelazi u `committed`, a poslednja rečenica
      // postaje čuvar — Android je posle start() zna isporučiti još jednom.
      // Android posle start() ponovi POSLEDNJU rečenicu; ceo tekst je tu za svaki slučaj.
      replayGuards = [lastFinal, sessionFinal].filter(Boolean);
      committed = joinText(committed, sessionFinal);
      sessionFinal = "";
      finalText = committed;
      try {
        r.start();
        traceLine("restart: r.start() na istoj instanci");
      } catch {
        traceLine("restart: start() bacio → nova instanca za 250 ms");
        // Some engines need a fresh instance after ending.
        setTimeout(() => {
          if (active && !finished && r === rec) startRecognition();
        }, 250);
      }
    };

    try {
      r.start();
    } catch {
      /* already started */
    }
  }

  function fail(code: VoiceErrorCode) {
    active = false;
    clearTimers();
    stopRecognition();
    setStatus("error");
    cb.onError?.(code, VOICE_MESSAGES[code]);
  }

  function startListening() {
    if (!isVoiceSupported()) return fail("unsupported");
    if (!isSecureContextOk()) return fail("insecure");
    trace = [];
    traceT0 = Date.now();
    traceLine("startListening (pregledačev motor)");
    finalText = "";
    committed = "";
    sessionFinal = "";
    lastFinal = "";
    replayGuards = [];
    hasSpoken = false;
    finished = false;
    permissionBlocked = false;
    active = true;
    clearTimers();
    cb.onTranscript?.("", "");
    setStatus("requesting_permission");
    startRecognition();
  }

  /** Manual ZAVRŠI or the 10s silence rule. */
  function finishVoiceInput() {
    traceLine(`finish active=${active} finished=${finished} finalText=«${finalText}»`);
    if (!active || finished) return;
    finished = true;
    active = false;
    clearTimers();
    stopRecognition();
    const text = finalText.trim();
    if (!text) {
      setStatus("error");
      cb.onError?.("no-speech", VOICE_MESSAGES["no-speech"]);
      return;
    }
    setStatus("processing");
    cb.onFinish?.(text);
  }

  function cancelVoiceSession() {
    traceLine("cancel");
    active = false;
    finished = true;
    clearTimers();
    stopRecognition();
    setStatus("idle");
  }

  return {
    startListening,
    stopListening: cancelVoiceSession,
    finishVoiceInput,
    resetSilenceTimer,
    cancelVoiceSession,
    getVoiceStatus: () => ({ active, hasSpoken, finalText }),
  };
}

/** Oblik sesije koji dele pregledačev i serverski put — hook i UI vide samo ovo. */
export type VoiceSession = ReturnType<typeof createVoiceSession>;
