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

type SR = {
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

function getCtor(): (new () => SR) | null {
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

  /** Called on every meaningful speech activity. Only one timer ever exists. */
  function resetSilenceTimer() {
    clearTimers();
    hasSpoken = true;
    deadline = Date.now() + SILENCE_MS;
    silenceTimer = setTimeout(() => finishVoiceInput(), SILENCE_MS);
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
      if (current() && active) setStatus("listening");
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
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i]!;
        const chunk = res[0].transcript.trim();
        if (!chunk) continue;
        if (res.isFinal) finals.push(chunk);
        else interim += ` ${chunk}`;
      }
      sessionFinal = dropReplay(finals.join(" "));
      if (finals.length) lastFinal = finals[finals.length - 1]!;
      finalText = joinText(committed, sessionFinal);
      if (finalText || interim.trim()) resetSilenceTimer();
      cb.onTranscript?.(finalText, interim.trim());
    };

    r.onerror = (event: unknown) => {
      if (!current()) return;
      const raw = (event as { error?: string }).error ?? "unknown";
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
      } catch {
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
