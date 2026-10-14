import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

/** Jedino mesto gde se zadaje podputanja.
 *  GitHub Pages servira repo na `/<ime-repoa>/`, pa odatle "/sveska/".
 *  Prelaz na Vercel (ili sopstveni domen) = ovde staviti "/" i ništa više:
 *  aplikacija putanju čita isključivo iz `import.meta.env.BASE_URL`,
 *  koji Vite izvodi iz ove vrednosti. */
const BASE = "/sveska/";

// Standard Vite config for SVESKA (no Lovable wrapper).
// Router entry resolves by convention to src/router.tsx (must export getRouter).
// spa: aplikacija nema ni jednu server rutu, server funkciju ni loader —
// svi podaci idu iz pregledača na Supabase, pa SSR iscrtava samo prazan okvir.
// Zato se gradi statični shell koji Pages ume da servira, bez Node servera.
export default defineConfig({
  base: BASE,
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({ spa: { enabled: true } }),
    nitro(),
    viteReact(),
  ],
  server: { port: 5173, host: true },
});
