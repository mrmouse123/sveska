import { createFileRoute } from "@tanstack/react-router";
import { ModeApp } from "@/components/sveska/ModeApp";
import { RequireAuth } from "@/components/sveska/RequireAuth";

export const Route = createFileRoute("/tim")({
  head: () => ({
    meta: [
      { title: "TIM demo — SVESKA" },
      { name: "description", content: "Vođa tima dodeljuje poslove radnicima glasom: raspored, dostupnost, naplate." },
      { property: "og:title", content: "TIM demo — SVESKA" },
      { property: "og:description", content: "Vođa tima priča sa SVESKOM." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireAuth mode="tim">
      <ModeApp mode="tim" />
    </RequireAuth>
  ),
});
