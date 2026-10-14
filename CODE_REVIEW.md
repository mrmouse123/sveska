# SVESKA — Code Review (2026-09-07)

Metod: boris-cherny. Svaki nalaz je proveren izvršavanjem (tsc, eslint, build, SQL nad
pravom bazom, čitanje instaliranog paketa, reprodukcija), ne čitanjem koda „na oko“.

## Popravljeno u ovom pregledu

| # | Nalaz | Dokaz | Popravka |
|---|-------|-------|----------|
| P0 | `today()` vraća UTC dan. U Beogradu 00:00–02:00 (CEST) app misli da je juče: posao „danas“ ide na pogrešan datum, dashboard „Današnji poslovi“ prazan. | `TZ=Europe/Belgrade node -e '...'` → UTC `09-07`, lokalno `09-08` | `iso()` u `data.ts` koristi lokalne komponente datuma; 4 mesta (`data`, `queries.stats`, `store.createMixedTeam`, `CalendarScreen`) sada idu kroz taj helper. `toISOString` više ne postoji u `src/`. |
| P1 | Dva sync-a ka Supabase-u mogu da se preklope (upis traje >1.5 s → sledeći debounce pokreće paralelni). Upisi po tabelama bi se prepleli, poslednje stanje ne bi nužno pobedilo. | Test sa 3 brza poziva protiv prave baze | `syncStateToSupabase` serijalizuje: max jedan u letu, najnovije stanje čeka, međustanja se odbacuju. Test: 3 poziva → 1 promise, u bazi ostaje „THIRD“. |
| P1 | `npm run lint` ne radi — `eslint.config.js` nije bio ekstrahovan. | skripta postoji, fajl ne | Config napisan (bez prettier-plugina; format je posebna skripta). 0 grešaka, 5 kozmetičkih `react-refresh` upozorenja identičnih originalu. |
| P2 | `<link rel=icon href=/favicon.ico>` → 404 na svakoj strani. | curl 404 | `public/favicon.svg` + promenjen link. curl 200. |
| P2 | `workers.team_id` ima FK na `teams`, sync je upisivao radnike pre timova. | Prvi e2e test pao sa FK greškom | Redosled: teams → workers → customers → mixed_teams → jobs → members. |

## Provereno i u redu

- **Upsert semantika** (`@supabase/postgrest-js` u `node_modules`, v2.116): `onConflict` default = PK, `ignoreDuplicates=false` → merge. Naši redovi uvek šalju sve kolone, pa `defaultToNull=true` nije problem.
- **`getRouter` export** — TanStack Start konvencija ispoštovana, build ga nalazi.
- **`import.meta.env["VITE_*"]`** — bracket pristup zbog `noPropertyAccessFromIndexSignature`; radi i u SSR-u i na klijentu.
- **Edge funkcija** — `verify_jwt=true`, anon JWT prolazi; CORS `OPTIONS` 204 + `Access-Control-Allow-Origin: *`. Bez CORS-a browser bi blokirao svaki poziv (staro v1 nije imalo).
- **SSR** — sve rute 200 sa očekivanim tekstom u HTML-u.
- **tsc** = 0, **eslint** = 0 grešaka, **build** = 0 (klijent 177 kB gzip).

## Otvoreno — namerno nije dirano (zahteva odluku, ne popravku)

1. **RLS je otvoren.** SQL potvrđuje 6 polisa `ALL / true / true` za `public`. Svako sa anon ključem (a on je u JS bundle-u) može da čita i briše celu bazu. Ovo je Faza 2 (Supabase Auth + `user_id` kolona + per-user polise). **Ne puštati javni link pre toga.**
2. **Edge funkcija troši OpenAI kredit na svaki poziv sa anon ključem**, bez rate-limita. Isti razlog kao 1: dok nema auth-a, ključ može da se zloupotrebi. Nakon auth-a: `verify_jwt` + provera `auth.uid()` u funkciji.
3. **`resetDemo` ne briše iz Supabase-a.** Sync samo upsert-uje, pa poslovi koje je korisnik napravio ostaju u bazi posle reseta. Lokalno stanje je izvor istine pa app radi ispravno; baza vremenom nakuplja mrtve redove. Rešenje ide ruku pod ruku sa auth-om (brisanje samo svojih redova).
4. **Ceo state se upisuje na svaku promenu** (6 zahteva / 1.5 s). Za demo OK; za produkciju diff-based sync ili Supabase kao izvor istine.
5. **Klijentski bundle 605 kB** (jedan chunk). `React.lazy` za `ModeApp` bi prepolovio initial load. Kozmetika za sada.
6. **Hidracija posle ponoći:** server i klijent računaju `today()` svaki iz svog sata; ako se učitavanje desi tačno preko ponoći, React upozori na mismatch. Zanemarljivo.

