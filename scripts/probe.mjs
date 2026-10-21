// Pokreće sve probe iz tasks/probe/ jednom komandom i štampa presudu po probi.
//
//   node scripts/probe.mjs            -> sve probe
//   node scripts/probe.mjs voice      -> samo one čije ime sadrži "voice"
//
// Svaka proba se bandluje esbuild-om i dobija stub konfiguracije koja LIČI na
// pravu (getSupabaseConfig proverava oblik adrese i ključa; bez toga probe koje
// zovu supabaseService tiho postaju no-op i lažno padaju). Probe koje stubuju
// fetch same odlučuju šta se sa tom konfiguracijom dešava.
//
// Zašto ovo postoji: jedna proba pogrešno pokrenuta izgleda kao regresija u kodu.
// Pre ove skripte svaka je imala svoje uputstvo u zaglavlju i dve su „pale" samo
// zato što je uputstvo zastarelo.
//
// Konfiguracija ide kroz --inject fajl, ne kroz --banner: banner nosi navodnike,
// a shell na Windows-u ih guta, pa bandl postane neispravan JS.
import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJlc2lnbmF0dXJlc2lnbmF0dXJl";
const ENV_FILE = ".probe/env.js";

/** Probe bez PROLAZI/pogresno presude — istraživački ispisi, ne testovi. */
const EXPLORATORY = new Set(["demo", "t", "names"]);

mkdirSync(".probe", { recursive: true });
writeFileSync(
  ENV_FILE,
  `globalThis.__ENV = { VITE_SUPABASE_URL: "https://stub.supabase.co", VITE_SUPABASE_ANON_KEY: "${JWT}" };\n`,
);

const filter = process.argv[2] ?? "";
const dir = join(process.cwd(), "tasks", "probe");
const names = readdirSync(dir)
  .filter((f) => f.endsWith(".ts") && f.replace(/\.ts$/, "").includes(filter))
  .map((f) => f.replace(/\.ts$/, ""));

let failed = 0;
for (const name of names) {
  const out = `.probe/${name}.mjs`;
  try {
    execSync(
      `npx esbuild tasks/probe/${name}.ts --bundle --format=esm --platform=node ` +
        `--outfile=${out} --define:import.meta.env=globalThis.__ENV --inject:${ENV_FILE} --log-level=error`,
      { stdio: "pipe" },
    );
  } catch (err) {
    failed++;
    console.log(`BUILD  ${name.padEnd(14)} ${String(err.stderr ?? err.message).trim().split("\n")[0]}`);
    continue;
  }
  let output = "";
  let code = 0;
  try {
    output = execSync(`node ${out}`, { stdio: "pipe", encoding: "utf8" });
  } catch (err) {
    output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    code = err.status ?? 1;
  }
  const last = output.trim().split("\n").pop() ?? "";
  if (EXPLORATORY.has(name)) {
    console.log(`INFO   ${name.padEnd(14)} ${last.slice(0, 80)}`);
    continue;
  }
  const ok = code === 0 && /PROLAZI|prolazi|PASS/.test(last) && !/pogresno|FAIL|LOSE/.test(last);
  if (!ok) failed++;
  console.log(`${ok ? "OK    " : "LOSE  "} ${name.padEnd(14)} ${last.slice(0, 80)}`);
}

console.log("");
console.log(failed === 0 ? `SVE PROLAZI (${names.length} proba)` : `${failed} probe pale`);
process.exitCode = failed === 0 ? 0 : 1;
