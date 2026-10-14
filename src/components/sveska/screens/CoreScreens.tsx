import { useState } from "react";
import { useDemo } from "@/lib/sveska/store";
import type { Job, Mode } from "@/lib/sveska/types";
import { customerName, eur, jobsOn, scopeJobs, stats, isOpen, isWorkerBusy } from "@/lib/sveska/queries";
import { iso, today, tomorrow, DEMO_USER } from "@/lib/sveska/data";
import { JobDetailDialog, JobRow, NewJobDialog, SectionTitle, StatCard } from "../Common";
import { InvestorNote } from "../InvestorNote";
import { VoiceCard } from "../VoiceCard";
import { Wrench, Zap, Paintbrush, ArrowRight } from "lucide-react";

const TRADE_ICON = (trade: string) =>
  trade.toLowerCase().includes("elektr") ? Zap : trade.toLowerCase().includes("moler") ? Paintbrush : Wrench;

export function DashboardScreen({ mode, onNavigate }: { mode: Mode; onNavigate: (s: string) => void }) {
  const { state } = useDemo();
  const s = stats(state, mode);
  const [job, setJob] = useState<Job | null>(null);
  const todays = jobsOn(state, mode, today());
  const freeWorkers = state.workers.filter(
    (w) => !isWorkerBusy(state, w.id, today(), "10:00"),
  ).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold sm:text-[28px]">
          {mode === "zadruga" ? "Moja zadruga" : `Dobro jutro, ${DEMO_USER.firstName}e! 👋`}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "solo"
            ? "Evo šta te danas čeka."
            : mode === "tim"
              ? "Evo pregleda tvog tima."
              : "Evo pregleda cele zadruge."}
        </p>
      </header>

      <VoiceCard
        title={
          mode === "solo"
            ? "Šta treba danas da uradimo?"
            : mode === "tim"
              ? "Šta treba da rasporedimo?"
              : "Šta treba da se uradi?"
        }
        subtitle="Samo reci SVESCI."
      />

      <InvestorNote
        title="VOICE-FIRST"
        text="Jedna rečenica postaje posao, termin i zaduženje."
      />

      {mode === "zadruga" ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Aktivni poslovi" value={String(s.active)} />
          <StatCard label="Danas" value={String(todays.length)} />
          <StatCard label="Timovi" value={String(state.teams.length)} />
          <StatCard label="Nenaplaćeno" value={eur(s.unpaidTotal)} accent />
        </div>
      ) : mode === "tim" ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Članova tima" value={String(state.workers.length)} />
          <StatCard label="Aktivnih poslova" value={String(s.active)} />
          <StatCard label="Slobodnih radnika" value={String(freeWorkers)} />
          <StatCard label="Nenaplaćeno" value={eur(s.unpaidTotal)} accent />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Danas poslova" value={String(todays.length)} />
          <StatCard label="Završeno" value={String(s.done)} />
          <StatCard label="Nenaplaćeno" value={eur(s.unpaidTotal)} accent />
          <StatCard label="Podsećanja" value={String(state.notifications.filter((n) => !n.read).length)} />
        </div>
      )}

      {mode === "tim" ? (
        <section>
          <SectionTitle>Moj tim</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            {state.workers.slice(0, 3).map((w) => {
              const Icon = TRADE_ICON(w.trade);
              const count = state.jobs.filter((j) => j.assigneeId === w.id && j.date === today()).length;
              const free = !isWorkerBusy(state, w.id, today(), "10:00");
              return (
                <div key={w.id} className="surface flex items-start gap-3 p-4">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft">
                    <Icon className="size-4 text-accent-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold">
                      <span
                        className={`inline-block size-2 shrink-0 rounded-full ${free ? "bg-success" : "bg-accent"}`}
                      />
                      {w.name}
                    </p>
                    <p className="truncate text-[13px] text-muted-foreground">{w.trade}</p>
                    <p className="mt-1 text-[13px] text-muted-foreground">{count} posla danas</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section>
        <SectionTitle action={<NewJobDialog mode={mode} />}>Današnji poslovi</SectionTitle>
        <div className="space-y-2">
          {todays.length ? (
            todays.map((j) => <JobRow key={j.id} job={j} onClick={() => setJob(j)} />)
          ) : (
            <p className="surface p-6 text-sm text-muted-foreground">
              Danas nemaš zakazanih poslova. Reci SVESCI šta treba uraditi.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onNavigate("jobs")}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-semibold transition-colors hover:bg-secondary"
        >
          Pogledaj sve poslove <ArrowRight className="size-4" />
        </button>
      </section>

      <section>
        <SectionTitle>Sutra</SectionTitle>
        <div className="space-y-2">
          {jobsOn(state, mode, tomorrow()).length ? (
            jobsOn(state, mode, tomorrow()).map((j) => (
              <JobRow key={j.id} job={j} onClick={() => setJob(j)} />
            ))
          ) : (
            <p className="surface p-6 text-sm text-muted-foreground">Sutra je slobodno.</p>
          )}
        </div>
      </section>

      <JobDetailDialog job={job} open={Boolean(job)} onOpenChange={(v) => !v && setJob(null)} />
    </div>
  );
}

export function JobsScreen({ mode }: { mode: Mode }) {
  const { state } = useDemo();
  const [job, setJob] = useState<Job | null>(null);
  const [filter, setFilter] = useState<"svi" | "aktivni" | "završeni">("svi");
  const all = scopeJobs(state, mode).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const list =
    filter === "svi" ? all : filter === "aktivni" ? all.filter(isOpen) : all.filter((j) => !isOpen(j));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Poslovi</h1>
        <NewJobDialog mode={mode} />
      </div>
      <div className="flex gap-2">
        {(["svi", "aktivni", "završeni"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {list.map((j) => (
          <JobRow key={j.id} job={j} onClick={() => setJob(j)} />
        ))}
      </div>
      <JobDetailDialog job={job} open={Boolean(job)} onOpenChange={(v) => !v && setJob(null)} />
    </div>
  );
}

export function CustomersScreen({ mode }: { mode: Mode }) {
  const { state } = useDemo();
  const [selected, setSelected] = useState<string | null>(null);
  const jobs = scopeJobs(state, mode);
  const customer = state.customers.find((c) => c.id === selected);
  const [job, setJob] = useState<Job | null>(null);

  if (customer) {
    const history = jobs.filter((j) => j.customerId === customer.id);
    const spent = history.filter((j) => j.paid).reduce((s, j) => s + j.price, 0);
    const owed = history.filter((j) => !j.paid).reduce((s, j) => s + j.price, 0);
    const last = [...history].sort((a, b) => b.date.localeCompare(a.date))[0];
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="text-sm font-semibold text-muted-foreground"
        >
          ← Nazad na klijente
        </button>
        <div className="surface p-6">
          <h1 className="font-display text-2xl font-bold">{customer.name}</h1>
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <p>📞 {customer.phone || "—"}</p>
            <p>✉️ {customer.email || "—"}</p>
            <p>📍 {customer.address || "—"}</p>
            <p>📝 {customer.notes || "—"}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Ukupno plaćeno" value={eur(spent)} />
          <StatCard label="Dugovanje" value={eur(owed)} accent />
          <StatCard label="Poslednji servis" value={last ? last.date : "—"} />
        </div>
        <SectionTitle>Istorija poslova</SectionTitle>
        <div className="space-y-2">
          {history.map((j) => (
            <JobRow key={j.id} job={j} onClick={() => setJob(j)} />
          ))}
        </div>
        <JobDetailDialog job={job} open={Boolean(job)} onOpenChange={(v) => !v && setJob(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">Klijenti</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {state.customers.map((c) => {
          const cJobs = jobs.filter((j) => j.customerId === c.id);
          const owed = cJobs.filter((j) => !j.paid).reduce((s, j) => s + j.price, 0);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelected(c.id)}
              className="surface p-5 text-left transition-transform hover:-translate-y-0.5"
            >
              <p className="font-display text-lg font-semibold">{c.name}</p>
              <p className="text-sm text-muted-foreground">{c.address || "—"}</p>
              <p className="mt-3 text-sm">
                {cJobs.length} poslova · {owed ? `duguje ${eur(owed)}` : "bez dugovanja"}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarScreen({ mode }: { mode: Mode }) {
  const { state } = useDemo();
  const [view, setView] = useState<"dan" | "nedelja" | "mesec">("nedelja");
  const [filter, setFilter] = useState("SVI");
  const [job, setJob] = useState<Job | null>(null);
  const base = new Date();
  const days =
    view === "dan" ? 1 : view === "nedelja" ? 7 : 30;
  const jobs = scopeJobs(state, mode).filter((j) => {
    if (filter === "SVI") return true;
    if (filter === "TIMOVI") return j.assigneeType === "team";
    if (filter === "SOLO") return j.assigneeType === "solo";
    if (filter === "RADNICI") return j.assigneeType === "worker";
    if (filter === "MIXED TEAM") return j.assigneeType === "mixed";
    if (filter === "NEDODELJENI") return j.assigneeType === "none";
    return true;
  });

  const dates = Array.from({ length: days }).map((_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return iso(d);
  });

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">Kalendar</h1>
      <div className="flex flex-wrap gap-2">
        {(["dan", "nedelja", "mesec"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase ${
              view === v ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
      {mode === "zadruga" ? (
        <div className="flex flex-wrap gap-2">
          {["SVI", "TIMOVI", "SOLO", "RADNICI", "MIXED TEAM", "NEDODELJENI"].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                filter === f ? "border-accent bg-accent/20" : "border-border"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      ) : null}
      <div className="space-y-5">
        {dates.map((d) => {
          const dayJobs = jobs.filter((j) => j.date === d).sort((a, b) => a.time.localeCompare(b.time));
          if (!dayJobs.length && view === "mesec") return null;
          return (
            <div key={d}>
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {new Date(d).toLocaleDateString("sr-RS", { weekday: "long", day: "numeric", month: "long" })}
              </p>
              {dayJobs.length ? (
                <div className="space-y-2">
                  {dayJobs.map((j) => (
                    <JobRow key={j.id} job={j} onClick={() => setJob(j)} />
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Nema zakazanih poslova.
                </p>
              )}
            </div>
          );
        })}
      </div>
      <JobDetailDialog job={job} open={Boolean(job)} onOpenChange={(v) => !v && setJob(null)} />
    </div>
  );
}

export function PaymentsScreen({ mode }: { mode: Mode }) {
  const { state, setJobPaid } = useDemo();
  const s = stats(state, mode);
  const jobs = scopeJobs(state, mode);
  const overdue = jobs.filter((j) => !j.paid && j.date < today());

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">Naplate</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Ukupno" value={eur(s.grandTotal)} />
        <StatCard label="Naplaćeno" value={eur(s.paidTotal)} />
        <StatCard label="Nenaplaćeno" value={eur(s.unpaidTotal)} accent />
        <StatCard label="Dospelo" value={eur(overdue.reduce((a, j) => a + j.price, 0))} />
      </div>
      <div className="space-y-2">
        {jobs
          .filter((j) => j.price > 0)
          .sort((a, b) => Number(a.paid) - Number(b.paid))
          .map((j) => (
            <div
              key={j.id}
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{customerName(state, j.customerId)}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {j.description} · {j.date}
                </p>
              </div>
              <p className="font-display font-semibold">{eur(j.price)}</p>
              <button
                type="button"
                onClick={() => setJobPaid(j.id, !j.paid)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${
                  j.paid ? "bg-success/15 text-success" : "bg-destructive/12 text-destructive"
                }`}
              >
                {j.paid ? "PLAĆENO" : "NIJE PLAĆENO"}
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