## Šta bih uradio sledeće (redosled)

1. Supabase Auth (magic link ili email+lozinka) → `user_id` na svih 6 tabela → RLS `user_id = auth.uid()` → tada rešava 1, 2 i 3.
2. Deploy na Vercel tek posle toga.


# SVESKA — Code Review, drugi prolaz (2026-09-07)

Metod: boris-cherny. Fokus: glasovni sloj i sinhronizacija. Svaki nalaz je prvo reprodukovan
izvršavanjem pravog modula (esbuild bundle + node), pa popravljen, pa ponovo izmeren.

## Popravljeno

| # | Nalaz | Dokaz pre popravke | Popravka |
|---|-------|--------------------|----------|
| P1 | `parseTime("u sedamnaest")` → **07:00**, `"u osamnaest"` → 08:00. Investor kaže „u sedamnaest", posao padne u 7 ujutru. | probe: `parseTime` nad pravim modulom | Reči za sate se porede kao ceo token, najduži ključ prvi. Sada 17:00 / 18:00. |
| P1 | Isto pravilo je čitalo **"pedeset evra" kao 10:00** ("deset" kao podniz). | isti probe | Rešeno istom promenom — token ne počinje sa "deset". |
| P1 | `"devetnaest"` je padalo na `"devet"` → 09:00 (19 i 20 nisu postojali u mapi). | isti probe | Dodati `devetnaest`, `dvadeset`. |
| P1 | ZADRUGA demo komanda „napravi tim od **Petra**, Milana i Jovana" pravila je tim od **2 člana** — Petar ispada. | probe nad svih 10 demo komandi: `members: ["Milan","Jovan"]` | Stemovanje tolerantno na padež: `Petar → petar\|peta\|petr`, poređenje po početku tokena. Sada `["Petar","Milan","Jovan"]`. |
| P1 | TIM: „Daj Marku … **kod Nikole Jovanovića**" → `CREATE_JOB` bez radnika. Imena klijenata su gutala imena radnika (Nikola, Jovan). | probe: `{"a":"CREATE_JOB","w":undefined}` | Predlog **"kod"** označava klijenta — te reči se izuzimaju iz traženja radnika. Sada `ASSIGN_JOB, worker=Marko, customer=Nikola Jovanović`. |
| P1 | Glasovni panel ostaje zaglavljen na „SVESKA SLUŠA…" kad se sesija prekine (odbijen mikrofon, mreža, ili 10 s tišine bez ijedne reči) — `onFinish` se nikad ne pozove. | čitanje toka `finishVoiceInput` → `onError`, `phase` ostaje `listening` | `VoiceOverlay` se vraća na `idle` kad status postane `error`, gde stoji poruka i dugme POKUŠAJ PONOVO. |
| P2 | `syncStateToSupabase`: ako upis pukne, parkirano novije stanje se briše u `finally` i nikad ne stigne u bazu. | probe sa stub-ovanim `fetch` | Petlja isprazni red pa tek onda prijavi grešku. Test: D padne, **E svejedno bude upisano**, pozivalac i dalje dobije grešku. |
| P2 | `ensureCustomer` u petlji (`CREATE_ASSIGNMENTS` za više klijenata odjednom) pravi **dva klijenta za isto novo ime** — `state` je još stari snapshot. | čitanje: lookup ide kroz `state` iz closure-a | Ref-mapa upamti šta je upravo napravljeno; briše se čim novi klijenti uđu u state. |
| P3 | `hydrated` nikad ne postane `true` kad korisnik nije prijavljen. | čitanje: rani `return` preskače `setHydrated` | Postavlja se `true` — demo seed je sve što se učitava. |

## Verifikacija

- `tsc --noEmit` = 0, `eslint` = 0 grešaka (6 kozmetičkih `react-refresh` upozorenja, isto kao pre).
- `vite build` = 0.
- Probe nad svih **10 ugrađenih demo komandi** (SOLO 4, TIM 3, ZADRUGA 3) — sve daju očekivanu
  akciju; tri koje su bile pogrešne sada su tačne, ostalih sedam nisu regresirale.
- Probe sinhronizacije nad pravim modulom sa stub-ovanim `fetch`: 4/4 PASS
  (nema preklapanja, najnovije stanje pobeđuje, greška se prijavi, novije stanje prođe).
