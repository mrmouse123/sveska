import { useCallback, useEffect, useRef, useState } from "react";
import {
  createVoiceSession,
  hasBrowserRecognition,
  isSecureContextOk,
  type VoiceErrorCode,
  type VoiceSession,
  type VoiceStatus,
} from "@/lib/sveska/voiceService";
import { canRecord, createRecorderSession, shouldUseServerStt } from "@/lib/sveska/recorderService";

export function useSpeechRecognition(onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [secure, setSecure] = useState(true);
  /** iOS i pregledači bez motora snimaju i šalju na server; Chrome ostaje lokalan. */
  const [serverMode, setServerMode] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<VoiceErrorCode | null>(null);

  const cbRef = useRef(onFinal);
  cbRef.current = onFinal;
  const sessionRef = useRef<VoiceSession | null>(null);

  useEffect(() => {
    // Mikrofon se nudi ako postoji IJEDAN put: pregledačev motor ili snimanje.
    setSupported(hasBrowserRecognition() || canRecord());
    setServerMode(shouldUseServerStt());
    setSecure(isSecureContextOk());
  }, []);

  const ensureSession = useCallback(() => {
    if (sessionRef.current) return sessionRef.current;
    const make = shouldUseServerStt() ? createRecorderSession : createVoiceSession;
    sessionRef.current = make({
      onStatus: setStatus,
      onTranscript: (t, i) => {
        setTranscript(t);
        setInterim(i);
      },
      onCountdown: setCountdown,
      onError: (code, message) => {
        setErrorCode(code);
        setError(message);
      },
      onFinish: (text) => cbRef.current(text),
    });
    return sessionRef.current;
  }, []);

  // Cleanup on unmount / navigation.
  useEffect(
    () => () => {
      sessionRef.current?.cancelVoiceSession();
      sessionRef.current = null;
    },
    [],
  );

  const start = useCallback(() => {
    setError(null);
    setErrorCode(null);
    setTranscript("");
    setInterim("");
    setCountdown(null);
    ensureSession().startListening();
  }, [ensureSession]);

  const finish = useCallback(() => sessionRef.current?.finishVoiceInput(), []);
  const cancel = useCallback(() => {
    sessionRef.current?.cancelVoiceSession();
    setCountdown(null);
  }, []);

  return {
    supported,
    secure,
    serverMode,
    status,
    listening: status === "listening" || status === "requesting_permission",
    transcript,
    interim,
    countdown,
    error,
    errorCode,
    start,
    finish,
    cancel,
    /** Backwards-compatible alias: cancels without processing. */
    stop: cancel,
    setTranscript,
  };
}
