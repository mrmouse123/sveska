/**
 * Pregledačev motor, korisnik otvori mikrofon i ne kaže NIŠTA. Pravilo od 10 s
 * tišine mora da završi sesiju i bez ijednog rezultata — inače restart-petlja
 * drži mikrofon upaljen dok god korisnik ne pritisne dugme, a panel tvrdi
 * suprotno. Tajmer se u probi skraćuje preko SILENCE_MS? Ne — proba koristi
 * lažne tajmere: ručno pomera sat.
 *
 *   npm run probe voice-silence
 */
import { createVoiceSession, SILENCE_MS } from "../../src/lib/sveska/voiceService";

type Handler = ((e: unknown) => void) | null;
class SilentFake {
  lang = ""; continuous = false; interimResults = false; maxAlternatives = 1;
  onstart: Handler = null; onresult: Handler = null; onerror: Handler = null; onend: Handler = null;
  started = 0;
  start() { this.started++; queueMicrotask(() => this.onstart?.(null)); }
  abort() {}
  stop() {}
}
const made: SilentFake[] = [];
const g = globalThis as unknown as Record<string, unknown>;
g["SpeechRecognition"] = class extends SilentFake { constructor() { super(); made.push(this); } };
g["window"] = globalThis;
g["isSecureContext"] = true;
g["location"] = { hostname: "localhost" };

let bad = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) bad++;
  console.log(`${cond ? "OK  " : "LOSE"}  ${label}${cond ? "" : `   ${detail}`}`);
}

// Lažni sat: setTimeout/setInterval se izvršavaju kad proba pomeri vreme.
type T = { at: number; fn: () => void; every?: number };
let now = 0;
let timers: T[] = [];
const realSetTimeout = globalThis.setTimeout;
g["setTimeout"] = ((fn: () => void, ms: number) => {
  const t: T = { at: now + ms, fn };
  timers.push(t);
  return t;
}) as unknown as typeof setTimeout;
g["clearTimeout"] = ((t: T) => void (timers = timers.filter((x) => x !== t))) as unknown as typeof clearTimeout;
g["setInterval"] = ((fn: () => void, ms: number) => {
  const t: T = { at: now + ms, fn, every: ms };
  timers.push(t);
  return t;
}) as unknown as typeof setInterval;
g["clearInterval"] = ((t: T) => void (timers = timers.filter((x) => x !== t))) as unknown as typeof clearInterval;
function advance(ms: number) {
  const end = now + ms;
  for (;;) {
    const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    now = due.at;
    if (due.every) due.at += due.every;
    else timers = timers.filter((t) => t !== due);
    due.fn();
  }
  now = end;
}
const flush = () => new Promise((r) => realSetTimeout(r, 0));

let errorCode: string | null = null;
let finished: string | null = null;
const statuses: string[] = [];
const s = createVoiceSession({
  onStatus: (st) => void statuses.push(st),
  onError: (c) => void (errorCode = c),
  onFinish: (t) => void (finished = t),
});

s.startListening();
await flush();
check("motor pokrenut", made[0]?.started === 1);
check("status listening", statuses.at(-1) === "listening", String(statuses.at(-1)));

advance(SILENCE_MS - 1000);
await flush();
check("pre isteka još sluša", errorCode === null && finished === null);

advance(2000);
await flush();
console.log("");
check("posle 10 s tišine sesija se završava", errorCode !== null || finished !== null);
check("sa porukom no-speech (ništa nije rečeno)", errorCode === "no-speech", String(errorCode));
check("motor nije ponovo pokretan u nedogled", (made[0]?.started ?? 0) <= 2, `start() ${made[0]?.started}x`);

console.log("");
console.log(bad === 0 ? "SVE PROLAZI" : `${bad} pogresno`);
if (bad > 0) process.exitCode = 1;
