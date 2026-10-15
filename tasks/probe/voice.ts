/**
 * Dupliranje govora na telefonu — prijavljeno sa dva uređaja.
 *
 * Na Androidu `continuous` jedva radi, pa `onend` okida posle svake izgovorene
 * rečenice. Tada `r.start()` često baci, i stara grana je pravila NOV
 * prepoznavač ne gaseći stari — oba su ostajala živa i oba dopisivala u isti
 * `finalText`. Na desktopu se taj put retko pogodi, na telefonu je pravilo.
 *
 * Proba pravi lažni SpeechRecognition koji se ponaša kao mobilni: `start()`
 * baci pri ponovnom pozivu na istoj instanci, pa se mora napraviti nova.
 *
 *   npx esbuild tasks/probe/voice.ts --bundle --format=esm --platform=node \
 *     --outfile=.probe/voice.mjs && node .probe/voice.mjs
 */
import { createVoiceSession } from "../../src/lib/sveska/voiceService";

type Handler = ((e: unknown) => void) | null;

/** Svaka napravljena instanca; proba gleda koliko ih ostane živo. */
const made: Fake[] = [];

class Fake {
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onstart: Handler = null;
  onresult: Handler = null;
  onerror: Handler = null;
  onend: Handler = null;
  started = false;
  aborted = false;
  private everStarted = false;

  constructor() {
    made.push(this);
  }

  start() {
    // Mobilni engine: ista instanca se ne može pokrenuti dva puta.
    if (this.everStarted) throw new Error("InvalidStateError");
    this.everStarted = true;
    this.started = true;
    this.onstart?.(null);
  }

  abort() {
    this.aborted = true;
    this.started = false;
  }

  stop() {
    this.started = false;
  }

  /** Simulira izgovorenu rečenicu koju engine proglasi konačnom. */
  say(text: string) {
    this.onresult?.({
      resultIndex: 0,
      results: { length: 1, 0: { isFinal: true, 0: { transcript: text } } },
    });
  }

  /** Engine sam prekida sesiju — na Androidu posle svake rečenice. */
  end() {
    this.onend?.(null);
  }
}

(globalThis as unknown as { SpeechRecognition: unknown }).SpeechRecognition = Fake;
(globalThis as unknown as { window: unknown }).window = globalThis;
(globalThis as unknown as { isSecureContext: boolean }).isSecureContext = true;
(globalThis as unknown as { location: { hostname: string } }).location = { hostname: "localhost" };

let bad = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) bad++;
  console.log(`${cond ? "OK  " : "LOSE"}  ${label}${cond ? "" : `   ${detail}`}`);
}

let delivered: string | null = null;
let lastTranscript = "";

const session = createVoiceSession({
  onTranscript: (text) => {
    lastTranscript = text;
  },
  onFinish: (text) => {
    delivered = text;
  },
});

session.startListening();

// Telefon: rečenica, engine prekine, pa opet — tri puta zaredom.
made[0]!.say("pošalji Marka");
made[0]!.end();
await new Promise((r) => setTimeout(r, 400));

const second = made[made.length - 1]!;
check("posle prekida postoji nova instanca", made.length >= 2, `instanci: ${made.length}`);
check(
  "stara instanca je ugašena",
  made[0]!.aborted || made[0]!.onresult === null,
  "stara i dalje sluša",
);

// Ključni test: stara instanca pokuša da dopiše posle zamene.
made[0]!.say("pošalji Marka");
check(
  "orphan NE sme da dopiše",
  !lastTranscript.includes("pošalji Marka pošalji Marka"),
  `transkript: ${JSON.stringify(lastTranscript)}`,
);

second.say("kod Ane Marković");
check(
  "nova instanca normalno dopisuje",
  lastTranscript.includes("kod Ane Marković"),
  `transkript: ${JSON.stringify(lastTranscript)}`,
);

session.finishVoiceInput();
check(
  "isporučeni tekst nije dupliran",
  delivered !== null && !/(pošalji Marka).*\1/.test(delivered),
  `isporučeno: ${JSON.stringify(delivered)}`,
);

console.log("");
console.log(`isporučeno: ${JSON.stringify(delivered)}`);
console.log(bad === 0 ? "SVE PROLAZI" : `${bad} pogresno`);
if (bad > 0) process.exitCode = 1;
