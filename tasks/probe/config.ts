/**
 * C3: pokvaren ključ mora da bude odbijen OVDE, a ne da sruši `fetch`.
 * C1: „baza je prazna" i „čitanje je palo" moraju da se razlikuju — jedno vodi
 *     u seed, drugo ne sme, jer seed upisuje demo preko pravih podataka.
 *
 *   npx esbuild tasks/probe/config.ts --bundle --format=esm --platform=node \
 *     --outfile=.probe/config.mjs --define:import.meta.env=globalThis.__ENV \
 *     --banner:js='globalThis.__ENV={};' && node .probe/config.mjs
 */
import { getSupabase, loadStateFromSupabase } from "../../src/lib/sveska/supabaseService";

declare const globalThis: { __ENV: Record<string, string> } & typeof global;

const GOOD_URL = "https://nieypuvbxvhapfvjbhoc.supabase.co";
const GOOD_KEY = `eyJ${"a".repeat(30)}.eyJ${"b".repeat(30)}.${"c".repeat(40)}`;

let bad = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) bad++;
  console.log(`${cond ? "OK  " : "LOSE"}  ${label}${cond ? "" : `   ${detail}`}`);
}

// getSupabase kešira klijenta, pa se svaki slučaj mora meriti u svom procesu.
// Umesto toga merimo samo prvu odluku — koja je i jedina koja odlučuje.
const mode = process.argv[2] ?? "all";

if (mode === "all") {
  // Pokrecemo svaki slucaj kao zaseban node proces da kes ne laze.
  const { execFileSync } = await import("node:child_process");
  const cases = ["bad-key-multiline", "bad-key-prefix", "bad-url", "good", "empty-vs-error"];
  let failed = 0;
  for (const c of cases) {
    try {
      const out = execFileSync(process.execPath, [process.argv[1]!, c], { encoding: "utf8" });
      process.stdout.write(out);
      if (out.includes("LOSE")) failed++;
    } catch (e) {
      console.log(`LOSE  ${c} je pukao`, e);
      failed++;
    }
  }
  console.log("");
  console.log(failed === 0 ? "SVE PROLAZI" : `${failed} pogresno`);
  if (failed > 0) process.exitCode = 1;
} else {
  if (mode === "bad-key-multiline") {
    // Tačno ono što se desilo u produkciji: ceo blok umesto ključa.
    globalThis.__ENV = {
      VITE_SUPABASE_URL: GOOD_URL,
      VITE_SUPABASE_ANON_KEY: `${GOOD_URL}\nVITE_SUPABASE_ANON_KEY=${GOOD_KEY}`,
    };
    check("ključ sa URL-om i prelomom reda je odbijen", getSupabase() === null);
  } else if (mode === "bad-key-prefix") {
    globalThis.__ENV = { VITE_SUPABASE_URL: GOOD_URL, VITE_SUPABASE_ANON_KEY: "nije-jwt" };
    check("ključ koji nije JWT je odbijen", getSupabase() === null);
  } else if (mode === "bad-url") {
    globalThis.__ENV = { VITE_SUPABASE_URL: "http://localhost:3000", VITE_SUPABASE_ANON_KEY: GOOD_KEY };
    check("adresa koja nije Supabase je odbijena", getSupabase() === null);
  } else if (mode === "good") {
    globalThis.__ENV = { VITE_SUPABASE_URL: `${GOOD_URL}/`, VITE_SUPABASE_ANON_KEY: GOOD_KEY };
    check("ispravna podešavanja prolaze (i kosa crta na kraju)", getSupabase() !== null);
  } else if (mode === "empty-vs-error") {
    globalThis.__ENV = { VITE_SUPABASE_URL: GOOD_URL, VITE_SUPABASE_ANON_KEY: GOOD_KEY };
    let status = 200;
    let body = "[]";
    globalThis.fetch = (async () =>
      new Response(body, { status, headers: { "Content-Type": "application/json" } })) as typeof fetch;

    const empty = await loadStateFromSupabase();
    check("prazna baza vraća null (vodi u seed)", empty === null, JSON.stringify(empty));

    status = 500;
    body = '{"message":"boom"}';
    let threw = false;
    try {
      await loadStateFromSupabase();
    } catch {
      threw = true;
    }
    check("neuspelo čitanje BACA, ne vraća null (ne sme u seed)", threw);
  }
}
