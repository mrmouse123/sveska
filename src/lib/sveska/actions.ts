import type { AiResult, DemoState, Job, Mode } from "./types";
import { today, tomorrow } from "./data";

export interface DemoActions {
  createJob: (input: Omit<Job, "id">) => Job;
  createMixedTeam: (
    name: string,
    members: { workerId: string; responsibility: string }[],
  ) => { id: string; name: string };
  ensureCustomer: (name: string) => string;
  setJobStatus: (id: string, status: Job["status"]) => void;
  updateJob: (id: string, patch: Partial<Job>) => void;
  addTeamMember: (teamId: string, workerId: string) => void;
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
          price: a.price ?? 0,
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
    case "CANCEL_JOB": {
      const job = state.jobs.find((j) => j.id === result.jobId);
      if (!job) return "Nisam našla taj posao.";
      actions.setJobStatus(job.id, "OTKAZANO");
      actions.addNotification({
        icon: "✖️",
        text: `Otkazan posao: ${job.description}.`,
        target: { type: "job", id: job.id },
      });
      return `Otkazan posao „${job.description}" (${job.date} u ${job.time}).`;
    }
    case "UPDATE_JOB": {
      const job = state.jobs.find((j) => j.id === result.jobId);
      if (!job) return "Nisam našla taj posao.";
      const patch: Partial<Job> = {
        ...(result.time ? { time: result.time } : {}),
        ...(result.date ? { date: normDate(result.date) } : {}),
        ...(result.price !== undefined ? { price: result.price } : {}),
      };
      if (Object.keys(patch).length === 0) return "Nije bilo šta da se promeni.";
      actions.updateJob(job.id, patch);
      const parts = [
        patch.date ? `datum ${patch.date}` : "",
        patch.time ? `vreme ${patch.time}` : "",
        patch.price !== undefined ? `cena ${patch.price}` : "",
      ].filter(Boolean);
      return `Izmenjen posao „${job.description}": ${parts.join(", ")}.`;
    }
    case "ADD_TEAM_MEMBER": {
      const worker = findWorker(state, result.worker);
      const team = findTeam(state, result.team);
      if (!worker || !team) return "Nisam našla tog radnika ili tim.";
      if (team.memberIds.includes(worker.id)) {
        return `${worker.name} je već u timu ${team.name}.`;
      }
      actions.addTeamMember(team.id, worker.id);
      actions.addNotification({
        icon: "👷",
        text: `${worker.name} je dodat u tim ${team.name}.`,
        target: { type: "worker", id: worker.id },
      });
      return `${worker.name} je dodat u tim ${team.name}.`;
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
