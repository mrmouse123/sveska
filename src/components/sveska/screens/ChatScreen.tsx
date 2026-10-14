import { useState } from "react";
import { useDemo } from "@/lib/sveska/store";
import type { Mode } from "@/lib/sveska/types";
import { processVoiceCommand } from "@/lib/sveska/aiService";
import { executeAiResult } from "@/lib/sveska/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const SUGGESTIONS = [
  "Koji su poslovi danas?",
  "Ko je slobodan sutra?",
  "Ko mi duguje?",
  "Koliko smo zaradili?",
  "Koji tim ima najmanje posla?",
  "Koji poslovi nisu završeni?",
  "Koliko imamo aktivnih poslova?",
];

export function ChatScreen({ mode }: { mode: Mode }) {
  const demo = useDemo();
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string }[]>([
    { role: "ai", text: "Ćao Petre! Pitaj me bilo šta o svom poslu." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setBusy(true);
    const res = await processVoiceCommand(text, mode, demo.state);
    let reply = res.answer ?? "";
    if (res.suggestedAction !== "ANSWER" && res.suggestedAction !== "UNKNOWN") {
      reply = executeAiResult(res, mode, demo.state, demo);
      toast.success(reply);
    }
    setMessages((m) => [...m, { role: "ai", text: reply || "Razumela sam." }]);
    setBusy(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">SVESKA AI</h1>
        <p className="text-sm text-muted-foreground">Pitaj SVESKU o svom poslu.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => void send(s)}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
          >
            {s}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] whitespace-pre-line rounded-2xl p-4 text-sm ${
              m.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "surface"
            }`}
          >
            {m.text}
          </div>
        ))}
        {busy ? <p className="text-sm text-muted-foreground">SVESKA razmišlja…</p> : null}
      </div>
      <form
        className="sticky bottom-20 flex gap-2 md:bottom-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Pitaj SVESKU…" />
        <Button type="submit" disabled={busy}>
          Pošalji
        </Button>
      </form>
    </div>
  );
}
