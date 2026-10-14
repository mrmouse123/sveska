import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSession, onAuthChange, signOut } from "./auth";
import { fetchRole, type Role } from "./roles";
import { fetchMembership, type Membership } from "./org";

interface AuthCtx {
  /** false until the initial session lookup finishes (client-side only). */
  ready: boolean;
  /** Subscription level of the signed-in account; null while loading or signed out. */
  role: Role | null;
  /** Organizacija i uloga u njoj; null dok se učitava ili ako nalog još nije član. */
  org: Membership | null;
  /** false dok traje prvo čitanje članstva — razlikuje „još ne znam" od „nije član". */
  orgReady: boolean;
  refreshOrg: () => Promise<void>;
  user: User | null;
  session: Session | null;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [org, setOrg] = useState<Membership | null>(null);
  const [orgReady, setOrgReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void getSession().then((s) => {
      if (!alive) return;
      setSession(s);
      setReady(true);
    });
    const off = onAuthChange((s) => {
      if (alive) setSession(s);
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!userId) {
      setRole(null);
      return;
    }
    let alive = true;
    setRole(null);
    void fetchRole().then((r) => {
      if (alive) setRole(r);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const refreshOrg = useCallback(async () => {
    setOrg(await fetchMembership());
  }, []);

  // Namerno se NE zove ensure_org ovde: nalog koji tek unosi kod pozivnice ne sme
  // usput da dobije sopstvenu organizaciju. Vlasničku organizaciju pravi RequireAuth.
  useEffect(() => {
    if (!userId) {
      setOrg(null);
      setOrgReady(false);
      return;
    }
    let alive = true;
    setOrgReady(false);
    void fetchMembership().then((m) => {
      if (!alive) return;
      setOrg(m);
      setOrgReady(true);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const value = useMemo<AuthCtx>(
    () => ({ ready, role, org, orgReady, refreshOrg, session, user: session?.user ?? null, signOut }),
    [ready, role, org, orgReady, refreshOrg, session],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth mora biti unutar AuthProvider");
  return ctx;
}
