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
  patchJobRemote,
  saveCustomer,
  saveJob,
  saveMixedTeam,
  saveTeam,
  saveWorker,
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
  Team,
  Worker,
} from "./types";

const STORAGE_KEY = "sveska-state-v1"; // namespaced per user: `${STORAGE_KEY}:${uid}`

const newId = () => Math.random().toString(36).slice(2, 10);

/** Bez dijakritike i malim slovima — "Petrovic" i "Petrović" su isti upit. */
const foldName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim();

const partsOf = (s: string) => foldName(s).split(/[^a-z0-9]+/).filter((p) => p.length >= 3);

/**
 * Čista pretraga klijenta po imenu — radi nad prosleđenim stanjem, bez zavisnosti od React-a.
 *
 * Stara verzija je poredila SAMO ime (`n.includes(c.name.split(" ")[0])`), pa je
 * 7 od 9 običnih srpskih imena pogrešno slepljivala: "Marko Nikolić",
 * "Marko Jovanović", "Nikola Marković" i "Milan Marković" su svi završavali kao
 * "Marko Petrović", a "Jovan Jovanović" kao firma "Jovanović Company".
 * Istovremeno "Petrovic" bez dijakritike NIJE nalazio Petrovića.
 *
 * Sada: svaki izgovoreni deo mora da se nađe u kandidatu, i to RAZLIČITIM
 * delovima njegovog imena — zato "Jovan Jovanović" ne poklapa "Jovanović
 * Company". Ako ništa ne odgovara, poziva se stvaranje novog klijenta.
 */
function lookupCustomer(s: DemoState, name: string): string | undefined {
  const n = foldName(name);
  if (!n) return undefined;

  const exact = s.customers.find((c) => foldName(c.name) === n);
  if (exact) return exact.id;

  const want = partsOf(name);
  if (!want.length) return undefined;

  return s.customers.find((c) => {
    const have = partsOf(c.name);
    const used = new Set<number>();
    return want.every((w) => {
      const i = have.findIndex((p, idx) => !used.has(idx) && (p.startsWith(w) || w.startsWith(p)));
      if (i < 0) return false;
      used.add(i);
      return true;
    });
  })?.id;
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
  addTeamMember: (teamId: string, workerId: string) => void;
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
      // „Baza je prazna" i „čitanje je palo" MORAJU da se razlikuju. Oba su
      // ranije davala `next === null`, pa je jedan neuspeo upit na novom uređaju
      // (prazan localStorage) pokretao seed koji upisuje demo podatke preko
      // pravih — ID-jevi su fiksni (`j-s1`, `c-marko`…), pa su se cene, statusi
      // i telefoni vraćali na demo vrednosti. Tiho, uz jedan console.warn.
      let remoteFailed = false;
      try {
        const remote = await loadStateFromSupabase();
        // Podsetnici su lokalni i ne postoje u bazi, pa se zadržavaju sa uređaja.
        if (remote) next = { ...remote, notifications: local?.notifications ?? [] };
      } catch (err) {
        remoteFailed = true;
        console.warn("[sveska] Supabase load failed:", err);
      }
      next ??= local;

      if (!alive) return;
      // Seed samo kad pouzdano znamo da nalog nema nijedan red.
      needsSeedWrite.current = next === null && !remoteFailed;
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

  /** Zajednička putanja za sve izmene posla: primeni lokalno, pa upiši SAMO izmenu. */
  const patchJob = useCallback(
    (id: string, patch: Partial<Job>) => {
      let found = false;
      mutate((s) => ({
        ...s,
        jobs: s.jobs.map((j) => {
          if (j.id !== id) return j;
          found = true;
          return { ...j, ...patch };
        }),
      }));
      // Upisuje se `patch`, ne spojeni red. Vlasnikov snimak stanja ume da bude
      // star satima jer se baza čita samo pri učitavanju strane, pa bi ceo red
      // vratio radnikov status na staro.
      if (found) persist("posao", (u) => patchJobRemote(u, id, patch));
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

  /** Radnik ulazi u tim: i tim dobija člana i radnik dobija tim. */
  const addTeamMember = useCallback(
    (teamId: string, workerId: string) => {
      let team: Team | undefined;
      let worker: Worker | undefined;
      mutate((s) => ({
        ...s,
        teams: s.teams.map((t) => {
          if (t.id !== teamId || t.memberIds.includes(workerId)) return t;
          team = { ...t, memberIds: [...t.memberIds, workerId] };
          return team;
        }),
        workers: s.workers.map((w) => {
          if (w.id !== workerId) return w;
          worker = { ...w, teamId };
          return worker;
        }),
      }));
      if (team) {
        const t = team;
        persist("tim", (u, o) => saveTeam(u, o, t));
      }
      if (worker) {
        const w = worker;
        persist("radnik", (u, o) => saveWorker(u, o, w));
      }
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
      addTeamMember,
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
      addTeamMember,
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
