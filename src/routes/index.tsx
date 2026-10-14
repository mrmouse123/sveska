import { createFileRoute, Link } from "@tanstack/react-router";
import { Mic, User, Users2, Network, NotebookPen, Lock } from "lucide-react";
import { useAuth } from "@/lib/sveska/authContext";
import { ROLE_LABEL, canAccess } from "@/lib/sveska/roles";
import type { Mode } from "@/lib/sveska/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SVESKA — AI poslovni pomoćnik za majstore i timove" },
      {
        name: "description",
        content:
          "SVESKA je AI digitalna sveska koja sluša, razume i organizuje posao majstora, timova i zadruga. Glasovni demo na srpskom.",
      },
      { property: "og:title", content: "SVESKA — AI poslovni pomoćnik" },
      {
        property: "og:description",
        content: "Pričaš prirodno, SVESKA zakazuje posao, dodeljuje radnike i organizuje timove.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const CARDS = [
  { to: "/solo" as const, mode: "solo" as Mode, icon: User, title: "SOLO", sub: "Radiš sam.", desc: "Jedan nezavisan majstor.", cta: "POKRENI SOLO", price: "€29 / godišnje" },
  { to: "/tim" as const, mode: "tim" as Mode, icon: Users2, title: "TIM", sub: "Radiš sa ekipom.", desc: "Jedan vođa + više radnika.", cta: "POKRENI TIM", price: "€49 / godišnje" },
  { to: "/zadruga" as const, mode: "zadruga" as Mode, icon: Network, title: "ZADRUGA", sub: "Vodiš više timova i ljudi.", desc: "Više timova + SOLO radnici + mixed timovi.", cta: "POKRENI ZADRUGA", price: "€69 / godišnje" },
];

function Index() {
  const { ready, user, role, signOut } = useAuth();
  return (
    <div className="flex min-h-screen items-center bg-background">
      <div className="mx-auto w-full max-w-5xl px-5 py-16">
        <header className="text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent shadow-soft">
            <NotebookPen className="size-7 text-accent-foreground" />
          </div>
          <h1 className="mt-5 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
            SVESKA
          </h1>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            AI poslovni pomoćnik
          </p>
          <p className="mx-auto mt-5 max-w-md text-lg text-muted-foreground">
            SVESKA sluša, razume i organizuje vaš posao.
          </p>
          <div className="mt-7 inline-flex items-center gap-2.5 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-semibold shadow-soft">
            <Mic className="size-4 text-accent-foreground" />
            <span>PRIČAM → SVESKA RAZUME → PREDLAŽE → POTVRĐUJEM</span>
          </div>
        </header>

        <p className="mt-16 text-center text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground">
          Izaberi demo
        </p>

        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {CARDS.map((c) => {
            // Signed out we advertise everything; signed in we only offer what the account has.
            const locked = Boolean(user && role && !canAccess(role, c.mode));
            return (
            <div
              key={c.title}
              className={`surface flex flex-col p-7 transition-all ${locked ? "opacity-60" : "hover:-translate-y-1 hover:shadow-lift"}`}
            >
              <div className="flex size-11 items-center justify-center rounded-xl bg-accent-soft">
                <c.icon className="size-5 text-accent-foreground" />
              </div>
              <h2 className="mt-5 font-display text-2xl font-bold">{c.title}</h2>
              <p className="mt-1 font-medium">{c.sub}</p>
              <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
              {locked ? (
                <span className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-secondary px-5 py-3 text-sm font-bold text-muted-foreground">
                  <Lock className="size-4" /> NIJE U TVOM PAKETU
                </span>
              ) : (
                <Link
                  to={c.to}
                  className="mt-6 inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/85"
                >
                  {c.cta}
                </Link>
              )}
              <p className="mt-3 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Planirana cena · {c.price}
              </p>
            </div>
            );
          })}
        </div>

        <p className="mt-14 text-center text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          {!ready ? null : user ? (
            <span className="inline-flex items-center gap-3 rounded-full bg-secondary px-4 py-2">
              Prijavljen: <span className="normal-case tracking-normal">{user.email}</span>
              {role ? <span className="rounded-full bg-accent px-2 py-0.5">{ROLE_LABEL[role]}</span> : null}
              <button type="button" onClick={() => void signOut()} className="underline underline-offset-4">
                Odjava
              </button>
            </span>
          ) : (
            <Link to="/auth" className="rounded-full bg-secondary px-4 py-2 underline underline-offset-4">
              Prijavi se ili napravi nalog
            </Link>
          )}
        </p>
      </div>
    </div>
  );
}
