import { useState } from "react";
import { useDemo } from "@/lib/sveska/store";
import type { Job, JobStatus, Mode } from "@/lib/sveska/types";
import { assigneeLabel, customerName, eur } from "@/lib/sveska/queries";
import { formatDateSr, today } from "@/lib/sveska/data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const STATUSES: JobStatus[] = [
  "ZAKAZANO",
  "DODELJENO",
  "U TOKU",
  "ZAVRŠENO",
  "OTKAZANO",
  "ČEKA NAPLATU",
];

export function StatusBadge({ status }: { status: JobStatus }) {
  const tone =
    status === "OTKAZANO"
      ? "bg-destructive/10 text-destructive"
      : status === "ZAVRŠENO" || status === "DODELJENO"
        ? "bg-success/10 text-success"
        : status === "U TOKU"
          ? "bg-secondary text-muted-foreground"
          : status === "ČEKA NAPLATU"
            ? "bg-accent-soft text-accent-foreground"
            : "bg-accent/70 text-accent-foreground";
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide", tone)}>
      {status}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "surface p-4 transition-transform hover:-translate-y-0.5 sm:p-5",
        accent && "border-accent/50 bg-accent-soft",
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 font-display text-2xl font-bold sm:text-3xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function JobRow({
  job,
  onClick,
  showAssignee = true,
}: {
  job: Job;
  onClick?: () => void;
  showAssignee?: boolean;
}) {
  const { state } = useDemo();
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-left transition-colors hover:bg-secondary/60 sm:gap-4"
    >
      <div className="w-12 shrink-0">
        <p className="font-display text-sm font-bold">{job.time}</p>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {formatDateSr(job.date)}
        </p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{customerName(state, job.customerId)}</p>
        <p className="truncate text-[13px] text-muted-foreground">
          {job.description}
          {showAssignee && job.assigneeType !== "solo"
            ? ` · ${assigneeLabel(state, job)}`
            : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <StatusBadge status={job.status} />
        {job.price ? (
          <p className="hidden w-14 text-right text-sm font-semibold sm:block">{eur(job.price)}</p>
        ) : null}
      </div>
    </button>
  );
}

export function JobDetailDialog({
  job,
  open,
  onOpenChange,
}: {
  job: Job | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { state, setJobStatus, setJobPaid } = useDemo();
  if (!job) return null;
  const current = state.jobs.find((j) => j.id === job.id) ?? job;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">{current.description}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <Field label="Klijent" value={customerName(state, current.customerId)} />
          <Field label="Datum i vreme" value={`${formatDateSr(current.date)} u ${current.time}`} />
          <Field label="Lokacija" value={current.location || "—"} />
          <Field label="Izvršilac" value={assigneeLabel(state, current)} />
          <Field label="Cena" value={current.price ? eur(current.price) : "—"} />
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Status
            </p>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setJobStatus(current.id, s)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors",
                    current.status === s
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-secondary",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-secondary p-3">
            <span className="font-medium">
              {current.paid ? "Naplaćeno" : "Nije naplaćeno"}
            </span>
            <Button
              size="sm"
              variant={current.paid ? "outline" : "default"}
              onClick={() => setJobPaid(current.id, !current.paid)}
            >
              {current.paid ? "OZNAČI KAO NEPLAĆENO" : "OZNAČI KAO PLAĆENO"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export function NewJobDialog({ mode, trigger }: { mode: Mode; trigger?: React.ReactNode }) {
  const { state, createJob, addNotification, ensureCustomer } = useDemo();
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState(state.customers[0]?.name ?? "");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(today());
  const [time, setTime] = useState("09:00");
  const [location, setLocation] = useState("");
  const [price, setPrice] = useState("");
  const [status, setStatus] = useState<JobStatus>("ZAKAZANO");
  const [assignee, setAssignee] = useState<string>(mode === "solo" ? "solo:w-petar" : "none:");
  const [warning, setWarning] = useState<string | null>(null);

  const options: { value: string; label: string }[] = [
    ...(mode === "solo" ? [{ value: "solo:w-petar", label: "Petar (ja)" }] : []),
    ...(mode !== "solo" ? [{ value: "none:", label: "Nedodeljeno" }] : []),
    ...state.workers
      .filter((w) => mode === "zadruga" || w.teamId === "t-vodo" || w.id === "w-petar" || w.id === "w-milan")
      .map((w) => ({ value: `worker:${w.id}`, label: `${w.name} — ${w.trade}` })),
    ...(mode === "zadruga"
      ? state.teams.map((t) => ({ value: `team:${t.id}`, label: `TIM: ${t.name}` }))
      : []),
    ...(mode === "zadruga"
      ? state.mixedTeams.map((t) => ({ value: `mixed:${t.id}`, label: `MIXED: ${t.name}` }))
      : []),
  ];

  const submit = () => {
    const [type, id] = assignee.split(":") as [Job["assigneeType"], string];
    if (type === "worker" && id) {
      const busy = state.jobs.find(
        (j) => j.assigneeId === id && j.date === date && j.time === time && j.status !== "OTKAZANO",
      );
      if (busy) {
        const w = state.workers.find((x) => x.id === id);
        setWarning(
          `⚠️ ${w?.name} već ima posao u ${time}. Slobodni termini: ${["08:00", "12:00", "16:00"]
            .filter(
              (t) =>
                !state.jobs.some((j) => j.assigneeId === id && j.date === date && j.time === t),
            )
            .join(", ")}`,
        );
        return;
      }
    }
    const customerId = ensureCustomer(customer);
    const job = createJob({
      scope: mode,
      customerId,
      description: description || "Novi posao",
      date,
      time,
      location: location || state.customers.find((c) => c.id === customerId)?.address || "",
      price: Number(price) || 0,
      status: type === "none" ? status : status === "ZAKAZANO" ? "DODELJENO" : status,
      paid: false,
      assigneeType: type,
      ...(id ? { assigneeId: id } : {}),
    });
    addNotification({
      icon: "🔔",
      text: `Novi posao: ${job.description}.`,
      target: { type: "job", id: job.id },
    });
    setWarning(null);
    setOpen(false);
    setDescription("");
    setPrice("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button className="font-semibold">+ NOVI POSAO</Button>}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {mode === "solo" ? "Novi posao" : "Dodeli posao"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Klijent</Label>
            <Select value={customer} onValueChange={setCustomer}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Izaberi klijenta" />
              </SelectTrigger>
              <SelectContent>
                {state.customers.map((c) => (
                  <SelectItem key={c.id} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Opis posla</Label>
            <Input
              className="mt-1"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="npr. Servis bojlera"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Datum</Label>
              <Input className="mt-1" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Vreme</Label>
              <Input className="mt-1" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Lokacija</Label>
            <Input
              className="mt-1"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Adresa (opciono)"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cena (€)</Label>
              <Input
                className="mt-1"
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="120"
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as JobStatus)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>{mode === "zadruga" ? "Dodela (SOLO / RADNIK / TIM / MIXED)" : "Radnik"}</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {warning ? (
            <p className="rounded-xl bg-warning/20 p-3 text-sm font-medium text-accent-foreground">
              {warning}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button onClick={submit} className="w-full font-semibold sm:w-auto">
            {mode === "solo" ? "SAČUVAJ POSAO" : "DODELI POSAO"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
