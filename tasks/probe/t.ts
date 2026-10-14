import { parseTime, parseDate, interpretLocal } from "../../src/lib/sveska/interpreter";
import { createInitialState } from "../../src/lib/sveska/data";

const s = createInitialState();
const cases = ["u sedamnaest", "u osamnaest", "u sedam", "u osam", "u petnaest", "sutra u 17:30", "u 9"];
for (const c of cases) console.log(`parseTime(${JSON.stringify(c)}) =`, parseTime(c));

console.log("\n-- interpretLocal --");
const r1 = interpretLocal("Sutra u sedamnaest idem kod Marka Petrovića da popravim bojler, cena 120 evra.", "solo", s);
console.log("solo/bojler:", JSON.stringify({a:r1.suggestedAction,c:r1.customer,d:r1.date,t:r1.time,p:r1.price}));
const r2 = interpretLocal("Daj Marku popravku slavine kod Nikole Jovanovića sutra u deset.", "tim", s);
console.log("tim/assign:", JSON.stringify({a:r2.suggestedAction,w:r2.worker,c:r2.customer,t:r2.time}));
const r3 = interpretLocal("Koliko sam zaradio ovog meseca?", "solo", s);
console.log("pitanje:", r3.suggestedAction, "|", (r3.answer||"").slice(0,60));
