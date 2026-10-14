import { createFileRoute } from "@tanstack/react-router";
import { ModeApp } from "@/components/sveska/ModeApp";
import { RequireAuth } from "@/components/sveska/RequireAuth";

export const Route = createFileRoute("/solo")({
  head: () => ({
    meta: [
      { title: "SOLO demo — SVESKA" },
      { name: "description", content: "Jedan majstor priča sa SVESKOM: poslovi, klijenti, kalendar i naplate." },
      { property: "og:title", content: "SOLO demo — SVESKA" },
      { property: "og:description", content: "Jedan majstor priča sa SVESKOM." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireAuth mode="solo">
      <ModeApp mode="solo" />
    </RequireAuth>
  ),
});
