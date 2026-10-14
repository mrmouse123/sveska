import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createInitialState, today } from "./data";
import {
  loadStateFromSupabase,
  saveCustomer,
  saveJob,
  saveMixedTeam,
  syncStateToSupabase,
} from "./supabaseService";
import { useAuth } from "./authContext";
import type {
  AppNotification,
  Customer,
  DemoState,
  Job,
  JobStatus,
  MixedTeam,
  Mode,
} from "./types";

const STORAGE_KEY = "sveska-state-v1"; // namespaced per user: `${STORAGE_KEY}:${uid}`

const newId = () => Math.random().toString(36).slice(2, 10);

/** Čista pretraga klijenta po imenu — radi nad prosleđenim stanjem, bez zavisnosti od React-a. */
function lookupCustomer(s: DemoState, name: string): string | undefined {
  const n = name.trim().toLowerCase();
  if (!n) return undefined;
  return (
    s.customers.find((c) => c.name.toLowerCase() === n)?.id ??
    s.customers.find(
      (c) => c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase().split(" ")[0]!),
    )?.id ??
    s.customers.find((c) =>
      n.split(" ").some((p) => p.length > 3 && c.name.toLowerCase().includes(p)),
    )?.id
  );
}

interface Ctx {
  state: DemoState;
  hydrated: boolean;
  investorMode: boolean;
  setInvestorMode: (v: boolean) => void;
  createJob: (input: Omit<Job, "id">) => Job;
  updateJob: (id: string, patch: Partial<Job>) => void;
  setJobStatus: (id: string, status: JobStatus) => void;
  setJobPaid: (id: string, paid: boolean) => void;
  createMixedTeam: (name: string, members: { workerId: string; responsibility: string }[]) => MixedTeam;
  addNotification: (n: Omit<AppNotification, "id" | "read">) => void;
  markNotificationRead: (id: string) => void;
  resetDemo: () => void;
  findCustomerByName: (name: string) => string | undefined;
  ensureCustomer: (name: string) => string;
}