- SSR: `/`, `/auth`, `/solo`, `/tim`, `/zadruga` → 200 sa sadržajem; `/favicon.svg` → 200.
- Browser: početna se renderuje bez ijedne greške u konzoli; `/solo` bez sesije ispravno
  vodi na ekran za prijavu.

Probe skripte stoje u `tasks/probe/` — pokreću se nad pravim izvorom, nisu vezane za package.json.

## Otvoreno

1. **E2E u browseru nije urađen** za glasovni panel i za duplikate klijenata: sve rute iza
   `RequireAuth` traže nalog, a "Confirm email" je uključen pa se nalog ne može napraviti iz testa.
   Treba test nalog ili privremeno isključen "Confirm email".
2. Kad u rečenici **nema "kod"**, "Marko" je i radnik i ime klijenta — ostaje dvosmisleno.
   Namerno nije dirano; AI sloj (edge funkcija) to rešava kad je `OPENAI_API_KEY` postavljen.
3. Ranije otvorene stavke i dalje stoje: `resetDemo` ne briše redove iz baze, ceo state se
   upisuje na svaku promenu, klijentski bundle je jedan chunk.


# SVESKA — E2E u pravom browseru (2026-09-08)

Nalog: `claude-test@sveska.app` (napravljen preko Supabase dashboard-a, auto-confirm).
Jovan se prijavio sam — lozinka nije prošla kroz Claude. App: `vite dev` na 127.0.0.1:3000.

## Novi nalaz — našao ga E2E, probe ga je promašio

| # | Nalaz | Dokaz | Popravka |
|---|-------|-------|----------|
| P1 | „Sutra u sedamnaest idem **kod Ane Marković**…" → app upisuje kupca **Marko Petrović**. Token `markovic` počinje sa `marko`, pa kraće ime otima token dužem. | Snimak ekrana iz aplikacije: KUPAC „Marko Petrović" | Token pripada onome ko ga poklapa najspecifičnije (najduži stem). `markovic` nosi 8 za „Marković", 5 za „Marko". |
| P1 | Nastavak: „kod **Jovanović Company**" bira „Nikola Jovanović" — oba dele prezime, poklapanje je izjednačeno. | probe `tasks/probe/names.ts` | Na izjednačenom rezultatu pobeđuje onaj ko pokriva veći deo rečenice (Company pokriva dve reči). |

Pouka: probe nad 10 ugrađenih demo komandi nije dovoljan — sve one koriste imena koja se
ne sudaraju. Zato je dodat `tasks/probe/names.ts` sa sudarima imena i graničnim satima.

## Potvrđeno u pravoj aplikaciji

- **Vreme rečima**: „u sedamnaest" → TERMIN **Sutra · 17:00**. Pre popravke bi bilo 07:00.
- **Kupac**: „kod Ane Marković" → KUPAC **Ana Marković** (posle druge popravke).
- **Ceo krug do baze**: SAČUVAJ → toast „Posao je zakazan." → NENAPLAĆENO €680 → €770,
  PODSEĆANJA 4 → 5 → red u Supabase-u:
  `Montaža klime, 2026-09-09, 17:00, 90, ZAKAZANO, Ana Marković`.
- **Lokalni datum, ne UTC**: mašina je na GMT+4; u trenutku testa po UTC-u je bio 7. septembar,
  a „sutra" je ispravno leglo na **9. septembar po lokalnom vremenu**. To je tačno scenario
  zbog kog je `iso()` prešao na lokalne komponente datuma — sada dokazan uživo, ne rezonovanjem.
- **Seed novog naloga se sinhronizuje**: prazan nalog → 26 poslova, 5 klijenata, 6 radnika,
  2 tima, 1 mixed tim, 3 člana u Supabase-u.
- **Auth guard**: `/solo` bez sesije vodi na `/auth`; sa sesijom se renderuje.
- **Glasovni unos stvarno radi**: mikrofon hvata zvuk i transkribuje na srpskom u živo,
  OTKAŽI uredno gasi sesiju i vraća panel na početni ekran.

## I dalje neverifikovano E2E

2. **Duplikati klijenata** u `CREATE_ASSIGNMENTS`: da bi se reprodukovalo, AI mora da vrati
   dva zadatka za isto **novo** ime. Lokalni interpreter to ne proizvodi (dodeljuje samo
   postojeće klijente), pa scenario traži postavljen `OPENAI_API_KEY`.

## Dopuna — zaglavljivanje panela je potvrđeno (2026-09-08)

