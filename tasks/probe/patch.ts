/**
 * Dokaz za nalaz B: izmena posla sme da pošalje SAMO izmenjene kolone.
 * Pokreće pravi `patchJobRemote` iz src/ sa stub-ovanim `fetch` i gleda
 * metod i telo zahteva — ne čita kod, nego mera šta bi stvarno otišlo u bazu.
 *
 *   npx esbuild tasks/probe/patch.ts --bundle --format=esm --platform=node \
 *     --outfile=.probe/patch.mjs \
 *     --define:import.meta.env=globalThis.__ENV \
 *     --banner:js='globalThis.__ENV={VITE_SUPABASE_URL:"https://stub.supabase.co",VITE_SUPABASE_ANON_KEY:"eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJlc2lnbmF0dXJlc2lnbmF0dXJl"};' \
 *   (getSupabaseConfig proverava oblik adrese i ključa — stub mora da liči na prave)
 *     && node .probe/patch.mjs
 */
import { patchJobRemote } from "../../src/lib/sveska/supabaseService";

type Seen = { method: string; body: Record<string, unknown>; query: string };
let seen: Seen | null = null;
let rowsBack = true;

globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const href = String(url);
  seen = {
    method: init?.method ?? "GET",
    body: typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {},
    query: href.split("?")[1] ?? "",
  };
  // Supabase vraca izmenjene redove jer `patchJobRemote` trazi `.select("id")`.
  // Prazan niz znaci da upis nije pogodio nijedan red i mora da bude greska.
  const body = rowsBack ? '[{"id":"j-s1"}]' : "[]";
  return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

const UID = "11111111-1111-1111-1111-111111111111";
let bad = 0;

function check(label: string, cond: boolean, detail = "") {
  if (!cond) bad++;
  console.log(`${cond ? "OK  " : "LOSE"}  ${label}${cond ? "" : `   ${detail}`}`);
}

// 1. Vlasnik označava naplatu. Status NE SME da se pojavi u telu zahteva —
//    to je tačno ono što je vraćalo radnikovo ZAVRŠENO na DODELJENO.
seen = null;
await patchJobRemote(UID, "j-s1", { paid: true });
{
  const s = seen as Seen | null;
  check("naplata: zahtev je poslat", s !== null);
  check("naplata: metod je PATCH, ne upsert", s?.method === "PATCH", `metod=${s?.method}`);
  check("naplata: telo ima samo paid", JSON.stringify(s?.body) === '{"paid":true}', JSON.stringify(s?.body));
  check("naplata: status NIJE u telu", !("status" in (s?.body ?? {})), JSON.stringify(s?.body));
  check("naplata: ciljan jedan red", (s?.query ?? "").includes("user_id=eq.") && (s?.query ?? "").includes("id=eq.j-s1"), s?.query ?? "");
}

// 2. Promena statusa šalje status i ništa više.
seen = null;
await patchJobRemote(UID, "j-s1", { status: "ZAVRŠENO" });
{
  const s = seen as Seen | null;
  check("status: telo ima samo status", JSON.stringify(s?.body) === '{"status":"ZAVRŠENO"}', JSON.stringify(s?.body));
}

// 3. Više polja odjednom — mapiranje camelCase -> kolona.
seen = null;
await patchJobRemote(UID, "j-s1", { assigneeType: "worker", assigneeId: "w-marko" });
{
  const s = seen as Seen | null;
  const b = s?.body ?? {};
  check("mapiranje: assignee_type", b["assignee_type"] === "worker", JSON.stringify(b));
  check("mapiranje: assignee_id", b["assignee_id"] === "w-marko", JSON.stringify(b));
  check("mapiranje: nema camelCase ključeva", !("assigneeType" in b) && !("assigneeId" in b), JSON.stringify(b));
}

// 4. Upis koji ne pogodi nijedan red MORA da pukne — PostgREST u tom slučaju
//    vraća 200 i prazan niz, bez greške, pa bi korisnik viđao uspeh zauvek.
rowsBack = false;
seen = null;
let threw = false;
try {
  await patchJobRemote(UID, "j-ne-postoji", { paid: true });
} catch {
  threw = true;
}
check("nepostojeci posao: baca grešku", threw, "prošlo tiho");
rowsBack = true;

// 5. Prazan patch ne sme da pošalje ništa.
seen = null;
await patchJobRemote(UID, "j-s1", {});
check("prazan patch: nema zahteva", seen === null, JSON.stringify(seen));

console.log("");
console.log(bad === 0 ? "SVE PROLAZI" : `${bad} pogresno`);
if (bad > 0) process.exitCode = 1;
