import { useCallback, useEffect, useState } from "react";
import { Mic, Square, Check, Pencil, Loader2, X, User, Clock, Wrench, Euro } from "lucide-react";
import { VOICE_OPEN_EVENT } from "./VoiceCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { getVoiceTrace } from "@/lib/sveska/voiceService";
import { useDemo } from "@/lib/sveska/store";
import { processVoiceCommand } from "@/lib/sveska/aiService";
import { executeAiResult } from "@/lib/sveska/actions";
import type { AiResult, Mode } from "@/lib/sveska/types";
import { formatDateSr } from "@/lib/sveska/data";
import { toast } from "sonner";

const EXAMPLES: Record<Mode, string[]> = {
  solo: [
    "Sutra u deset idem kod Marka Petrovića da popravim bojler, cena 120 evra.",
    "Koji su poslovi danas?",
    "Ko mi duguje novac?",
    "Koliko sam zaradio ovog meseca?",
  ],
  tim: [
    "Pošalji Marka sutra u deset kod Petrovića da popravi slavinu.",
    "Ko je slobodan sutra?",
    "Koji poslovi nisu završeni?",
  ],
  zadruga: [
    "Sutra u osam pošalji vodoinstalaterski tim kod Petrovića, a električara kod Jovanovića.",
    "Za renoviranje kuće Petrović napravi tim od Petra vodoinstalatera, Milana električara i Jovana molera.",
    "Koji tim ima najmanje posla?",
  ],
};

type Phase = "idle" | "listening" | "thinking" | "result";

/**
 * Majstoru „pouzdanost 60%" ne znači ništa; „nisam sigurna, proveri" znači.
 * Pragovi prate skalu koju model dobija u uputstvu (ai-process): 0.95+ sigurno,
 * 0.8 nov klijent ili jedna pretpostavka, ispod toga nešto bitno nedostaje.
 */
function confidenceLabel(c: number): string {
  // Skala u uputstvu: 0.95+ sve poznato, 0.8–0.89 nov klijent. 0.9 ne sme da
  // pročita kao „sigurna" — granica je iznad opsega za nov klijent.
  if (c >= 0.92) return "sigurna sam";
  if (c >= 0.75) return "prilično sigurna, pogledaj polja";
  return "nisam sigurna, proveri pre čuvanja";
}

/**
 * Kopira trag prepoznavača u klipbord — za slučajeve koje ne umemo da
 * reprodukujemo bez uređaja (dupliranje na Androidu). Ništa se ne šalje nigde.
 */
function DiagnosticsButton() {
  return (
    <button
      type="button"
      className="mt-3 text-[11px] text-muted-foreground underline underline-offset-2"
      onClick={() => {
        const text = getVoiceTrace();
        void navigator.clipboard?.writeText(text).then(
          () => toast.success("Dijagnostika je kopirana — nalepi je u poruku."),
          () => toast.error("Nisam uspela da kopiram. Probaj ponovo."),
        );
      }}
    >
      DIJAGNOSTIKA (kopiraj trag glasa)
    </button>
  );
}

