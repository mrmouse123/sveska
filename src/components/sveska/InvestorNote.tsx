import { useDemo } from "@/lib/sveska/store";
import { Lightbulb } from "lucide-react";

export function InvestorNote({ title, text }: { title: string; text: string }) {
  const { investorMode } = useDemo();
  if (!investorMode) return null;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-accent/40 bg-accent/10 p-4">
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-accent-foreground" />
      <p className="text-sm">
        <span className="font-bold uppercase tracking-wide">{title}</span>{" "}
        <span className="text-muted-foreground">— {text}</span>
      </p>
    </div>
  );
}
