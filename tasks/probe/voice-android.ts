/**
 * Dupliranje na Androidu, DRUGI mehanizam — prijavljeno ponovo sa terena posle
 * prve popravke (Android 10, Chrome).
 *
 * Android Chrome isporučuje rezultate KUMULATIVNO: svaki `onresult` nosi sve
 * dosadašnje rečenice iznova, sve označene kao konačne, uz `resultIndex = 0`.
 * Kod koji dopisuje svaku konačnu rečenicu od `resultIndex` nadalje drugu
 * rečenicu vidi kao „prva + druga", treću kao „prva + druga + treća"… Desktop
 * Chrome šalje pravi `resultIndex`, pa tamo ne duplira — otuda „na desktopu
 * radi, na telefonu duplira".
 *
 * Posle `onend` i ponovnog `start()` na istoj instanci Android zna i da
 * PONOVO isporuči poslednju konačnu rečenicu kao prvu u novoj sesiji.
 *
 *   npx esbuild tasks/probe/voice-android.ts --bundle --format=esm --platform=node \
 *     --outfile=.probe/voice-android.mjs && node .probe/voice-android.mjs
 */
import { createVoiceSession } from "../../src/lib/sveska/voiceService";

type Handler = ((e: unknown) => void) | null;
type Res = { isFinal: boolean; 0: { transcript: string } };

class AndroidFake {
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onstart: Handler = null;
  onresult: Handler = null;
  onerror: Handler = null;
  onend: Handler = null;
  private results: Res[] = [];
  private replayOnStart: string | null = null;
  started = 0;

  start() {
    this.started++;
    this.results = [];
    this.onstart?.(null);
    // Android: posle restarta poslednja konačna rečenica stigne JOŠ JEDNOM.
    if (this.replayOnStart) {
      const t = this.replayOnStart;
      this.replayOnStart = null;
      this.results.push({ isFinal: true, 0: { transcript: t } });
      this.fire();
    }
  }
  abort() {}
  stop() {}

  private fire() {
    const results = { length: this.results.length } as { length: number; [i: number]: Res };
    this.results.forEach((r, i) => (results[i] = r));
    // Kumulativno i UVEK resultIndex 0 — to je Android.
    this.onresult?.({ resultIndex: 0, results });
  }

  /** Rečenica prvo stigne kao privremena, pa kao konačna — kao na pravom uređaju. */
  say(text: string) {
    this.results.push({ isFinal: false, 0: { transcript: text } });
    this.fire();
    this.results[this.results.length - 1] = { isFinal: true, 0: { transcript: text } };
    this.fire();
  }

  /** Engine prekine sesiju; naš kod zove start() na istoj instanci. */
  end(replayLast = false) {
    if (replayLast) this.replayOnStart = this.results.filter((r) => r.isFinal).pop()?.[0].transcript ?? null;
    this.onend?.(null);
  }
}

const g = globalThis as unknown as Record<string, unknown>;
g["SpeechRecognition"] = AndroidFake;
g["window"] = globalThis;
g["isSecureContext"] = true;
g["location"] = { hostname: "localhost" };

let bad = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) bad++;
  console.log(`${cond ? "OK  " : "LOSE"}  ${label}${cond ? "" : `   ${detail}`}`);
}

let delivered: string | null = null;
let live = "";
const made: AndroidFake[] = [];
const Ctor = AndroidFake;
g["SpeechRecognition"] = class extends Ctor {
  constructor() {
    super();
    made.push(this);
  }
};

const session = createVoiceSession({
  onTranscript: (t, i) => {
    live = `${t} ${i}`.trim();
  },
  onFinish: (t) => {
    delivered = t;
  },
});

session.startListening();
const r = made[0]!;

console.log("=== A: kumulativni rezultati u jednoj sesiji ===");
r.say("pošalji Marka");
check("posle prve rečenice", live === "pošalji Marka", JSON.stringify(live));
r.say("kod Ane Marković");
check("posle druge: bez ponavljanja prve", live === "pošalji Marka kod Ane Marković", JSON.stringify(live));
r.say("sutra u deset");
check(
  "posle treće: i dalje svaka jednom",
  live === "pošalji Marka kod Ane Marković sutra u deset",
  JSON.stringify(live),
);

console.log("\n=== B: engine prekine i ponovo isporuči poslednju ===");
r.end(true);
await new Promise((res) => setTimeout(res, 50));
check("ista instanca ponovo pokrenuta", r.started >= 2, `start() pozvan ${r.started}x`);
check(
  "ponovljena poslednja rečenica NIJE dodata",
  live === "pošalji Marka kod Ane Marković sutra u deset",
  JSON.stringify(live),
);
r.say("cena sto evra");
check(
  "nova rečenica posle prekida se dodaje jednom",
  live === "pošalji Marka kod Ane Marković sutra u deset cena sto evra",
  JSON.stringify(live),
);

session.finishVoiceInput();
console.log("\n=== C: isporuka ===");
check(
  "isporučeno bez ijednog ponavljanja",
  delivered === "pošalji Marka kod Ane Marković sutra u deset cena sto evra",
  JSON.stringify(delivered),
);

console.log("");
console.log(`isporučeno: ${JSON.stringify(delivered)}`);
console.log(bad === 0 ? "SVE PROLAZI" : `${bad} pogresno`);
if (bad > 0) process.exitCode = 1;
