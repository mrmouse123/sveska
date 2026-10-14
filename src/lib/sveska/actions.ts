import type { AiResult, DemoState, Job, Mode } from "./types";
import { today, tomorrow } from "./data";

export interface DemoActions {
  createJob: (input: Omit<Job, "id">) => Job;
  createMixedTeam: (
    name: string,
    members: { workerId: string; responsibility: string }[],
  ) => { id: string; name: string };
  ensureCustomer: (name: string) => string;
  addNotification: (n: { icon: string; text: string; target?: { type: "job" | "customer" | "worker"; id: string } }) => void;
}

const normDate = (d?: string) => {
  if (!d) return tomorrow();
  const low = d.toLowerCase();
  if (low === "tomorrow" || low === "sutra") return tomorrow();
  if (low === "today" || low === "danas") return today();
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return tomorrow();
};

const findWorker = (state: DemoState, name?: string) =>
  name
    ? state.workers.find((w) => w.name.toLowerCase() === name.toLowerCase()) ??
      state.workers.find((w) => name.toLowerCase().includes(w.name.toLowerCase()))
    : undefined;

const findTeam = (state: DemoState, name?: string) =>
  name
    ? state.teams.find((t) => t.name.toLowerCase() === name.toLowerCase()) ??
      state.teams.find((t) => t.name.toLowerCase().includes(name.toLowerCase()))
    : undefined;

const customerAddress = (state: DemoState, id: string) =>
  state.customers.find((c) => c.id === id)?.address ?? "";

/** Executes a confirmed AI interpretation against the demo state. */
export function executeAiResult(
  result: AiResult,
  mode: Mode,
  state: DemoState,
  actions: DemoActions,
): string {
  switch (result.suggestedAction) {
    case "CREATE_JOB": {
      const customerId = actions.ensureCustomer(result.customer ?? "Novi klijent");
      const job = actions.createJob({
        scope: mode,
        customerId,
        description: result.description ?? "Novi posao",
        date: normDate(result.date),
        time: result.time ?? "09:00",
        location: customerAddress(state, customerId),
        price: result.price ?? 0,
        status: "ZAKAZANO",
        paid: false,
        assigneeType: mode === "solo" ? "solo" : "none",
        ...(mode === "solo" ? { assigneeId: "w-petar" } : {}),
      });
      actions.addNotification({
        icon: "🔔",
        text: `Novi posao zakazan: ${result.description ?? "posao"}.`,
        target: { type: "job", id: job.id },
      });
      return "Posao je zakazan.";
    }
    case "ASSIGN_JOB": {
      const worker = findWorker(state, result.worker);
      const team = findTeam(state, result.team);
      const customerId = actions.ensureCustomer(result.customer ?? "Novi klijent");
      const job = actions.createJob({
        scope: mode,
        customerId,
        description: result.description ?? "Radovi kod klijenta",
        date: normDate(result.date),
        time: result.time ?? "09:00",
        location: customerAddress(state, customerId),
        price: result.price ?? 0,
        status: "DODELJENO",
        paid: false,
        assigneeType: worker ? "worker" : team ? "team" : "none",
        ...(worker ? { assigneeId: worker.id } : team ? { assigneeId: team.id } : {}),
      });
      actions.addNotification({
        icon: "🔔",
        text: `${worker?.name ?? team?.name ?? "Izvršilac"} ima novi dodeljeni posao.`,
        target: { type: "job", id: job.id },
      });
      return `Posao je dodeljen: ${worker?.name ?? team?.name ?? "izvršiocu"}.`;
    }
    case "CREATE_ASSIGNMENTS": {
      const list = result.assignments ?? [];
      list.forEach((a) => {
        const worker = findWorker(state, a.worker);
        const team = findTeam(state, a.team);
        const customerId = actions.ensureCustomer(a.customer ?? "Novi klijent");
        const job = actions.createJob({
          scope: mode,
          customerId,
          description: a.description ?? "Radovi kod klijenta",
          date: normDate(a.date ?? result.date),
          time: a.time ?? "08:00",
          location: customerAddress(state, customerId),
          price: 0,
          status: "DODELJENO",
          paid: false,
          assigneeType: team ? "team" : worker ? "worker" : "none",
          ...(team ? { assigneeId: team.id } : worker ? { assigneeId: worker.id } : {}),
        });
        actions.addNotification({
          icon: "🔔",
          text: `${team?.name ?? worker?.name ?? "Izvršilac"} → ${a.customer ?? ""}: novi zadatak.`,
          target: { type: "job", id: job.id },
        });
      });
      return `Kreirano ${list.length} ${list.length === 1 ? "zadatak" : "zadatka"}.`;
    }
    case "CREATE_MIXED_TEAM": {
      const members = (result.members ?? [])
        .map((m) => {
          const w = findWorker(state, m.name);
          if (!w) return null;
          const trade = (m.trade ?? w.trade).toLowerCase();
          const responsibility = trade.includes("elektr")
            ? "Električne instalacije"
            : trade.includes("moler")
              ? "Krečenje"
              : "Vodovodne instalacije";
          return { workerId: w.id, responsibility };
        })
        .filter(Boolean) as { workerId: string; responsibility: string }[];
      const team = actions.createMixedTeam(result.project ?? "NOVI MIXED TEAM", members);
      actions.addNotification({
        icon: "🔔",
        text: `Kreiran mixed team: ${team.name}.`,
      });
      return `Mixed team „${team.name}“ je kreiran.`;
    }
    default:
      return result.answer ?? "";
  }
}