const DemoContext = createContext<Ctx | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(() => createInitialState());
  const [hydrated, setHydrated] = useState(false);
  const [investorMode, setInvestorModeState] = useState(false);

  /** Uvek najnovije stanje, i unutar istog tick-a. Zato jedna komanda može da napravi
   *  klijenta pa odmah posao za njega, bez čekanja na sledeći render. */
  const stateRef = useRef(state);
  /** Nalog bez ijednog reda u bazi dobija demo podatke — upisuju se jednom, čim se zna org. */
  const needsSeedWrite = useRef(false);

  const { ready: authReady, user, org } = useAuth();
  const uid = user?.id ?? null;
  const orgId = org?.orgId ?? null;
  // Samo vlasnik piše. Radnik menja isključivo status svojih poslova, i to kroz
  // workerService — njegov upis celog stanja bi polise ionako odbile.
  const canSync = org?.orgRole === "owner";

  const storageKey = uid ? `${STORAGE_KEY}:${uid}` : null;

  const writeCtx = useRef({ uid, orgId, canSync });
  writeCtx.current = { uid, orgId, canSync };

  /** Upis jednog reda u pozadini. Lokalna izmena je već primenjena, pa greška ovde
   *  znači samo da baza zaostaje — vidi se pri sledećem učitavanju. */
  const persist = useCallback(
    (label: string, write: (uid: string, org: string) => Promise<void>) => {
      const ctx = writeCtx.current;
      if (!ctx.uid || !ctx.orgId || !ctx.canSync) return;
      void write(ctx.uid, ctx.orgId).catch((err: unknown) => {
        console.warn(`[sveska] ${label} nije upisan u bazu:`, err);
      });
    },
    [],
  );

  /** Jedina tačka kroz koju stanje sme da se menja: drži `stateRef` i React u koraku. */
  const mutate = useCallback((fn: (s: DemoState) => DemoState) => {
    const next = fn(stateRef.current);
    stateRef.current = next;
    setState(next);
    return next;
  }, []);

  // Hidracija: prvo Supabase, localStorage samo kao rezerva (offline / bez backenda).
  // Otkad organizaciju deli više ljudi, baza je izvor istine — radnik menja status
  // direktno u njoj, a lokalna kopija bi te izmene vratila na staro.
  useEffect(() => {
    if (!authReady) return;
    let alive = true;
    setHydrated(false);
    try {
      setInvestorModeState(localStorage.getItem("sveska-investor-mode") === "1");
    } catch {
      /* demo režim */
    }
    if (!storageKey) {
      const seed = createInitialState();
      stateRef.current = seed;
      setState(seed);
      setHydrated(true); // odjavljen: demo seed je sve što postoji
      return;
    }
    void (async () => {
      let local: DemoState | null = null;
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) local = JSON.parse(raw) as DemoState;
      } catch {
        /* demo režim */
      }

      let next: DemoState | null = null;
      try {
        const remote = await loadStateFromSupabase();
        // Podsetnici su lokalni i ne postoje u bazi, pa se zadržavaju sa uređaja.
        if (remote) next = { ...remote, notifications: local?.notifications ?? [] };
      } catch (err) {
        console.warn("[sveska] Supabase load failed:", err);
      }
      next ??= local;

      if (!alive) return;
      needsSeedWrite.current = next === null;
      const resolved = next ?? createInitialState();
      stateRef.current = resolved;
      setState(resolved);
      setHydrated(true);
    })();
    return () => {
      alive = false;
    };
  }, [authReady, storageKey]);

  // Lokalna kopija za offline i za brzo otvaranje; više nije izvor istine.
  useEffect(() => {
    if (!hydrated || !storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      /* demo režim */
    }
  }, [state, hydrated, storageKey]);

  // Seed novog naloga: jedini preostali upis celog stanja osim RESET-a.
  useEffect(() => {
    if (!needsSeedWrite.current || !hydrated || !uid || !orgId || !canSync) return;
    needsSeedWrite.current = false;
    void syncStateToSupabase(uid, orgId, stateRef.current).catch((err: unknown) => {
      console.warn("[sveska] Seed nije upisan u bazu:", err);
    });
  }, [hydrated, uid, orgId, canSync]);

  const setInvestorMode = useCallback((v: boolean) => {
    setInvestorModeState(v);
    try {
      localStorage.setItem("sveska-investor-mode", v ? "1" : "0");
    } catch {
      /* demo režim */
    }
  }, []);

  const findCustomerByName = useCallback((name: string) => lookupCustomer(state, name), [state]);

  const ensureCustomer = useCallback(
    (name: string) => {
      // Namerno čita stateRef, ne `state`: jedna glasovna komanda može da traži istog
      // novog klijenta dva puta u istom tick-u i ne sme da napravi dva reda.
      const existing = lookupCustomer(stateRef.current, name);
      if (existing) return existing;
      const customer: Customer = {
        id: `c-${newId()}`,
        name: name.trim() || "Novi klijent",
        phone: "",
        email: "",
        address: "",
        notes: "Dodat glasovnom komandom.",
      };
      mutate((s) => ({ ...s, customers: [...s.customers, customer] }));
      persist("klijent", (u, o) => saveCustomer(u, o, customer));
      return customer.id;
    },
    [mutate, persist],
  );

  const createJob = useCallback(
    (input: Omit<Job, "id">) => {
      const job: Job = { ...input, id: `j-${newId()}` };
      mutate((s) => ({ ...s, jobs: [...s.jobs, job] }));
      persist("posao", (u, o) => saveJob(u, o, job));
      return job;
    },
    [mutate, persist],
  );

  /** Zajednička putanja za sve izmene posla: primeni lokalno, pa upiši taj jedan red. */
  const patchJob = useCallback(
    (id: string, patch: Partial<Job>) => {
      let updated: Job | undefined;
      mutate((s) => ({
        ...s,
        jobs: s.jobs.map((j) => {
          if (j.id !== id) return j;
          updated = { ...j, ...patch };
          return updated;
        }),
      }));
      if (updated) {
        const job = updated;
        persist("posao", (u, o) => saveJob(u, o, job));
      }
    },
    [mutate, persist],
  );

  const updateJob = useCallback((id: string, patch: Partial<Job>) => patchJob(id, patch), [patchJob]);
  const setJobStatus = useCallback((id: string, status: JobStatus) => patchJob(id, { status }), [patchJob]);
  const setJobPaid = useCallback((id: string, paid: boolean) => patchJob(id, { paid }), [patchJob]);

  const createMixedTeam = useCallback(
    (name: string, members: { workerId: string; responsibility: string }[]) => {
      const team: MixedTeam = {
        id: `mt-${newId()}`,
        name: name.toUpperCase(),
        project: name,
        members,
        createdAt: today(),
      };
      mutate((s) => ({ ...s, mixedTeams: [...s.mixedTeams, team] }));
      persist("mixed tim", (u, o) => saveMixedTeam(u, o, team));
      return team;
    },
    [mutate, persist],
  );

  // Podsećanja postoje samo na uređaju — nema ih u bazi, pa se ni ne upisuju.
  const addNotification = useCallback(
    (n: Omit<AppNotification, "id" | "read">) => {
      mutate((s) => ({
        ...s,
        notifications: [{ ...n, id: `n-${newId()}`, read: false }, ...s.notifications],
      }));
    },
    [mutate],
  );

  const markNotificationRead = useCallback(
    (id: string) => {
      mutate((s) => ({
        ...s,
        notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
      }));
    },
    [mutate],
  );

  const resetDemo = useCallback(() => {
    const seed = mutate(() => createInitialState());
    // Upsert-only: poslovi koje je korisnik dodao ostaju u bazi dok se ne obrišu ručno.
    persist("reset", (u, o) => syncStateToSupabase(u, o, seed));
  }, [mutate, persist]);

  const value = useMemo<Ctx>(
    () => ({
      state,
      hydrated,
      investorMode,
      setInvestorMode,
      createJob,
      updateJob,
      setJobStatus,
      setJobPaid,
      createMixedTeam,
      addNotification,
      markNotificationRead,
      resetDemo,
      findCustomerByName,
      ensureCustomer,
    }),
    [
      state,
      hydrated,
      investorMode,
      setInvestorMode,
      createJob,
      updateJob,
      setJobStatus,
      setJobPaid,
      createMixedTeam,
      addNotification,
      markNotificationRead,
      resetDemo,
      findCustomerByName,
      ensureCustomer,
    ],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo mora biti unutar DemoProvider");
  return ctx;
}

export const MODE_LABEL: Record<Mode, string> = {
  solo: "SOLO",
  tim: "TIM",
  zadruga: "ZADRUGA",
};
