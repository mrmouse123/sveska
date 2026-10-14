import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Home,
  Briefcase,
  Users,
  CalendarDays,
  Wallet,
  Sparkles,
  Users2,
  Network,
  Layers,
  Bell,
  Search,
  RotateCcw,
  NotebookPen,
  LogOut,
} from "lucide-react";
import { useDemo, MODE_LABEL } from "@/lib/sveska/store";
import { useAuth } from "@/lib/sveska/authContext";
import type { Mode } from "@/lib/sveska/types";
import { searchAll } from "@/lib/sveska/queries";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { VoiceOverlay } from "./VoiceOverlay";
import { DashboardScreen, JobsScreen, CustomersScreen, CalendarScreen, PaymentsScreen } from "./screens/CoreScreens";
import { ChatScreen } from "./screens/ChatScreen";
import { TeamScreen, OrganizationScreen, MixedTeamsScreen } from "./screens/OrgScreens";
import { toast } from "sonner";

type Section =
  | "home"
  | "jobs"
  | "team"
  | "org"
  | "mixed"
  | "customers"
  | "calendar"
  | "payments"
  | "ai";

const NAV: Record<Mode, { id: Section; label: string; icon: typeof Home }[]> = {
  solo: [
    { id: "home", label: "Početna", icon: Home },
    { id: "jobs", label: "Poslovi", icon: Briefcase },
    { id: "customers", label: "Klijenti", icon: Users },
    { id: "calendar", label: "Kalendar", icon: CalendarDays },
    { id: "payments", label: "Naplate", icon: Wallet },
    { id: "ai", label: "SVESKA AI", icon: Sparkles },
  ],
  tim: [
    { id: "home", label: "Početna", icon: Home },
    { id: "jobs", label: "Poslovi", icon: Briefcase },
    { id: "team", label: "Tim", icon: Users2 },
    { id: "customers", label: "Klijenti", icon: Users },
    { id: "calendar", label: "Kalendar", icon: CalendarDays },
    { id: "payments", label: "Naplate", icon: Wallet },
    { id: "ai", label: "SVESKA AI", icon: Sparkles },
  ],
  zadruga: [
    { id: "home", label: "Početna", icon: Home },
    { id: "org", label: "Zadruga", icon: Network },
    { id: "mixed", label: "Mixed teams", icon: Layers },
    { id: "jobs", label: "Poslovi", icon: Briefcase },
    { id: "customers", label: "Klijenti", icon: Users },
    { id: "calendar", label: "Kalendar", icon: CalendarDays },
    { id: "payments", label: "Naplate", icon: Wallet },
    { id: "ai", label: "SVESKA AI", icon: Sparkles },
  ],
};