export function VoiceOverlay({ mode }: { mode: Mode }) {
  const demo = useDemo();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<AiResult | null>(null);
  const [finalText, setFinalText] = useState("");
  const [manual, setManual] = useState("");
  const [editing, setEditing] = useState(false);

  const run = useCallback(
    async (text: string) => {
      setFinalText(text);
      setPhase("thinking");
      const res = await processVoiceCommand(text, mode, demo.state);
      setResult(res);
      setPhase("result");
    },
    [demo.state, mode],
  );

  const speech = useSpeechRecognition((text) => {
    void run(text);
  });

  // A failed session (denied mic, network, or 10s of silence with nothing said)
  // never calls onFinish, so the panel would sit on "SVESKA SLUŠA…" forever.
  // Fall back to the idle screen, which shows the error and POKUŠAJ PONOVO.
  useEffect(() => {
    if (speech.status === "error") setPhase("idle");
  }, [speech.status]);

  const openPanel = useCallback(() => {
    setOpen(true);
    setResult(null);
    setFinalText("");
    setEditing(false);
    setPhase("idle");
  }, []);

  useEffect(() => {
    const h = () => openPanel();
    window.addEventListener(VOICE_OPEN_EVENT, h);
    return () => window.removeEventListener(VOICE_OPEN_EVENT, h);
  }, [openPanel]);

  const startVoice = () => {
    setPhase("listening");
    speech.start();
  };

  const closePanel = () => {
    speech.cancel();
    setOpen(false);
    setPhase("idle");
  };

  const confirm = () => {
    if (!result) return;
    const msg = executeAiResult(result, mode, demo.state, demo);
    toast.success(msg || "Gotovo.");
    closePanel();
  };

  const live = (speech.transcript + " " + speech.interim).trim();

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        aria-label="Reci SVESCI"
        className="voice-ring fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-5 z-40 flex items-center gap-2 rounded-full bg-primary px-5 py-4 text-sm font-bold text-primary-foreground shadow-voice transition-transform hover:scale-105 md:bottom-8 md:right-8 md:px-6"
      >
        <Mic className="size-5" />
        <span className="hidden sm:inline">RECI SVESCI</span>
      </button>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : closePanel())}>
        <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
          <DialogTitle className="sr-only">SVESKA glasovni unos</DialogTitle>

          {phase === "listening" ? (
            <div className="py-4 text-center">
              <p className="flex items-center justify-center gap-2 font-display text-base font-bold">
                <span className="inline-block size-2.5 animate-pulse rounded-full bg-destructive" />
                {speech.status === "requesting_permission"
                  ? "ČEKAMO DOZVOLU ZA MIKROFON…"
                  : speech.status === "processing"
                    ? "PREVODIM SNIMAK…"
                    : "SVESKA SLUŠA..."}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {speech.status === "processing"
                  ? "Snimak je poslat, tekst stiže za par sekundi."
                  : speech.serverMode
                    ? "Pričaj, pa pritisni ZAVRŠI."
                    : "Pričaj prirodno, ne prekidam te."}
              </p>
              <div className="my-6 flex h-14 items-center justify-center gap-1.5">
                {Array.from({ length: 20 }).map((_, i) => (
                  <span
                    key={i}
                    className="wave-bar w-1 rounded-full bg-accent"
                    style={{ height: `${14 + ((i * 37) % 40)}px`, animationDelay: `${i * 60}ms` }}
                  />
                ))}
              </div>
              <p className="min-h-16 rounded-xl bg-secondary p-4 text-left text-sm">
                {live ||
                  (speech.serverMode
                    ? "Snimam… tekst stiže kad pritisneš ZAVRŠI."
                    : "Pričaj slobodno na srpskom…")}
              </p>
              <div className="mt-4 rounded-xl bg-accent-soft px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  Slušam… Nastavi slobodno da pričaš.
                </p>
                <p className="mt-1 font-display text-lg font-bold">
                  {speech.serverMode
                    ? "Snimam"
                    : speech.countdown === null
                      ? "Čekam na kraj govora"
                      : `${speech.countdown}s`}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {speech.serverMode
                    ? live
                      ? "Tekst uživo je pregled; tačan stiže posle ZAVRŠI (najviše 60 s)."
                      : "Snimanje traje najviše 60 s; prepoznavanje ide preko servera."
                    : "Automatski završavam nakon 10 sekundi tišine."}
                </p>
              </div>
              {speech.error ? (
                <p className="mt-3 text-sm text-muted-foreground">{speech.error}</p>
              ) : null}
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {/* Na serverskom putu mikrofon je već pušten dok snimak putuje —
                    ZAVRŠI tada ne radi ništa, pa se ne nudi; OTKAŽI prekida slanje. */}
                {speech.status !== "processing" ? (
                  <Button className="font-semibold" onClick={() => speech.finish()}>
                    <Square className="size-4" /> ZAVRŠI
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  className="font-semibold"
                  onClick={() => {
                    speech.cancel();
                    setPhase("idle");
                  }}
                >
                  <X className="size-4" /> OTKAŽI
                </Button>
              </div>
            </div>
          ) : null}

          {phase === "idle" ? (
            <div className="py-2">
              <div className="text-center">
                <button
                  type="button"
                  onClick={speech.supported && speech.secure ? startVoice : undefined}
                  disabled={!speech.supported || !speech.secure}
                  aria-label="Počni glasovni unos"
                  className="mx-auto flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-voice transition-transform hover:scale-105 disabled:opacity-50"
                >
                  <Mic className="size-8" />
                </button>
                <p className="mt-4 font-display text-base font-bold">RECI SVESCI</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {speech.supported && speech.secure
                    ? "Pričaj prirodno. SVESKA te ne prekida kada zastaneš."
                    : "Ovaj browser trenutno ne podržava glasovni unos — otkucaj komandu ispod."}
                </p>
              </div>
              {speech.error ? (
                <div className="mt-4 rounded-xl border border-border bg-secondary p-4 text-center text-sm">
                  <p>{speech.error}</p>
                  {speech.supported && speech.secure ? (
                    <Button onClick={startVoice} className="mt-3 font-semibold" size="sm">
                      POKUŠAJ PONOVO
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <DiagnosticsButton />
              <p className="mt-6 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Probaj demo komandu
              </p>
              <div className="mt-2 space-y-2">
                {EXAMPLES[mode].map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => void run(ex)}
                    className="w-full rounded-xl border border-border bg-card p-3 text-left text-sm transition-colors hover:bg-secondary"
                  >
                    „{ex}“
                  </button>
                ))}
              </div>
              <form
                className="mt-4 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (manual.trim()) void run(manual.trim());
                }}
              >
                <Input
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  placeholder="…ili otkucaj komandu"
                />
                <Button type="submit">Pošalji</Button>
              </form>
            </div>
          ) : null}

          {phase === "thinking" ? (
            <div className="py-10 text-center">
              <Loader2 className="mx-auto size-8 animate-spin text-accent-foreground" />
              <p className="mt-4 font-display text-base font-bold">SVESKA RAZUMEVA...</p>
              <p className="mt-3 rounded-xl bg-secondary p-3 text-sm">„{finalText}“</p>
            </div>
          ) : null}

          {phase === "result" && result ? (
            <ResultView
              result={result}
              finalText={finalText}
              editing={editing}
              setEditing={setEditing}
              onChange={setResult}
              onConfirm={confirm}
              onRetry={() => {
                setResult(null);
                if (speech.supported && speech.secure) startVoice();
                else setPhase("idle");
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ResultView({
  result,
  finalText,
  editing,
  setEditing,
  onChange,
  onConfirm,
  onRetry,
}: {
  result: AiResult;
  finalText: string;
  editing: boolean;
  setEditing: (v: boolean) => void;
  onChange: (r: AiResult) => void;
  onConfirm: () => void;
  onRetry: () => void;
}) {
  const a = result.suggestedAction;
  // Lokalni tekst polja za cenu, sinhronizovan kad rezultat stigne spolja.
  const [priceText, setPriceText] = useState(result.price === undefined ? "" : String(result.price));
  useEffect(() => {
    setPriceText(result.price === undefined ? "" : String(result.price));
  }, [result.price]);
  return (
    <div className="py-2">
      {a !== "ANSWER" && a !== "UNKNOWN" && a !== "CREATE_ASSIGNMENTS" ? (
        <p className="text-center font-display text-xl font-bold">RAZUMELA SAM</p>
      ) : null}
      <p className="mt-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        Čula sam
      </p>
      <p className="mt-1 rounded-xl bg-secondary p-3 text-sm italic">„{finalText}“</p>

      {a === "ANSWER" || a === "UNKNOWN" ? (
        <p className="mt-4 whitespace-pre-line rounded-xl border border-border bg-card p-4 text-sm">
          {result.answer}
        </p>
      ) : null}

      {a === "CREATE_JOB" || a === "ASSIGN_JOB" ? (
        <div className="mt-4 space-y-3">
          {editing ? (
            <div className="grid gap-2">
              <Input
                value={result.customer ?? ""}
                onChange={(e) => onChange({ ...result, customer: e.target.value })}
                placeholder="Klijent"
              />
              <Input
                value={result.description ?? ""}
                onChange={(e) => onChange({ ...result, description: e.target.value })}
                placeholder="Opis"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={result.time ?? ""}
                  onChange={(e) => onChange({ ...result, time: e.target.value })}
                  placeholder="Vreme"
                />
                <Input
                  inputMode="decimal"
                  value={priceText}
                  onChange={(e) => {
                    // Tekst ostaje kakav je ukucan; broj se izvlači sa strane. Kontrolisan
                    // krug kroz Number() je na „120." vraćao 120 i jeo tačku — 120,50 se
                    // nije moglo uneti.
                    const raw = e.target.value;
                    setPriceText(raw);
                    const n = Number(raw.replace(",", "."));
                    if (raw.trim() === "") onChange({ ...result, price: undefined });
                    else if (Number.isFinite(n)) onChange({ ...result, price: n });
                  }}
                  placeholder="Cena"
                />
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border bg-card">
              {result.worker || result.team ? (
                <DetailRow
                  icon={User}
                  label={result.worker ? "Radnik" : "Tim"}
                  value={result.worker ?? result.team ?? ""}
                />
              ) : null}
              <DetailRow icon={User} label="Kupac" value={result.customer ?? "—"} />
              <DetailRow
                icon={Clock}
                label="Termin"
                value={`${formatDateSr(result.date ?? "")} · ${result.time ?? "—"}`}
              />
              <DetailRow icon={Wrench} label="Opis posla" value={result.description ?? "—"} />
              {result.price ? (
                <DetailRow icon={Euro} label="Cena" value={`€${result.price}`} />
              ) : null}
            </div>
          )}
          <p className="font-display font-semibold">
            {a === "ASSIGN_JOB"
              ? `${result.worker ?? result.team ?? "Izvršilac"} je slobodan u ${result.time}. Da li da dodelim posao?`
              : "Da li da zakažem ovaj posao?"}
          </p>
        </div>
      ) : null}

      {a === "CREATE_ASSIGNMENTS" ? (
        <div className="mt-4">
          <p className="font-display text-lg font-bold">
            RAZUMELA SAM {result.assignments?.length ?? 0} ZADATKA
          </p>
          <div className="mt-3 space-y-2">
            {(result.assignments ?? []).map((as, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                <span className="font-display text-lg font-semibold">{as.time}</span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {as.team ?? as.worker} → {as.customer}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{as.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {a === "CREATE_MIXED_TEAM" ? (
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Novi mixed team
          </p>
          <div className="mt-2 rounded-xl border border-border bg-card p-4">
            <p className="font-display text-lg font-bold">{result.project}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {(result.members ?? []).map((m) => (
                <li key={m.name}>
                  • {m.name} — {m.trade}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {/* Komande nad POSTOJEĆIM poslom i timom. Bez ovog bloka korisnik vidi
          samo dugme — a kod otkazivanja ne zna ni koji posao otkazuje. */}
      {a === "CANCEL_JOB" || a === "UPDATE_JOB" ? (
        <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
          <DetailRow icon={Wrench} label="Posao" value={result.description ?? "—"} />
          <DetailRow icon={User} label="Klijent" value={result.customer ?? "—"} />
          {a === "CANCEL_JOB" ? (
            <DetailRow
              icon={Clock}
              label="Zakazan"
              value={`${result.date ? formatDateSr(result.date) : "—"}${result.time ? ` u ${result.time}` : ""}`}
            />
          ) : (
            <>
              {result.date ? (
                <DetailRow icon={Clock} label="Novi datum" value={formatDateSr(result.date)} />
              ) : null}
              {result.time ? <DetailRow icon={Clock} label="Novo vreme" value={result.time} /> : null}
              {result.price !== undefined ? (
                <DetailRow icon={Euro} label="Nova cena" value={`€${result.price}`} />
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {a === "ADD_TEAM_MEMBER" ? (
        <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
          <DetailRow icon={User} label="Radnik" value={result.worker ?? "—"} />
          <DetailRow icon={Wrench} label="Tim" value={result.team ?? "—"} />
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {a !== "ANSWER" && a !== "UNKNOWN" ? (
          <>
            <Button
              onClick={onConfirm}
              variant={a === "CANCEL_JOB" ? "destructive" : "default"}
              className="font-semibold"
            >
              <Check className="size-4" />
              {a === "CREATE_ASSIGNMENTS"
                ? `POTVRDI ${result.assignments?.length ?? 0} ZADATKA`
                : a === "CREATE_MIXED_TEAM"
                  ? "KREIRAJ MIXED TEAM"
                  : a === "ASSIGN_JOB"
                    ? `DODELI ${(result.worker ?? result.team ?? "").toUpperCase()}`
                    : a === "CANCEL_JOB"
                      ? "OTKAŽI POSAO"
                      : a === "UPDATE_JOB"
                        ? "SAČUVAJ IZMENU"
                        : a === "ADD_TEAM_MEMBER"
                          ? "DODAJ U TIM"
                          : "SAČUVAJ"}
            </Button>
            {/* Kod komandi nad postojećim redom nema šta da se menja u kartici. */}
            {a !== "CANCEL_JOB" && a !== "UPDATE_JOB" && a !== "ADD_TEAM_MEMBER" ? (
              <Button
                variant="outline"
                onClick={() => setEditing(!editing)}
                className="font-semibold"
              >
                <Pencil className="size-4" /> IZMENI
              </Button>
            ) : null}
          </>
        ) : null}
        <Button variant="ghost" onClick={onRetry} className="font-semibold">
          <Mic className="size-4" /> PONOVO
        </Button>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        {result.source === "ai" ? "Obrađeno realnim AI modelom" : "SVESKA trenutno koristi demo režim"}
        {" · "}
        {confidenceLabel(result.confidence ?? 0.9)}
      </p>
      <DiagnosticsButton />
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof User;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}
