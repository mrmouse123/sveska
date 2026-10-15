import type { DemoState, Job, Mode } from "./types";
import { formatDateSr, today, tomorrow } from "./data";
import { deburr } from "./text";

/** Decimale se prikazuju samo kad postoje: 120,50 je ostajalo €121. */
export const eur = (n: number) =>
  `€${n.toLocaleString("de-DE", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

export const scopeJobs = (state: DemoState, mode: Mode) =>
  state.jobs.filter((j) => j.scope === mode);

export const customerName = (state: DemoState, id: string) =>
  state.customers.find((c) => c.id === id)?.name ?? "Nepoznat klijent";

export const workerName = (state: DemoState, id?: string) =>
  state.workers.find((w) => w.id === id)?.name ?? "";

export function assigneeLabel(state: DemoState, job: Job): string {
  switch (job.assigneeType) {
    case "worker":
      return workerName(state, job.assigneeId);
    case "team":
      return state.teams.find((t) => t.id === job.assigneeId)?.name ?? "Tim";
    case "mixed":
      return state.mixedTeams.find((t) => t.id === job.assigneeId)?.name ?? "Mixed team";
    case "solo":
      return "Petar";
    default:
      return "Nedodeljeno";
  }
}

export const isDone = (j: Job) => j.status === "ZAVRŠENO";
export const isOpen = (j: Job) => j.status !== "ZAVRŠENO" && j.status !== "OTKAZANO";

export function stats(state: DemoState, mode: Mode) {
  const jobs = scopeJobs(state, mode);
  const month = today().slice(0, 7);
  const monthJobs = jobs.filter((j) => j.date.startsWith(month));
  return {
    jobs,
    total: jobs.length,
    active: jobs.filter(isOpen).length,
    done: jobs.filter(isDone).length,
    unassigned: jobs.filter((j) => j.assigneeType === "none").length,
    unpaidJobs: jobs.filter((j) => !j.paid && j.status !== "OTKAZANO"),
    unpaidTotal: jobs.filter((j) => !j.paid && j.status !== "OTKAZANO").reduce((s, j) => s + j.price, 0),
    paidTotal: jobs.filter((j) => j.paid).reduce((s, j) => s + j.price, 0),
    grandTotal: jobs.reduce((s, j) => s + j.price, 0),
    monthCount: monthJobs.length,
    monthRevenue: monthJobs.filter((j) => j.paid).reduce((s, j) => s + j.price, 0),
    monthOutstanding: monthJobs.filter((j) => !j.paid).reduce((s, j) => s + j.price, 0),
  };
}

export const jobsOn = (state: DemoState, mode: Mode, date: string) =>
  scopeJobs(state, mode)
    .filter((j) => j.date === date)
    .sort((a, b) => a.time.localeCompare(b.time));

export function isWorkerBusy(state: DemoState, workerId: string, date: string, time: string) {
  return state.jobs.some(
    (j) =>
      j.assigneeId === workerId &&
      j.date === date &&
      j.time === time &&
      j.status !== "OTKAZANO",
  );
}

export function freeWorkers(state: DemoState, date: string, time: string) {
  return state.workers.filter((w) => !isWorkerBusy(state, w.id, date, time));
}

export function searchAll(state: DemoState, q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return { customers: [], jobs: [], workers: [], teams: [], mixedTeams: [] };
  return {
    customers: state.customers.filter((c) =>
      [c.name, c.phone, c.email, c.address].join(" ").toLowerCase().includes(s),
    ),
    jobs: state.jobs.filter((j) =>
      [j.description, customerName(state, j.customerId), j.location]
        .join(" ")
        .toLowerCase()
        .includes(s),
    ),
    workers: state.workers.filter((w) => `${w.name} ${w.trade}`.toLowerCase().includes(s)),
    teams: state.teams.filter((t) => t.name.toLowerCase().includes(s)),
    mixedTeams: state.mixedTeams.filter((t) =>
      `${t.name} ${t.project}`.toLowerCase().includes(s),
    ),
  };
}

/** Answers business questions from current demo state. */
export function answerQuestion(text: string, mode: Mode, state: DemoState): string | null {
  // deburr, ne samo lowercase. Bez toga „ko mi je DUŽAN“ nije pogađalo
  // ključnu reč „dug“, a ni ASCII unos („zavrseni“) nije radio.
  const t = deburr(text);
  const jobs = scopeJobs(state, mode);
  const line = (j: Job) =>
    `• ${j.time} — ${customerName(state, j.customerId)} — ${j.description}${
      j.assigneeType !== "solo" && j.assigneeType !== "none"
        ? ` (${assigneeLabel(state, j)})`
        : ""
    }`;

  if (t.includes("danas") && (t.includes("posl") || t.includes("raspored"))) {
    const list = jobsOn(state, mode, today());
    return list.length
      ? `Danas imaš ${list.length} ${list.length === 1 ? "posao" : "poslova"}:\n${list.map(line).join("\n")}`
      : "Danas nemaš zakazanih poslova.";
  }
  if (t.includes("sutra") && (t.includes("posl") || t.includes("raspored"))) {
    const list = jobsOn(state, mode, tomorrow());
    return list.length
      ? `Sutra imaš ${list.length} ${list.length === 1 ? "posao" : "poslova"}:\n${list.map(line).join("\n")}`
      : "Sutra nema zakazanih poslova.";
  }
  if (
    t.includes("duguj") ||
    t.includes("duzan") ||
    t.includes("duzn") ||
    t.includes("potrazuj") ||
    t.includes("nenaplac") ||
    t.includes("dug")
  ) {
    const unpaid = jobs.filter((j) => !j.paid && j.status !== "OTKAZANO");
    const byCustomer = new Map<string, number>();
    unpaid.forEach((j) =>
      byCustomer.set(j.customerId, (byCustomer.get(j.customerId) ?? 0) + j.price),
    );
    if (!byCustomer.size) return "Trenutno nema nenaplaćenih poslova. Sve je naplaćeno 👏";
    const total = [...byCustomer.values()].reduce((a, b) => a + b, 0);
    return `Ukupno nenaplaćeno: ${eur(total)}\n${[...byCustomer]
      .map(([id, amt]) => `• ${customerName(state, id)} — ${eur(amt)}`)
      .join("\n")}`;
  }
  if (t.includes("zarad") || t.includes("prihod") || t.includes("koliko sam") || t.includes("koliko smo")) {
    const s = stats(state, mode);
    return `Ovog meseca: ${s.monthCount} poslova, naplaćeno ${eur(s.monthRevenue)}, nenaplaćeno ${eur(s.monthOutstanding)}.`;
  }
  if ((t.includes("nisu zavrs") || t.includes("nezavrs") || t.includes("u toku")) && t.includes("posl")) {
    const open = jobs.filter(isOpen);
    return open.length
      ? `Nezavršenih poslova: ${open.length}\n${open
          .slice(0, 8)
          .map((j) => `• ${formatDateSr(j.date)} ${j.time} — ${customerName(state, j.customerId)} — ${j.description} [${j.status}]`)
          .join("\n")}`
      : "Svi poslovi su završeni.";
  }
  if (t.includes("slobod") || t.includes("dostupn")) {
    const date = t.includes("danas") ? today() : tomorrow();
    const busy = new Set(
      state.jobs.filter((j) => j.date === date && j.status !== "OTKAZANO").map((j) => j.assigneeId),
    );
    const free = state.workers.filter((w) => !busy.has(w.id));
    return free.length
      ? `${date === today() ? "Danas" : "Sutra"} su slobodni:\n${free
          .map((w) => `• ${w.name} — ${w.trade}`)
          .join("\n")}`
      : "Svi radnici su zauzeti tog dana.";
  }
  if (t.includes("najmanje posla") || (t.includes("tim") && t.includes("najmanje"))) {
    const loads = state.teams.map((tm) => ({
      name: tm.name,
      count: state.jobs.filter((j) => j.assigneeId === tm.id && isOpen(j)).length,
    }));
    loads.sort((a, b) => a.count - b.count);
    return loads.map((l) => `• ${l.name} — ${l.count} aktivnih poslova`).join("\n");
  }
  if (t.includes("aktivn") && t.includes("posl")) {
    const s = stats(state, mode);
    return `Aktivnih poslova: ${s.active}. Završenih: ${s.done}. Nedodeljenih: ${s.unassigned}.`;
  }
  return null;
}
