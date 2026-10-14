import { createFileRoute } from "@tanstack/react-router";
import { ModeApp } from "@/components/sveska/ModeApp";
import { RequireAuth } from "@/components/sveska/RequireAuth";

export const Route = createFileRoute("/zadruga")({
  head: () => ({
    meta: [
      { title: "ZADRUGA demo — SVESKA" },
      { name: "description", content: "Više timova, SOLO radnici i mixed timovi — SVESKA organizuje celu zadrugu." },
      { property: "og:title", content: "ZADRUGA demo — SVESKA" },
      { property: "og:description", content: "Zadruga priča sa SVESKOM." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireAuth mode="zadruga">
      <ModeApp mode="zadruga" />
    </RequireAuth>
  ),
});
