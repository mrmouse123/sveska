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

export function isVoiceSupported(): boolean {
  return Boolean(getCtor());
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

export function createVoiceSession(cb: VoiceCallbacks) {
  let rec: SR | null = null;
  let finalText = "";
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let deadline = 0;
  let hasSpoken = false;
  let active = false; // session (not browser recognition) is running
  let finished = false;
  let permissionBlocked = false;

  const setStatus = (s: VoiceStatus) => cb.onStatus?.(s);

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
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        const chunk = res[0].transcript;
        if (res.isFinal) finalText = (finalText + " " + chunk).trim();
        else interim += chunk;
      }
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
      fail("unknown");
    };

    r.onend = () => {
      // A browser session ending is NOT the end of the user's input.
      // Na Androidu `continuous` jedva radi, pa ovo okida posle SVAKE rečenice —
      // ono što je na desktopu redak slučaj, na telefonu je pravilo.
      if (!current() || !active || finished || permissionBlocked) return;
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