Uz Jovanovo odobrenje pokrenut je mikrofon u tihoj sobi. Posle 10 s bez ijedne reči panel je
izašao iz „SVESKA SLUŠA…" na početni ekran sa porukom „Nisam čula šta si rekao. Pokušaj ponovo."
i dugmetom POKUŠAJ PONOVO. Pre popravke `phase` je ostajao `listening` i ekran se nikad nije menjao.

Ostaje neverifikovano samo: **duplikati klijenata** u `CREATE_ASSIGNMENTS` — traži `OPENAI_API_KEY`,
jer lokalni interpreter ne proizvodi dva zadatka za isto novo ime.


# Faza 5 — Role po nalogu (2026-09-08)

`public.profiles(user_id, role)`, `role in (solo|tim|zadruga)`, RLS ima **samo** SELECT polisu
nad sopstvenim redom — korisnik vidi svoj nivo ali ga ne može podići. Trigger na `auth.users`
daje svakom novom nalogu `solo`. Hijerarhija: `zadruga ⊃ tim ⊃ solo`.

## Provereno uživo (nalog claude-test@sveska.app)

| Rola | Početna | /solo | /tim | /zadruga |
|------|---------|-------|------|----------|
| solo | TIM i ZADRUGA zaključani | radi | „nije u tvom paketu" | „nije u tvom paketu" |
| tim | ZADRUGA zaključana | radi | radi | „Tvoj nalog je na nivou TIM" |
| zadruga | sva tri otključana | radi | radi | radi (9 aktivnih poslova, €5.110) |

Blokada je proverena i **direktnim ukucavanjem URL-a**, ne samo klikom na karticu.

## Domet — iskreno

Ovo je kontrola *paketa*, ne zaštita podataka: svi redovi su ionako privatni po `user_id`,
pa viši mod ne otkriva ničije tuđe podatke. Rola stoji u bazi i korisnik je ne može promeniti,
ali sam guard je klijentski. Prava serverska provera postojala bi tek ako edge funkcija
`ai-process` odbije `mode` iznad nivoa naloga — nije urađeno jer traži novi deploy funkcije.

## Dopuna — podizanje role anon ključem je nemoguće (provereno)

`GET /rest/v1/profiles` sa anon ključem vraća `[]`, a `PATCH ?role=eq.solo` sa telom
`{"role":"zadruga"}` vraća `[]` i **ne menja nijedan red** — `updated_at` naloga test1/test2
je ostao nepromenjen. RLS ima samo SELECT polisu, pa upis nema kroz šta da prođe.

Test nalozi: `tim@sveska.app` → `tim`, `zadruga@sveska.app` → `zadruga`,
`claude-test@sveska.app` → `zadruga` (ostao posle testiranja hijerarhije).
Oba nova naloga je trigger napravio kao `solo` — dokaz da radi i na pravoj registraciji.


# Faza 6 — Uloge u organizaciji (2026-09-08)

Podaci više ne pripadaju nalogu nego **organizaciji**. `orgs`, `org_members` (uloga
`owner`/`worker` + `worker_id`), `org_invites`, i `org_id` na svih 6 tabela sa podacima.
Migracija je išla u dva koraka da aplikacija ne pukne usput: prvo šema i backfill uz
netaknute stare polise, pa klijent, pa tek onda prebacivanje RLS-a.

## Dokazano izvršavanjem, bez ijedne lozinke

Test je pokrenut u transakciji koja privremeno napravi radnika, izmeri pristup i vrati sve
nazad (`set local role authenticated` + `request.jwt.claims`, pa `raise` koji rollback-uje):

| Provera | Rezultat |
|---|---|
| Radnik vidi poslova | **2 od 27** u organizaciji — samo svoje |
| Radnik vidi klijente | 5 (treba mu za ime i adresu) |
| Radnik menja status | **prošlo**, 2 reda |
| Radnik menja cenu | **blokirano** okidačem |
| Radnik briše posao | **blokirano**, 0 redova |
| Radnik pravi klijenta | **blokirano** polisom |
| Vlasnik posle promene | i dalje vidi svih 27, 5 klijenata, 6 radnika, menja cene |

Zatim kroz pravu aplikaciju: vlasnik je napravio kod `3A3A244C` za radnika `w-marko`
dugmetom POZOVI RADNIKA, i upisao nov posao koji je legao u bazu **sa `org_id`** — dokaz
da vlasnikov sync prolazi pod novim polisama.

## Zamka koju je uhvatio test, ne pregled

