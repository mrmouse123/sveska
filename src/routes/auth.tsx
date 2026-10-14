import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, signUp } from "@/lib/sveska/auth";
import { useAuth } from "@/lib/sveska/authContext";
import { redeemInvite } from "@/lib/sveska/org";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Prijava — SVESKA" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, refreshOrg } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    const res = mode === "login" ? await signIn(email, password) : await signUp(email, password);
    if (!res.ok) {
      setBusy(false);
      return setError(res.message);
    }
    if (res.needsEmailConfirm) {
      setBusy(false);
      setInfo(
        code
          ? "Nalog je napravljen. Potvrdi email, pa se prijavi sa istim kodom."
          : "Nalog je napravljen. Potvrdi email preko linka koji smo poslali, pa se prijavi.",
      );
      setMode("login");
      return;
    }
    // Kod se unovčava odmah po prijavi, pre nego što bilo koji ekran napravi
    // vlasničku organizaciju ovom nalogu.
    if (code.trim()) {
      const joined = await redeemInvite(code.trim());
      setBusy(false);
      if (!joined.ok) return setError(joined.message);
      await refreshOrg();
      void navigate({ to: "/radnik" });
      return;
    }
    setBusy(false);
    void navigate({ to: "/" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 px-4">
      <div className="surface w-full max-w-sm p-7">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent">
            <NotebookPen className="size-4 text-accent-foreground" />
          </span>
          <span className="font-display text-lg font-extrabold tracking-tight">SVESKA</span>
        </Link>
        <h1 className="mt-5 font-display text-xl font-bold">
          {mode === "login" ? "Prijava" : "Novi nalog"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {user
            ? `Već si prijavljen kao ${user.email}.`
            : mode === "login"
              ? "Tvoji poslovi, klijenti i naplate — na svakom uređaju."
              : "Besplatno za vreme testiranja."}
        </p>

        <form className="mt-5 grid gap-3" onSubmit={(e) => void submit(e)}>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              className="mt-1"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="password">Lozinka</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={6}
              className="mt-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="code">Kod pozivnice (ako te je pozvao poslodavac)</Label>
            <Input
              id="code"
              autoComplete="off"
              placeholder="npr. 4F2A9C1B"
              className="mt-1 uppercase"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          {error ? <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
          {info ? <p className="rounded-xl bg-accent-soft p-3 text-sm">{info}</p> : null}
          <Button type="submit" disabled={busy} className="mt-1 w-full font-semibold">
            {busy ? "…" : mode === "login" ? "PRIJAVI SE" : "NAPRAVI NALOG"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
            setInfo(null);
          }}
          className="mt-5 w-full text-center text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          {mode === "login" ? "Nemaš nalog? Registruj se" : "Imaš nalog? Prijavi se"}
        </button>
      </div>
    </div>
  );
}
