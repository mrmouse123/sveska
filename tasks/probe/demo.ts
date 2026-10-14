import { interpretLocal } from "../../src/lib/sveska/interpreter";
import { createInitialState } from "../../src/lib/sveska/data";
const s = createInitialState();
const EX: Record<string,string[]> = {
  solo: ["Sutra u deset idem kod Marka Petrovića da popravim bojler, cena 120 evra.","Koji su poslovi danas?","Ko mi duguje novac?","Koliko sam zaradio ovog meseca?"],
  tim: ["Pošalji Marka sutra u deset kod Petrovića da popravi slavinu.","Ko je slobodan sutra?","Koji poslovi nisu završeni?"],
  zadruga: ["Sutra u osam pošalji vodoinstalaterski tim kod Petrovića, a električara kod Jovanovića.","Za renoviranje kuće Petrović napravi tim od Petra vodoinstalatera, Milana električara i Jovana molera.","Koji tim ima najmanje posla?"],
};
for (const [mode, list] of Object.entries(EX)) {
  for (const text of list) {
    const r = interpretLocal(text, mode as never, s);
    const d = r.suggestedAction === "ANSWER"
      ? `answer="${(r.answer||"").split("\n")[0].slice(0,55)}"`
      : JSON.stringify({worker:r.worker,team:r.team,customer:r.customer,time:r.time,price:r.price,assign:r.assignments?.length,members:r.members?.map(m=>m.name)});
    console.log(`[${mode}] ${r.suggestedAction.padEnd(19)} ${d}\n         "${text.slice(0,70)}"`);
  }
}