Okidač „radnik menja samo status" je u prvoj verziji blokirao i **dozvoljenu** promenu
statusa. Razlog: `jobs.updated_at` se osvežava sam, pa ga je poređenje celog reda videlo
kao izmenu. Nađeno dijagnostičkom verzijom okidača koja ispisuje koje se kolone razlikuju.
Popravka izuzima `updated_at` iz poređenja.

## Granice

- RLS ne ograničava pojedinačnu kolonu — „samo status" čuva okidač u bazi, ne UI.
- Jedan nalog pripada **tačno jednoj** organizaciji (`unique (user_id)`). Radnik za dve
  firme traži izmenu tog ograničenja.
- Radnikov ekran čita direktno iz Supabase-a i ne koristi demo store; zato radnik ne
  seed-uje demo podatke i ne sinhronizuje ništa nazad.

## Dopuna — radnički tok je zatvoren, ali otvara jedan sukob

Radnik `radnik@sveska.app` je kodom ušao u organizaciju, dobio ekran sa 3 Markova posla
i promenio status kroz UI: `j-t1` je u bazi **U TOKU**, cena netaknuta (120).

Usput nađen još jedan bug koji je izašao tek na pravom nalogu: `fetchMembership` je radio
`maybeSingle()` nad `org_members`, a polisa pušta **sve** članove organizacije — vraćala su
se dva reda, upit je pucao, i radnik je završavao na početnoj. Rešeno RPC-om
`my_membership()` koji vraća tačno red prijavljenog naloga, nezavisno od oblika polise.

### Sukob koji treba rešiti pre nego što ovo vidi pravi korisnik

Vlasnikova aplikacija i dalje drži **localStorage kao izvor istine** i na svaku promenu
upisuje celo stanje u bazu. Radnik piše direktno u bazu. Prva sledeća promena kod vlasnika
vratiće radnikov status nazad na stari. Dok je baza bila privatna kopija jednog naloga to
nije smetalo; sa deljenom organizacijom smeta.

Redosled rešenja po ceni: (1) vlasnik pri otvaranju uvek učita iz baze umesto iz localStorage,
(2) sync po razlici umesto celog stanja, (3) baza kao jedini izvor istine i za vlasnika.

## Popravka sukoba izvora istine (opcija 1)

- Hidracija je okrenuta: **prvo Supabase, localStorage samo kao rezerva** (offline, nalog bez
  ijednog reda, ili nepodešen backend). Podsetnici su lokalni pa se zadržavaju sa uređaja.
- **Sync sme samo vlasnik.** Ovo nije kozmetika: konzola je pokazala da je radnikov klijent
  tri puta pokušao da upiše celo stanje i dobio
  `new row violates row-level security policy for table "teams"`. Posle zabrane — nijedan pokušaj.
  Bug je nastao baš zbog prelaska na hidraciju iz baze i uhvaćen je u istom prolazu.

Ostaje otvoreno: dva istovremeno otvorena vlasnička prozora i dalje mogu da se gaze, jer se
i dalje upisuje celo stanje. To rešava sync po razlici (opcija 2).


# Faza 7 — Upis po izmeni (2026-09-08)

Svaka izmena šalje **samo svoj red**. Celo stanje se upisuje još na dva mesta: seed novog
naloga i RESET. Lokalno stanje je od sada keš, ne paralelna verzija.

## Mereno u pravoj aplikaciji, ne procenjeno

| Radnja | Pre | Posle |
|---|---|---|
| Otvaranje ekrana | 6 čitanja + upis celog stanja | 6 čitanja, **0 upisa** |
| Nov posao | 6 upisa (teams, workers, customers, mixed_teams, jobs, members) | **1 upis** (`jobs`, 201) |
| Radnikov status posle vlasnikove izmene | pregažen | **`j-t1` ostao U TOKU** |

Poslednji red je bio ceo razlog za ovu fazu.

## Usput uklonjena zaobilaznica

`stateRef` drži najnovije stanje i unutar istog tick-a, pa `ensureCustomer` vidi klijenta
kog je upravo napravio. Time je mapa `pendingCustomers` iz Faze 3 postala nepotrebna —
zaobilaznica je zamenjena mehanizmom koji rešava uzrok.

## Šta i dalje stoji

- Podsećanja su samo lokalna (nema ih u bazi) — namerno.
- RESET je upsert-only: poslovi koje je korisnik dodao ostaju u bazi.
- Dva vlasnička prozora se i dalje mogu gaziti, ali sada samo na istom redu.
- Neprovereno: seed potpuno novog naloga — traži prvu prijavu naloga bez ijednog reda.
