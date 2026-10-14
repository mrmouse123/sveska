import type { DemoState } from "./types";

export const DEMO_USER = { name: "Petar Petrović", firstName: "Petar" };

/** yyyy-mm-dd in the user's LOCAL timezone. `toISOString()` would give the UTC day,
 *  which is "yesterday" between 00:00 and 02:00 in Belgrade. */
export const iso = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
export const today = () => iso(new Date());
export const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return iso(d);
};
export const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

export const formatDateSr = (date: string) => {
  if (date === today()) return "Danas";
  if (date === tomorrow()) return "Sutra";
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y}.`;
};

export function createInitialState(): DemoState {
  return {
    workers: [
      { id: "w-petar", name: "Petar", role: "Vlasnik", trade: "vodoinstalater" },
      { id: "w-marko", name: "Marko", role: "Radnik", trade: "vodoinstalater", teamId: "t-vodo" },
      { id: "w-nikola", name: "Nikola", role: "Radnik", trade: "vodoinstalater", teamId: "t-vodo" },
      { id: "w-milan", name: "Milan", role: "Radnik", trade: "električar", teamId: "t-elek" },
      { id: "w-jovan", name: "Jovan", role: "Radnik", trade: "moler", teamId: "t-elek" },
      { id: "w-stefan", name: "Stefan", role: "Radnik", trade: "vodoinstalater", teamId: "t-vodo" },
    ],
    teams: [
      { id: "t-vodo", name: "VODOINSTALATERI", memberIds: ["w-marko", "w-nikola", "w-stefan"] },
      { id: "t-elek", name: "ELEKTRIČARI", memberIds: ["w-milan", "w-jovan"] },
    ],
    mixedTeams: [
      {
        id: "mt-renovacija",
        name: "RENOVACIJA PETROVIĆ",
        project: "Renovacija kuće Petrović",
        members: [
          { workerId: "w-petar", responsibility: "Vodovodne instalacije" },
          { workerId: "w-milan", responsibility: "Električne instalacije" },
          { workerId: "w-jovan", responsibility: "Krečenje" },
        ],
        createdAt: today(),
      },
    ],
    customers: [
      { id: "c-marko", name: "Marko Petrović", phone: "+381 63 123 456", email: "marko.petrovic@mail.rs", address: "Kneza Miloša 24, Beograd", notes: "Ima stari bojler, traži servis dva puta godišnje." },
      { id: "c-nikola", name: "Nikola Jovanović", phone: "+381 64 987 654", email: "n.jovanovic@mail.rs", address: "Bulevar Oslobođenja 12, Novi Sad", notes: "Plaća uvek na licu mesta." },
      { id: "c-milan", name: "Milan Ilić", phone: "+381 65 222 333", email: "milan.ilic@mail.rs", address: "Vojvode Stepe 88, Beograd", notes: "Stan na 4. spratu, bez lifta." },
      { id: "c-firma", name: "Jovanović Company", phone: "+381 11 445 566", email: "office@jovanovic.rs", address: "Zmaj Jovina 5, Beograd", notes: "Firma — plaćanje po fakturi, rok 15 dana." },
      { id: "c-ana", name: "Ana Marković", phone: "+381 66 778 899", email: "ana.markovic@mail.rs", address: "Gospodar Jevremova 3, Beograd", notes: "Preporuka od Marka Petrovića." },
    ],
    jobs: [
      /* ---------- SOLO ---------- */
      { id: "j-s1", scope: "solo", customerId: "c-marko", description: "Servis bojlera", date: today(), time: "09:00", location: "Kneza Miloša 24, Beograd", price: 120, status: "ZAKAZANO", paid: false, assigneeType: "solo", assigneeId: "w-petar" },
      { id: "j-s2", scope: "solo", customerId: "c-nikola", description: "Popravka instalacije", date: today(), time: "14:00", location: "Bulevar Oslobođenja 12, Novi Sad", price: 90, status: "ZAKAZANO", paid: false, assigneeType: "solo", assigneeId: "w-petar" },
      { id: "j-s3", scope: "solo", customerId: "c-milan", description: "Zamena slavine u kupatilu", date: daysFromNow(-3), time: "10:30", location: "Vojvode Stepe 88, Beograd", price: 60, status: "ZAVRŠENO", paid: true, assigneeType: "solo", assigneeId: "w-petar" },
      { id: "j-s4", scope: "solo", customerId: "c-firma", description: "Servis grejanja u kancelariji", date: daysFromNow(-6), time: "08:00", location: "Zmaj Jovina 5, Beograd", price: 320, status: "ČEKA NAPLATU", paid: false, assigneeType: "solo", assigneeId: "w-petar" },
      { id: "j-s5", scope: "solo", customerId: "c-ana", description: "Odgušenje odvoda", date: daysFromNow(-1), time: "16:00", location: "Gospodar Jevremova 3, Beograd", price: 70, status: "ZAVRŠENO", paid: true, assigneeType: "solo", assigneeId: "w-petar" },
      { id: "j-s6", scope: "solo", customerId: "c-marko", description: "Ugradnja filtera za vodu", date: daysFromNow(2), time: "11:00", location: "Kneza Miloša 24, Beograd", price: 150, status: "ZAKAZANO", paid: false, assigneeType: "solo", assigneeId: "w-petar" },
      /* ---------- TIM ---------- */
      { id: "j-t1", scope: "tim", customerId: "c-marko", description: "Servis bojlera", date: today(), time: "09:00", location: "Kneza Miloša 24, Beograd", price: 120, status: "DODELJENO", paid: false, assigneeType: "worker", assigneeId: "w-marko" },
      { id: "j-t2", scope: "tim", customerId: "c-nikola", description: "Popravka slavine", date: today(), time: "11:00", location: "Bulevar Oslobođenja 12, Novi Sad", price: 80, status: "U TOKU", paid: false, assigneeType: "worker", assigneeId: "w-nikola" },
      { id: "j-t3", scope: "tim", customerId: "c-milan", description: "Popravka instalacije", date: today(), time: "14:00", location: "Vojvode Stepe 88, Beograd", price: 140, status: "DODELJENO", paid: false, assigneeType: "worker", assigneeId: "w-milan" },
      { id: "j-t4", scope: "tim", customerId: "c-ana", description: "Zamena vodokotlića", date: daysFromNow(-2), time: "10:00", location: "Gospodar Jevremova 3, Beograd", price: 95, status: "ZAVRŠENO", paid: true, assigneeType: "worker", assigneeId: "w-marko" },
      { id: "j-t5", scope: "tim", customerId: "c-firma", description: "Servis sanitarija", date: daysFromNow(-4), time: "08:30", location: "Zmaj Jovina 5, Beograd", price: 250, status: "ČEKA NAPLATU", paid: false, assigneeType: "worker", assigneeId: "w-nikola" },
      { id: "j-t6", scope: "tim", customerId: "c-marko", description: "Zamena ventila", date: daysFromNow(-5), time: "12:00", location: "Kneza Miloša 24, Beograd", price: 60, status: "ZAVRŠENO", paid: true, assigneeType: "worker", assigneeId: "w-milan" },
      { id: "j-t7", scope: "tim", customerId: "c-nikola", description: "Pregled instalacija", date: daysFromNow(-7), time: "09:30", location: "Bulevar Oslobođenja 12, Novi Sad", price: 55, status: "ZAVRŠENO", paid: true, assigneeType: "worker", assigneeId: "w-nikola" },
      { id: "j-t8", scope: "tim", customerId: "c-ana", description: "Popravka bojlera", date: daysFromNow(-8), time: "15:00", location: "Gospodar Jevremova 3, Beograd", price: 200, status: "ČEKA NAPLATU", paid: false, assigneeType: "worker", assigneeId: "w-milan" },
      /* ---------- ZADRUGA ---------- */
      { id: "j-z1", scope: "zadruga", customerId: "c-marko", description: "Vodoinstalaterski radovi — prizemlje", date: today(), time: "08:00", location: "Kneza Miloša 24, Beograd", price: 480, status: "DODELJENO", paid: false, assigneeType: "team", assigneeId: "t-vodo" },
      { id: "j-z2", scope: "zadruga", customerId: "c-firma", description: "Zamena razvodne table", date: today(), time: "09:00", location: "Zmaj Jovina 5, Beograd", price: 620, status: "U TOKU", paid: false, assigneeType: "team", assigneeId: "t-elek" },
      { id: "j-z3", scope: "zadruga", customerId: "c-nikola", description: "Renovacija kupatila", date: tomorrow(), time: "08:00", location: "Bulevar Oslobođenja 12, Novi Sad", price: 1200, status: "ZAKAZANO", paid: false, assigneeType: "mixed", assigneeId: "mt-renovacija" },
      { id: "j-z4", scope: "zadruga", customerId: "c-ana", description: "Krečenje stana", date: tomorrow(), time: "10:00", location: "Gospodar Jevremova 3, Beograd", price: 340, status: "ZAKAZANO", paid: false, assigneeType: "worker", assigneeId: "w-jovan" },
      { id: "j-z5", scope: "zadruga", customerId: "c-milan", description: "Hitna intervencija — curenje", date: today(), time: "17:00", location: "Vojvode Stepe 88, Beograd", price: 130, status: "ZAKAZANO", paid: false, assigneeType: "none" },
      { id: "j-z6", scope: "zadruga", customerId: "c-marko", description: "Montaža klime", date: daysFromNow(3), time: "12:00", location: "Kneza Miloša 24, Beograd", price: 210, status: "ZAKAZANO", paid: false, assigneeType: "none" },
      { id: "j-z7", scope: "zadruga", customerId: "c-firma", description: "Servis kotlarnice", date: daysFromNow(4), time: "07:30", location: "Zmaj Jovina 5, Beograd", price: 890, status: "ZAKAZANO", paid: false, assigneeType: "none" },
      { id: "j-z8", scope: "zadruga", customerId: "c-nikola", description: "Zamena osigurača", date: daysFromNow(-2), time: "13:00", location: "Bulevar Oslobođenja 12, Novi Sad", price: 140, status: "ČEKA NAPLATU", paid: false, assigneeType: "worker", assigneeId: "w-milan" },
      { id: "j-z9", scope: "zadruga", customerId: "c-ana", description: "Popravka bojlera", date: daysFromNow(-3), time: "10:00", location: "Gospodar Jevremova 3, Beograd", price: 180, status: "ZAVRŠENO", paid: true, assigneeType: "worker", assigneeId: "w-stefan" },
      { id: "j-z10", scope: "zadruga", customerId: "c-firma", description: "Elektro održavanje — mesečno", date: daysFromNow(-5), time: "09:00", location: "Zmaj Jovina 5, Beograd", price: 1100, status: "ČEKA NAPLATU", paid: false, assigneeType: "team", assigneeId: "t-elek" },
      { id: "j-z11", scope: "zadruga", customerId: "c-milan", description: "Zamena cevi", date: daysFromNow(-6), time: "08:00", location: "Vojvode Stepe 88, Beograd", price: 430, status: "ZAVRŠENO", paid: true, assigneeType: "team", assigneeId: "t-vodo" },
      { id: "j-z12", scope: "zadruga", customerId: "c-marko", description: "Farbanje fasade", date: daysFromNow(-8), time: "08:00", location: "Kneza Miloša 24, Beograd", price: 760, status: "ZAVRŠENO", paid: true, assigneeType: "worker", assigneeId: "w-jovan" },
    ],
    notifications: [
      { id: "n1", icon: "🔔", text: "Marko ima novi dodeljeni posao.", target: { type: "worker", id: "w-marko" }, read: false },
      { id: "n2", icon: "🔔", text: "Posao kod Petrovića je sutra u 09:00.", target: { type: "customer", id: "c-marko" }, read: false },
      { id: "n3", icon: "⚠️", text: "Jedan posao kasni sa realizacijom.", target: { type: "job", id: "j-z8" }, read: false },
      { id: "n4", icon: "💰", text: "Naplata od Jovanović Company je nenaplaćena.", target: { type: "customer", id: "c-firma" }, read: false },
    ],
  };
}
