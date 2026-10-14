import { useCallback, useEffect, useRef, useState } from "react";
import {
  createVoiceSession,
  isVoiceSupported,
  isSecureContextOk,
  type VoiceErrorCode,
  type VoiceStatus,
} from "@/lib/sveska/voiceService";

export function useSpeechRecognition(onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [secure, setSecure] = useState(true);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<VoiceErrorCode | null>(null);

  const cbRef = useRef(onFinal);
  cbRef.current = onFinal;
  const sessionRef = useRef<ReturnType<typeof createVoiceSession> | null>(null);

  useEffect(() => {
    setSupported(isVoiceSupported());
    setSecure(isSecureContextOk());
  }, []);

  const ensureSession = useCallback(() => {
    if (sessionRef.current) return sessionRef.current;
    sessionRef.current = createVoiceSession({
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
