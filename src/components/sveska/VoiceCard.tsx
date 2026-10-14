import { Mic } from "lucide-react";

export const VOICE_OPEN_EVENT = "sveska:voice-open";

export function openVoicePanel() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(VOICE_OPEN_EVENT));
  }
}

function Waves({ side }: { side: "left" | "right" }) {
  return (
    <div
      className={`hidden items-end gap-1 sm:flex ${side === "left" ? "justify-end" : "justify-start"}`}
      aria-hidden
    >
      {Array.from({ length: 12 }).map((_, i) => (
        <span
          key={i}
          className="w-1 rounded-full bg-border"
          style={{ height: `${8 + ((i * 13) % 30)}px` }}
        />
      ))}
    </div>
  );
}

export function VoiceCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <section className="surface px-5 py-8 text-center sm:px-8">
      <h2 className="font-display text-lg font-bold sm:text-xl">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>

      <div className="mt-6 grid grid-cols-1 items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
        <Waves side="left" />
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={openVoicePanel}
            aria-label="Reci SVESCI"
            className="voice-ring relative flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-voice transition-transform hover:scale-105 active:scale-95"
          >
            <Mic className="size-8" />
          </button>
          <button
            type="button"
            onClick={openVoicePanel}
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-foreground"
          >
            <Mic className="size-3.5" /> Reci svesci
          </button>
        </div>
        <Waves side="right" />
      </div>
    </section>
  );
}