export function ModeApp({ mode }: { mode: Mode }) {
  const { state, resetDemo, investorMode, setInvestorMode, markNotificationRead } = useDemo();
  const { user, signOut } = useAuth();
  const [section, setSection] = useState<Section>("home");
  const [query, setQuery] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const nav = NAV[mode];
  const results = searchAll(state, query);
  const unread = state.notifications.filter((n) => !n.read).length;

  return (
    <div className="min-h-screen bg-secondary/40 pb-28 md:pb-0">
      <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-accent">
              <NotebookPen className="size-4 text-accent-foreground" />
            </span>
            <span className="font-display text-lg font-extrabold tracking-tight">SVESKA</span>
          </Link>
          <span className="rounded-lg bg-accent px-2.5 py-1 text-[10px] font-bold tracking-widest text-accent-foreground">
            {MODE_LABEL[mode].toUpperCase()}
          </span>
          {mode === "zadruga" ? (
            <span className="rounded-lg bg-secondary px-2.5 py-1 text-[10px] font-bold tracking-widest text-muted-foreground">
              ADMIN
            </span>
          ) : null}

          <div className="relative ml-auto hidden w-64 md:block">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pretraga…"
              className="pl-9"
            />
            {query ? (
              <div className="absolute mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-border bg-popover p-2 shadow-lift">
                {[
                  ...results.customers.map((c) => ({ k: `c${c.id}`, t: `👤 ${c.name}`, s: "customers" as Section })),
                  ...results.jobs.slice(0, 6).map((j) => ({ k: `j${j.id}`, t: `🧰 ${j.description}`, s: "jobs" as Section })),
                  ...results.workers.map((w) => ({ k: `w${w.id}`, t: `🛠 ${w.name}`, s: (mode === "zadruga" ? "org" : "team") as Section })),
                  ...results.teams.map((t) => ({ k: t.id, t: `👥 ${t.name}`, s: "org" as Section })),
                  ...results.mixedTeams.map((t) => ({ k: t.id, t: `🧩 ${t.name}`, s: "mixed" as Section })),
                ].map((r) => (
                  <button
                    key={r.k}
                    type="button"
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary"
                    onClick={() => {
                      setSection(nav.some((n) => n.id === r.s) ? r.s : "jobs");
                      setQuery("");
                    }}
                  >
                    {r.t}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="size-5" />
                {unread ? (
                  <span className="absolute right-1 top-1 size-2 rounded-full bg-voice" />
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Obaveštenja
              </p>
              <div className="space-y-1">
                {state.notifications.slice(0, 8).map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      markNotificationRead(n.id);
                      setSection(
                        n.target?.type === "customer"
                          ? "customers"
                          : n.target?.type === "worker"
                            ? mode === "zadruga"
                              ? "org"
                              : "team"
                            : "jobs",
                      );
                    }}
                    className={cn(
                      "block w-full rounded-lg p-2 text-left text-sm hover:bg-secondary",
                      n.read && "opacity-50",
                    )}
                  >
                    {n.icon} {n.text}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <div className="hidden items-center gap-2 sm:flex">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Investor mode
            </span>
            <Switch checked={investorMode} onCheckedChange={setInvestorMode} />
          </div>

          <Button variant="ghost" size="sm" onClick={() => setResetOpen(true)} className="font-semibold">
            <RotateCcw className="size-4" /> RESET
          </Button>
          <Button variant="outline" size="sm" asChild className="font-semibold">
            <Link to="/">← PROMENI DEMO</Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            title={user?.email ?? ""}
            onClick={() => void signOut()}
            className="font-semibold"
          >
            <LogOut className="size-4" /> ODJAVA
          </Button>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 lg:gap-8 lg:py-8">
        <aside className="hidden w-56 shrink-0 md:block">
          <nav className="surface sticky top-24 space-y-1 p-2">
            {nav.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setSection(n.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
                  section === n.id
                    ? "bg-accent font-semibold text-accent-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <n.icon className="size-4" />
                {n.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          {section === "home" ? (
            <DashboardScreen mode={mode} onNavigate={(s) => setSection(s as Section)} />
          ) : null}
          {section === "jobs" ? <JobsScreen mode={mode} /> : null}
          {section === "customers" ? <CustomersScreen mode={mode} /> : null}
          {section === "calendar" ? <CalendarScreen mode={mode} /> : null}
          {section === "payments" ? <PaymentsScreen mode={mode} /> : null}
          {section === "ai" ? <ChatScreen mode={mode} /> : null}
          {section === "team" ? <TeamScreen mode={mode} /> : null}
          {section === "org" ? <OrganizationScreen onOpenMixed={() => setSection("mixed")} /> : null}
          {section === "mixed" ? <MixedTeamsScreen /> : null}
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-30 flex overflow-x-auto border-t border-border bg-card/95 backdrop-blur md:hidden">
        {nav.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => setSection(n.id)}
            className={cn(
              "flex min-w-[68px] flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors",
              section === n.id ? "text-accent-foreground" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-xl",
                section === n.id ? "bg-accent" : n.id === "ai" ? "bg-accent-soft" : "",
              )}
            >
              <n.icon className="size-4.5" />
            </span>
            {n.label}
          </button>
        ))}
      </nav>

      <VoiceOverlay mode={mode} />

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Reset demo</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Da li želiš da vratiš demo na početno stanje?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>
              OTKAŽI
            </Button>
            <Button
              onClick={() => {
                resetDemo();
                setResetOpen(false);
                setSection("home");
                toast.success("Demo je vraćen na početno stanje.");
              }}
            >
              DA, RESETUJ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
