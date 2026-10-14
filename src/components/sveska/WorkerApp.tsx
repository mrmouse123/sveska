import { useCallback, useEffect, useState } from "react";
import { LogOut, MapPin, Loader2, RefreshCw, CheckCircle2, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/sveska/authContext";
import { fetchMyJobs, setRemoteJobStatus, type WorkerJob } from "@/lib/sveska/workerService";
import { formatDateSr, today } from "@/lib/sveska/data";
import { eur } from "@/lib/sveska/queries";
import type { JobStatus } from "@/lib/sveska/types";

const STATUS_TONE: Record<string, string> = {
  DODELJENO: "bg-secondary text-foreground",
  "U TOKU": "bg-accent text-accent-foreground",
  ZAVRŠENO: "bg-primary/15 text-foreground",
  "ČEKA NAPLATU": "bg-secondary text-muted-foreground",
};

export function WorkerApp() {
  const { user, signOut } = useAuth();
  const [jobs, setJobs] = useState<WorkerJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setJobs(await fetchMyJobs());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Greška pri učitavanju.");
      setJobs([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const change = async (job: WorkerJob, status: JobStatus) => {
    setBusy(job.id);
    try {
      await setRemoteJobStatus(job.id, status);
      setJobs((list) => (list ?? []).map((j) => (j.id === job.id ? { ...j, status } : j)));
      toast.success(status === "ZAVRŠENO" ? "Posao je završen." : "Posao je započet.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Izmena nije prošla.");
    } finally {
      setBusy(null);
    }
  };

  const todays = (jobs ?? []).filter((j) => j.date === today());
  const rest = (jobs ?? []).filter((j) => j.date !== today());

  const card = (j: WorkerJob) => (
    <div key={j.id} className="surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-bold">{j.description}</p>
          <p className="text-sm text-muted-foreground">{j.customer}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-bold ${STATUS_TONE[j.status] ?? "bg-secondary"}`}
        >
          {j.status}
        </span>
      </div>
      <p className="mt-3 text-sm">
        <span className="font-semibold">{formatDateSr(j.date)}</span> · {j.time}
      </p>
      {j.location ? (
        <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 size-3.5 shrink-0" /> {j.location}
        </p>
      ) : null}
      <p className="mt-1 text-sm font-semibold">{eur(j.price)}</p>
      {j.status !== "ZAVRŠENO" ? (
        <div className="mt-4 flex gap-2">
          {j.status !== "U TOKU" ? (
            <Button
              size="sm"
              variant="outline"
              className="font-semibold"
              disabled={busy === j.id}
              onClick={() => void change(j, "U TOKU")}
            >
              <PlayCircle className="size-4" /> ZAPOČNI
            </Button>
          ) : null}
          <Button
            size="sm"
            className="font-semibold"
            disabled={busy === j.id}
            onClick={() => void change(j, "ZAVRŠENO")}
          >
            <CheckCircle2 className="size-4" /> ZAVRŠI
          </Button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="min-h-screen bg-secondary/40">
      <header className="flex items-center justify-between border-b border-border bg-card px-5 py-4">
        <div>
          <p className="font-display text-lg font-extrabold tracking-tight">SVESKA</p>
          <p className="text-xs text-muted-foreground">Moj raspored · {user?.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} className="font-semibold">
            <RefreshCw className="size-4" /> OSVEŽI
          </Button>
          <Button variant="outline" size="sm" onClick={() => void signOut()} className="font-semibold">
            <LogOut className="size-4" /> ODJAVA
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-5 py-8">
        {jobs === null ? (
          <div className="flex justify-center py-20">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{error}</p>
        ) : jobs.length === 0 ? (
          <p className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground">
            Trenutno nemaš dodeljenih poslova.
          </p>
        ) : (
          <>
            {todays.length ? (
              <>
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Danas
                </p>
                <div className="mt-3 grid gap-3">{todays.map(card)}</div>
              </>
            ) : null}
            {rest.length ? (
              <>
                <p className="mt-8 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Ostali poslovi
                </p>
                <div className="mt-3 grid gap-3">{rest.map(card)}</div>
              </>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
