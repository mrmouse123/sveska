import { InviteWorker } from "@/components/sveska/InviteWorker";
import { useState } from "react";
import { useDemo } from "@/lib/sveska/store";
import type { Job, Mode } from "@/lib/sveska/types";
import { customerName, eur, isOpen, scopeJobs } from "@/lib/sveska/queries";
import { JobDetailDialog, JobRow, NewJobDialog, SectionTitle, StatCard } from "../Common";
import { InvestorNote } from "../InvestorNote";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Wrench, Zap } from "lucide-react";
import { toast } from "sonner";

export function TeamScreen({ mode }: { mode: Mode }) {
  const { state } = useDemo();
  const [worker, setWorker] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const jobs = scopeJobs(state, mode);
  const team = state.teams.find((t) => t.id === "t-vodo");
  const members = state.workers.filter(
    (w) => w.id === "w-petar" || team?.memberIds.includes(w.id) || w.id === "w-milan",
  );

  const selected = state.workers.find((w) => w.id === worker);
  if (selected) {
    const wJobs = jobs.filter((j) => j.assigneeId === selected.id);
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => setWorker(null)}
          className="text-sm font-semibold text-muted-foreground"
        >
          ← Nazad na tim
        </button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-bold">
            {selected.name} <span className="text-base font-normal text-muted-foreground">— {selected.trade}</span>
          </h1>
          <InviteWorker workerId={selected.id} workerName={selected.name} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Ukupno" value={String(wJobs.length)} />
          <StatCard label="Završeno" value={String(wJobs.filter((j) => !isOpen(j)).length)} />
          <StatCard label="Aktivno" value={String(wJobs.filter(isOpen).length)} />
        </div>
        <div className="space-y-2">
          {wJobs.map((j) => (
            <JobRow key={j.id} job={j} onClick={() => setJob(j)} />
          ))}
        </div>
        <JobDetailDialog job={job} open={Boolean(job)} onOpenChange={(v) => !v && setJob(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Tim — VODOINSTALATERI</h1>
          <p className="text-sm text-muted-foreground">Petar — vođa tima</p>
        </div>
        <NewJobDialog mode={mode} trigger={<Button className="font-semibold">DODELI POSAO</Button>} />
      </div>
      <InvestorNote title="TIM" text="Vođa vidi i raspoređuje posao celom timu." />
      <div className="grid gap-3 sm:grid-cols-2">
        {members.map((w) => {
          const wJobs = jobs.filter((j) => j.assigneeId === w.id);
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => setWorker(w.id)}
              className="surface p-5 text-left transition-transform hover:-translate-y-0.5"
            >
              <p className="font-display text-lg font-semibold">{w.name}</p>
              <p className="text-sm text-muted-foreground">
                {w.role} — {w.trade}
              </p>
              <p className="mt-3 text-sm">
                {wJobs.length} poslova · {wJobs.filter((j) => !isOpen(j)).length} završenih ·{" "}
                {wJobs.filter(isOpen).length} aktivnih
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function OrganizationScreen({ onOpenMixed }: { onOpenMixed: () => void }) {
  const { state } = useDemo();
  const [worker, setWorker] = useState<string | null>(null);
  const [team, setTeam] = useState<string | null>(null);
  const jobs = scopeJobs(state, "zadruga");

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">Moja zadruga</h1>
      <InvestorNote
        title="ZADRUGA"
        text="Jedan administrator upravlja različitim ekipama i profesijama."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {state.teams.map((t) => {
          const Icon = t.name.toLowerCase().includes("elektr") ? Zap : Wrench;
          return (
            <div key={t.id} className="surface p-5">
              <button
                type="button"
                onClick={() => setTeam(team === t.id ? null : t.id)}
                className="flex w-full items-start gap-3 text-left"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft">
                  <Icon className="size-5 text-accent-foreground" />
                </span>
                <span className="min-w-0">
                  <p className="font-display text-lg font-bold">{t.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {t.memberIds.length} članova ·{" "}
                    {jobs.filter((j) => j.assigneeId === t.id && isOpen(j)).length} aktivnih poslova
                  </p>
                </span>
              </button>
              <div className="mt-3 space-y-1">
                {t.memberIds.map((id) => {
                  const w = state.workers.find((x) => x.id === id)!;
                  const wJobs = jobs.filter((j) => j.assigneeId === id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setWorker(worker === id ? null : id)}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-secondary"
                    >
                      <span>├── {w.name}</span>
                      <span className="text-muted-foreground">{wJobs.length} poslova</span>
                    </button>
                  );
                })}
              </div>
              {team === t.id ? (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  {jobs
                    .filter((j) => j.assigneeId === t.id)
                    .map((j) => (
                      <p key={j.id} className="text-sm text-muted-foreground">
                        {j.date} {j.time} — {customerName(state, j.customerId)} — {j.description}
                      </p>
                    ))}
                </div>
              ) : null}
            </div>
          );
        })}

        <div className="surface p-5">
          <p className="font-display text-lg font-bold">SOLO</p>
          <p className="mt-2 text-sm">└── Petar — vodoinstalater (vlasnik)</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {jobs.filter((j) => j.assigneeId === "w-petar").length} poslova u zadruzi
          </p>
        </div>

        <div className="surface p-5">
          <div className="flex items-center justify-between">
            <p className="font-display text-lg font-bold">MIXED TEAMS</p>
            <button
              type="button"
              onClick={onOpenMixed}
              className="text-xs font-semibold underline underline-offset-4"
            >
              Otvori
            </button>
          </div>
          <div className="mt-2 space-y-1">
            {state.mixedTeams.map((mt) => (
              <p key={mt.id} className="text-sm">
                └── {mt.name}
              </p>
            ))}
          </div>
        </div>
      </div>

      {worker ? <WorkerLoad workerId={worker} /> : null}
    </div>
  );
}

function WorkerLoad({ workerId }: { workerId: string }) {
  const { state } = useDemo();
  const w = state.workers.find((x) => x.id === workerId);
  const jobs = state.jobs.filter((j) => j.assigneeId === workerId);
  if (!w) return null;
  return (
    <div className="surface p-5">
      <SectionTitle>Opterećenje — {w.name}</SectionTitle>
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Ukupno" value={String(jobs.length)} />
        <StatCard label="Aktivno" value={String(jobs.filter(isOpen).length)} />
        <StatCard label="Vrednost" value={eur(jobs.reduce((s, j) => s + j.price, 0))} />
      </div>
    </div>
  );
}

export function MixedTeamsScreen() {
  const { state, createMixedTeam } = useDemo();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const jobs = scopeJobs(state, "zadruga");

  const responsibilityFor = (trade: string) =>
    trade.includes("elektr")
      ? "Električne instalacije"
      : trade.includes("moler")
        ? "Krečenje"
        : "Vodovodne instalacije";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Mixed teams</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="font-semibold">+ NOVI MIXED TEAM</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">Novi mixed team</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Naziv projekta</Label>
                <Input
                  className="mt-1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="npr. Renovacija Petrović"
                />
              </div>
              <div className="space-y-2">
                <Label>Članovi</Label>
                {state.workers.map((w) => (
                  <label
                    key={w.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <Checkbox
                      checked={picked.includes(w.id)}
                      onCheckedChange={(c) =>
                        setPicked((p) => (c ? [...p, w.id] : p.filter((x) => x !== w.id)))
                      }
                    />
                    <span className="text-sm">
                      {w.name} — {w.trade}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button
                className="font-semibold"
                onClick={() => {
                  if (!name.trim() || !picked.length) {
                    toast("Unesi naziv i izaberi bar jednog člana.");
                    return;
                  }
                  const team = createMixedTeam(
                    name.trim(),
                    picked.map((id) => ({
                      workerId: id,
                      responsibility: responsibilityFor(
                        state.workers.find((w) => w.id === id)?.trade ?? "",
                      ),
                    })),
                  );
                  toast.success(`Mixed team „${team.name}“ je kreiran.`);
                  setOpen(false);
                  setName("");
                  setPicked([]);
                }}
              >
                KREIRAJ TIM
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <InvestorNote
        title="MIXED TEAM"
        text="Privremeni tim se formira za konkretan projekat."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {state.mixedTeams.map((mt) => (
          <div key={mt.id} className="surface p-5">
            <p className="font-display text-lg font-bold">{mt.name}</p>
            <p className="text-sm text-muted-foreground">{mt.project}</p>
            <ul className="mt-3 space-y-2">
              {mt.members.map((m) => {
                const w = state.workers.find((x) => x.id === m.workerId);
                return (
                  <li key={m.workerId} className="flex items-center justify-between text-sm">
                    <span className="font-medium">
                      {w?.name} — {w?.trade}
                    </span>
                    <span className="text-muted-foreground">{m.responsibility}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">
              {jobs.filter((j) => j.assigneeId === mt.id).length} poslova na projektu
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
