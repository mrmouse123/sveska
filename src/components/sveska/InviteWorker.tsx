import { useState } from "react";
import { UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/sveska/authContext";
import { createInvite } from "@/lib/sveska/org";

/**
 * Vlasnik pravi kod kojim se konkretan radnik veže za svoj nalog.
 * Kod se unosi na ekranu za prijavu i važi jednom.
 */
export function InviteWorker({ workerId, workerName }: { workerId: string; workerName: string }) {
  const { org } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (org?.orgRole !== "owner") return null;

  const make = async () => {
    setBusy(true);
    try {
      setCode(await createInvite(workerId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kod nije napravljen.");
    } finally {
      setBusy(false);
    }
  };

  if (code) {
    return (
      <div className="rounded-xl bg-accent-soft p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Kod za {workerName}
        </p>
        <p className="mt-1 font-display text-2xl font-extrabold tracking-[0.2em]">{code}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Radnik pravi nalog na /auth i unese ovaj kod. Važi jednom.
        </p>
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" className="font-semibold" disabled={busy} onClick={() => void make()}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />} POZOVI
      RADNIKA
    </Button>
  );
}
