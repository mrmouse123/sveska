import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate } from "@tanstack/react-router";
import { Loader2, Lock } from "lucide-react";
import { useAuth } from "@/lib/sveska/authContext";
import { useDemo } from "@/lib/sveska/store";
import { ROLE_LABEL, canAccess, type Role } from "@/lib/sveska/roles";
import { ensureOrg } from "@/lib/sveska/org";
import type { Mode } from "@/lib/sveska/types";

const Spinner = () => (
  <div className="flex min-h-screen items-center justify-center bg-secondary/40">
    <Loader2 className="size-6 animate-spin text-muted-foreground" />
  </div>
);

function OrgProblem({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 px-4">
      <div className="surface w-full max-w-sm p-7 text-center">
        <p className="font-display text-lg font-bold">Nije uspelo učitavanje naloga</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Proveri vezu pa pokušaj ponovo. Ako se ponavlja, javi nam.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          Pokušaj ponovo
        </button>
      </div>
    </div>
  );
}

function NoAccess({ role, mode }: { role: Role; mode: Mode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 px-4">
      <div className="surface w-full max-w-sm p-7 text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-secondary">
          <Lock className="size-5 text-muted-foreground" />
        </span>
        <h1 className="mt-5 font-display text-xl font-bold">{ROLE_LABEL[mode]} nije u tvom paketu</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tvoj nalog je na nivou <strong>{ROLE_LABEL[role]}</strong>. Za {ROLE_LABEL[mode]} je
          potreban viši paket.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/85"
        >
          NAZAD NA PAKETE
        </Link>
      </div>
    </div>
  );
}

/**
 * Vlasnički deo aplikacije: traži sesiju, nivo pretplate i organizaciju.
 * Nalog koji je radnik u nečijoj organizaciji nema šta da traži ovde — ide na svoj raspored.
 */
export function RequireAuth({ mode, children }: { mode?: Mode; children: ReactNode }) {
  const { ready, user, role, org, orgReady, refreshOrg } = useAuth();
  const { hydrated } = useDemo();
  // Jedan pokušaj po nalogu, pa vidljiva greška — ne petlja. Ranije je `creating`
  // bilo u zavisnostima efekta i greška se gutala: posle neuspeha `creating`
  // ode true -> false, efekat se ponovo okine, `org` je i dalje null, i
  // `ensure_org()` se zove opet, odmah, beskonačno. Na lošem signalu telefon
  // troši bateriju i podatke gledajući u spiner.
  const [attempt, setAttempt] = useState<"idle" | "running" | "done" | "failed">("idle");
  const userId = user?.id;
  useEffect(() => setAttempt("idle"), [userId]);

  useEffect(() => {
    if (!user || !orgReady || org || attempt !== "idle") return;
    setAttempt("running");
    void ensureOrg()
      .then(() => refreshOrg())
      .then(() => setAttempt("done"))
      .catch(() => setAttempt("failed"));
  }, [user, orgReady, org, attempt, refreshOrg]);

  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/auth" />;
  if (!orgReady) return <Spinner />;
  if (!org) {
    // „done" bez organizacije = ensure_org je prošao, a članstvo se nije učitalo.
    if (attempt === "failed" || attempt === "done") {
      return <OrgProblem onRetry={() => setAttempt("idle")} />;
    }
    return <Spinner />;
  }
  if (org.orgRole === "worker") return <Navigate to="/radnik" />;
  if (!hydrated || !role) return <Spinner />;
  if (mode && !canAccess(role, mode)) return <NoAccess role={role} mode={mode} />;
  return <>{children}</>;
}

/** Radnikov deo: samo članovi sa ulogom radnika. Vlasnik se vraća na svoje pakete. */
export function RequireWorker({ children }: { children: ReactNode }) {
  const { ready, user, org, orgReady } = useAuth();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/auth" />;
  if (!orgReady) return <Spinner />;
  if (!org || org.orgRole !== "worker") return <Navigate to="/" />;
  return <>{children}</>;
}
