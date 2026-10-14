import { createFileRoute } from "@tanstack/react-router";
import { WorkerApp } from "@/components/sveska/WorkerApp";
import { RequireWorker } from "@/components/sveska/RequireAuth";

export const Route = createFileRoute("/radnik")({
  head: () => ({
    meta: [
      { title: "Moj raspored — SVESKA" },
      { name: "description", content: "Poslovi dodeljeni tebi: termin, adresa i status." },
    ],
  }),
  component: () => (
    <RequireWorker>
      <WorkerApp />
    </RequireWorker>
  ),
});
