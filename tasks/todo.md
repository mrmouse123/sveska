# Sveska — rebuild lokalnog projekta (2026-09-07)
- [x] Scaffold + package.json (bez @lovable.dev wrappera, + supabase-js, − next-themes)
- [x] Ekstrakcija iz Lovable (config, lib, hooks, komponente, rute)
- [x] shadcn/ui komponente (samo 9 koje app uvozi, preko CLI)
- [x] Popravke: vite config, getRouter, ErrorComponentProps tip, Lovable error-reporting uklonjen
- [x] supabaseService po stvarnoj šemi (snake_case), store sync 1.5 s
- [x] Edge funkcija v2 sa CORS (browser je zove direktno) — deployovana
- [x] tsc --noEmit = 0, vite build = 0, SSR sve 4 rute 200 sa sadržajem
- [x] End-to-end sync test protiv prave baze (insert → readback → delete)
- [x] zip + README

## Review
- Novo otkriveno testom, ne pregledom: `workers.team_id` je FK na `teams` → timovi moraju pre radnika u sync-u. Bez stvarnog upisa u bazu ovo bi prošlo tsc i build i palo tek u browseru.
- OrgScreens.tsx u Lovable-u koristi `Zap`/`Wrench` bez importa — dodat import (bug u izvoru, ne u ekstrakciji).
- `/api/ai` ruta izbačena; AI ide browser → edge funkcija. Jednostavnije i radi i na statičkom hostu.
- Otvoreno: OPENAI_API_KEY nije postavljen (edge vraća `no_api_key`) → app koristi lokalni interpreter dok Jovan ne uradi `supabase secrets set`.
- Rizik: RLS otvoren. Ne puštati javni link pre auth-a.

# Review (2026-09-07, boris-cherny)
- [x] Lint: eslint config nedostaje (skripta postoji) → ekstrahovati/napraviti, pokrenuti
- [x] RLS: proveriti stvarne polise SQL-om
- [x] supabase-js: proveriti upsert onConflict default u instaliranom paketu
- [x] Store sync: konkurentni sync-ovi mogu da se preklope → serijalizovati
- [x] Datumi: toISOString() daje UTC dan → posle ponoći po Beogradu pogrešan "danas"
- [x] favicon link → 404
- [x] tsc + build + lint zeleno, zip

# Faza 2 — Auth + per-user RLS (2026-09-07)
- [x] Migracija: user_id, PK (user_id,id), FK kompozitni, RLS user_id = auth.uid(), stari dev redovi obrisani
- [x] supabaseService: rows sa user_id, upsert onConflict user_id,id, loadStateFromSupabase
- [x] auth.ts + AuthProvider (session, signIn/signUp/signOut)
- [x] store: ključ po korisniku, remote load kad je lokalno prazno
- [x] /auth ruta, guard na SOLO/TIM/ZADRUGA, logout u headeru
- [x] aiService šalje user access token; edge funkcija odbija anon
- [x] tsc/lint/build + e2e sa pravim test nalogom

## Review Faze 2
- Sve tvrdnje potvrđene e2e testom sa dva prava naloga: anon vidi 0 redova, B vidi 0 redova od A, roundtrip 27 poslova + 3 člana mixed tima, re-sync idempotentan, edge 401 za anon / 200 za korisnika.
- Iznenađenje: Supabase odbija test emailove na `example.com` i nepoznatim domenima, a ugrađeni SMTP ima limit od par mailova/sat → automatska registracija nije moguća; test nalozi napravljeni direktno u `auth.users` (potvrđeni).
- Iznenađenje 2: modul-level `uid()` u store.tsx se sudario sa novim `uid` iz sesije → preimenovan u `newId()`.
- Otvoreno: "Confirm email" je uključen — Jovan odlučuje (isključi za test, ili SMTP za produkciju). RESET i dalje ne briše iz baze (upsert-only) — sada bezopasno jer su redovi po korisniku, ali vredi dodati brisanje.

# Faza 3 — Pregled glasovnog sloja (2026-09-07, boris-cherny)
Baseline: tsc 0, eslint 0 grešaka / 6 kozmetičkih upozorenja (isto kao ranije).

## Nalazi potvrđeni izvršavanjem
- [x] P1 `parseTime`: "u sedamnaest" → 07:00, "u osamnaest" → 08:00 (WORD_HOURS podniz kolizija)
- [x] P1 ZADRUGA demo komanda gubi Petra iz mixed tima ("Petra" ne sadrži stem "peta")
- [x] P1 TIM: kad ime klijenta sadrži imena radnika ("kod Nikole Jovanovića") → CREATE_JOB umesto ASSIGN_JOB
- [x] P1 VoiceOverlay ostaje zaglavljen na "SVESKA SLUŠA..." kad glas padne ili nema govora
- [x] P2 `syncStateToSupabase` odbacuje parkirano stanje ako upis pukne (finally briše queued)
- [x] P2 `ensureCustomer` u petlji (CREATE_ASSIGNMENTS) pravi duplikate za isto novo ime
- [x] P3 `hydrated` nikad ne postane true kad korisnik nije prijavljen

## Verifikacija
- [x] Probe skripta nad pravim izvorom (esbuild bundle + node) za svih 10 demo komandi
- [x] tsc + eslint + build zeleno

## Review Faze 3
- Sve nalaze sam prvo reprodukovao izvršavanjem nad pravim izvorom (esbuild bundle + node),
  pa popravio, pa ponovo pokrenuo isti test. Nijedna popravka nije "trebalo bi da radi".
- Iznenađenje 1: `parseTime` je čitao i "pedeset evra" kao 10:00 ("deset" kao podniz).
  Ista popravka (poređenje celih reči) rešila je i to, iako to nisam tražio.
- Iznenađenje 2: WORD_HOURS nije imao 19 i 20, pa je "devetnaest" padao na "devet" → 09:00.
  Dodata su dva ključa jer bi inače sortiranje po dužini i dalje davalo pogrešno vreme.
- Iznenađenje 3: prva verzija popravke sync-a je parkirala neuspelo stanje, ali ga niko
  nije pokretao — čista komplikacija bez efekta. Zamenjeno jednostavnijim: petlja nastavi
  na novije stanje, greška se prijavi na kraju. Test to i dokazuje.
- Odbačeno namerno: nisam dirao dvosmislenost "Marko" (radnik) vs "Marko Petrović" (klijent)
  kad u rečenici nema "kod" — bez tog predloga ni čovek ne zna na koga se misli.
- Otvoreno: VoiceOverlay i ensureCustomer popravke nisu prošle E2E u browseru jer sve
  rute iza `RequireAuth` traže nalog. Treba test nalog (ili isključen "Confirm email").

# Faza 4 — E2E u browseru (2026-09-08)
- [x] Test nalog (dashboard, auto-confirm); Jovan se prijavio sam
- [x] Vreme rečima „u sedamnaest" → 17:00 u aplikaciji
- [x] NOVI BUG: „kod Ane Marković" → upisivao Marka Petrovića; popravljeno (najduži stem)
- [x] NOVI BUG: „kod Jovanović Company" → Nikola Jovanović; popravljeno (pokrivenost rečenice)
- [x] `tasks/probe/names.ts` — 11 tvrdnji, sve prolaze; demo komande bez regresije
- [x] Ceo krug do Supabase-a potvrđen redom u bazi
- [x] Lokalni datum potvrđen na mašini u GMT+4 (UTC bi dao pogrešan dan)
- [x] Zaglavljivanje panela na grešci — potvrđeno uživo: posle 10 s tišine panel izlazi
      iz "SVESKA SLUŠA…" na početni ekran sa porukom i dugmetom POKUŠAJ PONOVO
- [ ] Duplikati klijenata — traži OPENAI_API_KEY

## Review Faze 4
- Najvažnija pouka: probe koji koristi samo ugrađene demo komande daje lažnu sigurnost.
  Sve te komande imaju imena koja se ne sudaraju, pa je cela klasa grešaka prošla ispod radara.
  Bug je izašao u prvom pravom kucanju u aplikaciji.
- Prva popravka (najduži stem) rešila je Anu ali otvorila „Jovanović Company"; druga
  (pokrivenost rečenice kao tie-break) rešava oba bez regresije na demo komandama.
- Nenamerno: klik na mikrofon je pokrenuo pravo prepoznavanje i uhvatio zvuk iz prostorije.
  Prekinuto odmah i prijavljeno korisniku. Dalji testovi mikrofona samo uz odobrenje.

# Faza 5 — Role po nalogu (nivo pretplate) — 2026-09-08
Odluke: rola = nivo pretplate; hijerarhijski (zadruga ⊃ tim ⊃ solo); dodeljuje vlasnik,
čuva se u bazi, korisnik je ne može menjati. Uloge unutar organizacije = Faza 6.

- [x] Migracija `profiles` (user_id, role, check solo|tim|zadruga), RLS samo SELECT nad svojim redom
- [x] Trigger na auth.users → nov nalog dobija `solo`; backfill za postojeće naloge
- [x] `roles.ts`: RANK, canAccess, allowedModes, fetchRole (fallback na najniži nivo)
- [x] authContext nosi rolu uz sesiju
- [x] RequireAuth prima `mode`; ko nema nivo dobija ekran „nije u tvom paketu"
- [x] Početna zaključava pakete iznad nivoa + badge sa nivoom uz email
- [x] E2E: solo → TIM/ZADRUGA zaključani i URL-om; tim → TIM i SOLO rade, ZADRUGA ne; zadruga → sve
- [x] Nalozi `tim@sveska.app` (tim) i `zadruga@sveska.app` (zadruga) — trigger im je
      automatski upisao `solo`, pa su podignuti; time je trigger dokazan i na pravoj registraciji
- [x] Anon ključem provereno: SELECT nad `profiles` vraća prazno, PATCH ne menja nijedan red

## Review Faze 5
- Rola je namerno bez INSERT/UPDATE polise: korisnik je čita, menja je samo service role.
  `fetchRole` na grešci vraća `solo`, pa kvar zaključava aplikaciju umesto da je otvori.
- Iskreno o dometu: podaci su ionako privatni po `user_id`, pa ovo ne štiti tuđe podatke —
  štiti *paket*. Jedina prava serverska provera bila bi u edge funkciji (odbiti `mode`
  iznad nivoa); nije rađeno jer traži deploy funkcije.

# Faza 6 — Uloge u organizaciji (2026-09-08)
Odluke: radnik vidi svoje poslove i menja im status; vidi cenu; ulazi kodom pozivnice.

- [x] Korak A: `orgs`, `org_members` (unique po nalogu), `org_invites`, `org_id` na 6 tabela
- [x] Backfill: svaki postojeći nalog postaje vlasnik svoje organizacije, 0 redova bez org_id
- [x] RPC: `ensure_org`, `create_invite`, `redeem_invite` + `my_org_id/role/worker_id`
- [x] Klijent: `org.ts`, članstvo u authContext, `org_id` u sync-u, guard za radnika
- [x] `/radnik` ekran — čita direktno iz baze, ne kroz demo store
- [x] Vlasnik: dugme POZOVI RADNIKA na kartici radnika; kod se unosi na /auth
- [x] Korak B: RLS po organizaciji + okidač „radnik menja samo status"
- [x] Dokazano transakcijom (bez lozinki): radnik vidi 2/27 poslova, menja status,
      cena/brisanje/nov klijent blokirani; vlasnik i dalje vidi svih 27 i menja cene
- [x] Vlasnikov upis kroz aplikaciju prolazi pod novim polisama (nov posao ima org_id)
- [x] Pravi radnički nalog `radnik@sveska.app` unosi kod, dobija /radnik sa 3 Markova
      posla i menja status kroz UI — potvrđeno u bazi (j-t1 → U TOKU, cena netaknuta)
- [x] BUG nađen E2E-om: `fetchMembership` je koristio `maybeSingle()` nad `org_members`,
      a polisa pušta sve članove organizacije → dva reda → radnik je izbacivan na početnu.
      Rešeno RPC-om `my_membership()` koji vraća tačno red prijavljenog naloga.
- [x] Vlasnikov sync više ne prepisuje radnikove izmene: hidracija ide BAZA → localStorage
      (rezerva za offline), a sync je dozvoljen samo vlasniku
- [x] Vlasnik posle prijave vidi U TOKU — potvrđeno u aplikaciji

## Review Faze 6
- Okidač je prvo blokirao i dozvoljenu promenu statusa: `jobs.updated_at` se osvežava sam,
  pa ga je poređenje videlo kao izmenu. Nađeno dijagnostikom koja ispisuje koje se kolone
  razlikuju, ne nagađanjem. Sada se `updated_at` izuzima.
- Migracija je namerno u dva koraka: posle koraka A aplikacija radi isto kao pre (stare
  polise netaknute), pa je klijent ažuriran, pa je tek onda pristup prebačen. Da nešto pukne,
  vraćanje starih polisa je jedini potez.
- RLS ne ume da ograniči pojedinačnu kolonu, pa „samo status" čuva okidač u bazi —
  ne UI. Provereno pokušajem promene cene direktno kroz SQL kao radnik.
- Pretpostavka koju vredi znati: jedan nalog pripada tačno jednoj organizaciji
  (`unique (user_id)` na `org_members`). Ako neko treba da radi za dve firme, to se menja.

## Otvoreno posle Faze 6 — sukob dva izvora istine
Vlasnikova aplikacija drži localStorage kao izvor istine i na svaku promenu upisuje
**celo** stanje u bazu. Radnik menja status direktno u bazi. Znači: kad vlasnik sledeći
put bilo šta promeni, njegovo staro lokalno stanje vrati posao iz U TOKU nazad u DODELJENO.
To ranije nije bio problem jer je baza bila samo kopija jednog korisnika.
Rešenja, po rastućoj ceni: (1) vlasnik pri otvaranju uvek učita iz baze, (2) sync po
razlici umesto celog stanja, (3) baza kao jedini izvor istine i za vlasnika.

# Faza 7 — Upis po izmeni (2026-09-08)
- [x] `saveJob`, `saveCustomer`, `saveMixedTeam` — pojedinačni upisi u supabaseService
- [x] store prepisan: `stateRef` + `mutate`, svaka izmena piše svoj red
- [x] Celo stanje se upisuje još samo na seed novog naloga i na RESET
- [x] Uklonjen `pendingCustomers` hak — `stateRef` rešava isti problem ispravno
- [x] Mereno u browseru: učitavanje = 6 čitanja i 0 upisa; nov posao = 1 upis (201)
- [x] Radnikov status preživeo vlasnikov upis (j-t1 ostao U TOKU)
- [ ] Neprovereno: seed novog naloga (traži prvu prijavu naloga bez ijednog reda)

## Review Faze 7
- Debounce od 1.5 s više ne postoji: upis ide odmah, jer je red mali.
- `stateRef` je usput uklonio zaobilaznicu iz Faze 3: `ensureCustomer` sada vidi klijenta
  kog je napravio pre pola milisekunde, pa mapa `pendingCustomers` nema svrhu.
- Ostaje: podsećanja su i dalje samo lokalna, a RESET je upsert-only (stari redovi ostaju).
- Dva vlasnička prozora se i dalje mogu gaziti, ali sada samo na istom redu, ne na celom stanju.

# Faza 8 — AI sloj prebačen sa OpenAI na Claude (2026-09-08)
- [x] `ai-process` prepisana na Anthropic SDK (`npm:@anthropic-ai/sdk`), model `claude-opus-5`
- [x] Strict tool use umesto `response_format` + skidanja markdown ograda:
      Claude vraća argumente garantovano validne po šemi, nema parsiranja teksta
- [x] `output_config: { effort: "low" }` — kratka ekstrakcija, kraći odgovor, manja potrošnja
- [x] Obrada `stop_reason: "refusal"` (vraća ok:false, app pada na lokalni interpreter)
- [x] Klijentski timeout 12 s → 20 s
- [x] Deploy v4; anon i dalje dobija 401, CORS 204, modul se učitava bez greške
- [ ] `ANTHROPIC_API_KEY` u Supabase secrets (Jovan) — bez toga funkcija vraća `no_api_key`
- [ ] Test AI puta kroz aplikaciju + duplikati klijenata u multi-dodeli

## Review Faze 8
- Ime tajne se promenilo: `OPENAI_API_KEY` → `ANTHROPIC_API_KEY`.
- Strict tool use je uklonio celu klasu grešaka koju je stari kod imao: nije više moguće
  da model vrati tekst koji nije JSON, niti da JSON ne odgovara očekivanim poljima.
- Sistem-prompt sada eksplicitno objašnjava padeže i pravilo „kod = klijent" — isto pravilo
  koje lokalni interpreter primenjuje mehanički.
- Latencija: Claude sa razmišljanjem je sporiji od starog modela, zato effort `low`
  i duži timeout. Ako u demou zasmeta, zamena je jedan red (model → `claude-haiku-4-5`).

## Plan testa kad stigne ANTHROPIC_API_KEY
1. Postavi tajnu u Supabase → Edge Functions → Secrets (ime: `ANTHROPIC_API_KEY`).
2. Jedna glasovna/tekstualna komanda kroz app, pa proveri `source === "ai"` u rezultatu.
   Kartica se pojavljuje i kad AI padne — app tiho pređe na lokalni interpreter, pa
   sama kartica ništa ne dokazuje.
3. Ako je pao: `query_logs` za `ai-process` (funkcija već loguje `console.error`).
   Tek na osnovu stvarne greške odlučiti dalje. (2026-10-21: `claude-api`
   dokumentacija kaže da `claude-opus-5` PRIHVATA forsirani `tool_choice`; odbijaju
   ga tek Opus 5.5 / Fable 5.1 / Sonnet 5.5. Taj rizik je zatvoren bez izmene koda.)
   Ključ postoji (konzola: „SVESKA AI Test", ističe 2026-11-20) — Jovan ga sam
   unosi u Secrets; ja ključeve ne unosim.
4. Zatim testirati duplikate klijenata u multi-dodeli (reproducibilno samo kroz AI).

REZULTAT 2026-10-21 (ključ unet, pozivi iz Chrome sesije miske1431@, kroz gateway):
- Hladan start: 21,7 s → app bi taj PRVI poziv ispustio (timeout 20 s) i pao na
  lokalni interpreter. Zagrejani pozivi: 3,6–4,0 s. Ne menjati timeout bez
  odluke — duže čekanje na hladan start je takođe trošak za korisnika.
- „pošalji Marka kod Petrovića sutra u deset, cena sto evra" → ASSIGN_JOB,
  worker Marko Jović, confidence 0.93; klijent/vreme/cenu popunjava lokalni
  deo (merge). „ko mi je dužan" → ANSWER. „otkaži posao kod Petrovića" →
  intent CANCEL_JOB, klijent prepoznat; bez poslova u kontekstu daje UNKNOWN.
- Forsirani `tool_choice` na `claude-opus-5` radi — potvrđeno pozivom, ne papirom.
- Zamka pri testu: Chrome localStorage na istom origin-u drži i sesiju tuđeg
  projekta (`sb-xqggoxrihitvqaocowlb-auth-token`); njen token gateway odbija sa
  UNAUTHORIZED_ASYMMETRIC_JWT. Uvek čitati ključ `sb-nieypuvbxvhapfvjbhoc-…`.

# Faza 9 — SVESKA na GitHub Pages (2026-10-14)

Cilj: živ sajt na `https://mrmouse123.github.io/sveska/`, isti obrazac kao `gradnjaos`.
Vercel ostaje kao kasnija opcija — SPA build mu ne smeta, samo `BASE` ide na "/".

## Zašto je SPA konverzija izvodljiva (provereno pre počinjanja)
- `src/routes/api/` je prazan — nema server ruta.
- Nema `createServerFn`, `createMiddleware`, `loader` ni `beforeLoad`.
- Auth je samo `signInWithPassword` / `signUp` — nema `redirectTo`, pa Supabase
  Auth → URL Configuration NIJE blokada za login (bitno samo za mejl potvrde).
- Svi podaci idu iz pregledača na Supabase. SSR iscrtava samo prazan okvir.
→ Nema server logike koju bi statični hosting izgubio.

## Rizik koji ostaje: Pages servira na podputanji `/sveska/`
Sve apsolutne putanje pretpostavljaju root. Nađeno i za ispravku:
- [x] `src/routes/__root.tsx:63` — `<a href="/">` u ErrorComponent-u
- [x] `src/routes/__root.tsx` — `{ rel: "icon", href: "/favicon.svg" }`
- [x] `vite.config.ts` — `base`, i `tanstackStart({ spa: { enabled: true } })`
      (opcija postoji u instaliranoj verziji: `spa: { enabled, maskPath, prerender }`)
- [x] `src/router.tsx` — `basepath`
- [x] `BASE` kao jedna konstanta, da prelaz na Vercel bude jedan red
- [x] `404.html` = kopija `index.html` (Pages fallback za duboke linkove),
      u build koraku a ne ručno

## Dokaz pre nego što se dirne git
- [x] `npm run build`, pa pogledati ŠTA je stvarno na disku (ne pretpostavljati)
- [x] Servirati lokalno pod `/sveska/` i proveriti u pregledaču:
      `/sveska/`, `/sveska/auth`, i **refresh na `/sveska/radnik`** (pravi test fallback-a)

## Pre prvog commit-a (ne posle)
- [x] `DEPLOY.md` — lozinke test naloga u čistom tekstu; obrisati
- [x] `DEPLOY.md` korak 7 — `OPENAI_API_KEY` → `ANTHROPIC_API_KEY`
- [x] `.gitignore` — dodati `.probe/`, `.claude/settings.local.json`
- [x] NE commit-ovati `.output/` (već je u .gitignore); publikovanje preko
      GitHub Actions iz `main`, ne commit-ovanjem build artefakata

## Koraci koje mora Jovan (ne mogu kroz MCP)
- [ ] Napraviti prazan repo `sveska` na github.com, ili `gh auth login`
      (`gh` je instaliran ali neprijavljen; `git push` radi preko Credential Manager-a)
- [ ] Settings → Pages → izvor: GitHub Actions

## Urađeno i dokazano (2026-10-14)
- SPA build radi; `.output/public/` sadrži index.html, 404.html, .nojekyll, assets.
- Shell nosi `/sveska/` na svakom assetu.
- Lokalni simulator Pages-a: `/sveska/` 200; `/sveska/auth` i `/sveska/radnik`
  404+shell (isto kao Pages); svi asseti 200.
- U pregledaču: početna se iscrtava, `/sveska/auth` daje prijavu, `/sveska/radnik`
  se diže i preusmerava na `/sveska/auth` → basepath važi i u preusmerenjima.
- typecheck čist; lint 0 grešaka (6 starijih fast-refresh upozorenja).
- Dva commita: `5f451ae` (SPA + prvi commit), `184d11c` (DEPLOY.md).
- `mrmouse123.github.io/gradnjaos/` → 200, obrazac adrese potvrđen.
- `github.com/mrmouse123/sveska` → 404, repo još ne postoji.

## NIJE dokazano
- Prijava od početka do kraja (ne kucam lozinke u polja) — Jovanov korak A6.
- Da `npm ci` + build prolaze na ubuntu-u — vidi se na prvom Actions run-u.
- AI put (čeka ANTHROPIC_API_KEY, Faza 8).

# Faza 10 — Pregled celog koda (boris-cherny + Karpathy), 2026-10-14

Obim: 6605 LOC u repou. Isključeno iz pregleda: `src/components/ui/*` (shadcn
boilerplate, nepromenjen) i `src/routeTree.gen.ts` (generisan).
Ostaje ~4500 LOC koje je čovek/AI stvarno pisao.

Metod: četiri paralelna pregleda po dimenziji, pa SVE nalaze proveravam sam
izvršavanjem pre nego što ih prijavim. Agent koji tvrdi bug nije dokaz buga.

- [x] D1 Bezbednost: granica radnik/vlasnik, tier provere, RLS, edge funkcija
- [x] D2 Stanje i sinhronizacija: store.tsx, supabaseService.ts, queries.ts
- [x] D3 Domenska logika: interpreter.ts, voiceService.ts, actions.ts
- [x] D4 React/UI + izmene za Pages: komponente, rute, basepath
- [x] Verifikacija nalaza izvršavanjem (ne verovati agentima na reč)
- [x] Review sekcija + tasks/lessons.md

Karpathy „become one with the data": pre zaključaka o interpreteru gledati
STVARNE komande, ne izmišljene. Lekcija iz Faze 5: probe sa ugrađenim demo
komandama daje lažno samopouzdanje jer se nijedno ime ne sudara.

## D0 — Pregled STVARNIH podataka u bazi (moj deo, ne agentski)
Karpathy princip 2. Nijedan pregled koda ovo ne bi dao jer je u šemi, ne u kodu.

Higijena podataka je čista: 0 duplikata klijenata i radnika, 0 siročića,
svi datumi `YYYY-MM-DD`, sva vremena `HH:mm`, nijedna cena NULL.

Nalazi:
1. **Šema je još ključevana po korisniku, a logika je prešla na organizaciju.**
   `jobs_pkey = (user_id, id)`, a svi FK su složeni na `(user_id, …)`:
   `jobs(user_id, customer_id) → customers(user_id, id)`,
   `mixed_team_members(user_id, worker_id) → workers(user_id, id)`.
   Posledica: red može da ubaci samo onaj čiji je `user_id` već na vezanim
   redovima — tj. vlasnik. Zato su radnikovi upisi padali i zato je sync
   ograničen na vlasnika. **To je bila popravka simptoma, ne uzroka.**
   Blokira: drugog vlasnika/rukovodioca u organizaciji, prenos vlasništva.
2. **`org_members_user_id_key UNIQUE (user_id)`** — korisnik može biti u
   tačno jednoj organizaciji, ikada. Majstor koji radi sam i uz to je radnik
   u zadruzi je nemoguć. Proizvodna odluka koja je zapisana u šemi, ne u kodu.
3. **Nema indeksa na `org_id` nigde**, a svaka RLS polisa filtrira po njemu.
   `jobs_user_date_idx (user_id, date)` više ne odgovara obrascu upita.
   Ublažavanje: `my_org_id/my_org_role/my_worker_id/my_membership` su STABLE,
   pa se zovu jednom po upitu, ne po redu — cena je samo seq scan.
   Na 56 redova nevidljivo.
4. **26 ID-jeva poslova postoji u više organizacija** — isti demo seed (`j-1`…)
   kod svakog naloga. Bezbedno je samo zato što PK sadrži `user_id`.
   Znači ID posla NIJE globalno jedinstven: svaki budući kod koji traži posao
   po samom `id` je cross-org bug koji čeka.
5. `set_updated_at` je jedina funkcija bez `search_path` (i nije SECURITY
   DEFINER, pa je rizik nizak). Dolazi iz migracije koja fali u repou.
6. Statusi se čuvaju kao srpski prikazni stringovi (`ČEKA NAPLATU`, `ZAVRŠENO`)
   kao slobodan tekst, bez enum-a/CHECK-a. Promena natpisa u UI-u razvaljuje
   postojeće podatke; nema ničega što brani upis proizvoljnog statusa.

## NALAZ A (potvrđen izvršavanjem) — nov klijent se podmeće pod postojećeg
Dva nezavisna sloja imaju istu grešku, pa popravka jednog ne pomaže.

Sloj 1 — interpreter (`interpreter.ts`, `claimBy`/`stems`):
  "kod Marka Nikolića"    -> customer = "Marko Petrović"   (treba: nov klijent)
  "kod Ane Petrović"      -> customer = "Marko Petrović"   (treba: nov klijent)
  "kod Jovana Jovanovića" -> customer = "Nikola Jovanović" (treba: nov klijent)

Sloj 2 — `lookupCustomer` u `store.tsx:35-47` (tekst funkcije izvučen iz fajla
skriptom i pokrenut nad pravim seed-om; 7 od 9 slučajeva pogrešno):
  Marko Nikolić, Marko Jovanović, Nikola Marković, Milan Marković -> Marko Petrović
  Ana Petrović -> Ana Marković
  Jovan Jovanović -> Jovanović Company   (čovek pod firmom)
  "Petrovic" bez dijakritike -> NE nalazi Petrovića (nema deburr, a ASR meša)

Uzrok u sloju 2: `n.includes(c.name.toLowerCase().split(" ")[0])` poredi SAMO ime.
Uzrok u sloju 1: longest-stem-wins bira najbolje pojedinačno poklapanje tokena;
nema pojma „dato je puno ime, a nijedan postojeći klijent ne odgovara OBA dela".

Posledica za korisnika: posao, cena i dug se vežu za pogrešnog čoveka. Za
majstora koji vodi ko mu duguje, to je pogrešan račun — ne kozmetika.

Pravilo koje popravka mora da zadovolji: kad rečenica sadrži dva imenska tokena
a nijedan postojeći klijent ne poklapa oba, pravi se NOV klijent.

## NALAZ B (potvrđen izvršavanjem) — radnik čita ceo adresar klijenata
Test: `begin; set local role authenticated; set local request.jwt.claims = <pravi
radnik w-marko>;` pa prebrojavanje, pa `rollback`. Nije čitanje polise — izvršeno.

  poslovi            3 od 29   <- granica DRŽI, vidi samo svoje
  klijenti           5 od 5    <- SVE, i svih 5 ima telefon/adresu
  radnici            6         <- ceo spisak
  timovi / mixed     2 / 1
  org_members        2         <- UUID-ovi kolega

Uzrok: `orgs_rls.sql:28` — `org select` polisa na customers/workers/teams/
mixed_teams nema `my_org_role()` član, dok insert/update/delete (29-31) imaju.
UI traži samo `select("id, name")`; RLS dozvoljava `select *`.
Posledica: svaki radnik može da izvuče spisak klijenata cele firme.

## NALAZ C (potvrđen) — tier (solo/tim/zadruga) nije provera, nego UI katanac
`canAccess` postoji na TAČNO dva mesta, oba u pregledaču:
  RequireAuth.tsx:63, routes/index.tsx:65
Na serveru: `select count(*) from pg_policies where qual/with_check like '%profiles%'`
  -> **0**. Nijedna polisa, nijedan RPC, ni edge funkcija ne čita `profiles.role`.
Posledica: nalog na `solo` može kroz direktan HTTP poziv da pravi zadruga podatke
i da poziva `create_invite` (koji proverava samo da je owner). Nije curenje
podataka — preskakanje plaćanja.

## NALAZ D (potvrđen) — radnik se ne može ukloniti iz organizacije
`org_members` ima TAČNO jednu polisu: `own membership select / SELECT`.
Nema INSERT/UPDATE/DELETE polise. Nema `remove_member` RPC-a.
Posledica: otkaz ne prekida pristup. Brisanje reda iz `workers` ne pomaže jer
`org_members.worker_id` nema FK. Vlasnik to NE MOŽE da uradi iz aplikacije —
traži service role.

## NALAZ E (potvrđen) — `jobs.status` je slobodan tekst
Jedini CHECK na `jobs` je `jobs_scope_check` na koloni `scope`. Na `status` nema
ničega, a okidač ga namerno izuzima iz poređenja.
Posledica 1: radnik upisuje proizvoljan status (vrati ZAVRŠENO na ZAKAZANO).
Posledica 2: `aiService.ts:21` šalje `status` u kontekst, a `ai-process:147`
ga interpolira kao `JSON.stringify(body.context)` — radnikov tekst stiže u
prompt vlasnika. `ANSWER` putanja prikazuje modelov odgovor BEZ potvrde.

## NALAZ F (moja greška, sada tačnije) — repo migracije se ne mogu primeniti
Prošle nedelje sam u `migrations/README.md` napisao da se prefiksi ne poklapaju
sa verzijama u bazi. Potcenio sam: `ls | sort` daje redosled

  1 auth_per_user  2 orgs_rls  3 ...fix  4 my_membership  5 profiles_roles  6 orgs_schema

`orgs_rls` (2) koristi `my_org_id()` koji `orgs_schema` (6) PRAVI.
`supabase db reset` iz ovog repoa pada na drugom fajlu. Uz nedostajući
`sveska_init_schema`, repo ne može da podigne bazu — dakle ni jedna popravka
bezbednosti nije proverljiva pre ovoga.

## NALAZ G (potvrđen čitanjem) — dijalog „Novi posao" pamti prethodni posao
`Common.tsx:272-275` posle SAČUVAJ resetuje samo `description` i `price`.
Ostaju: `customer`, `date`, `time`, `location`, `status`, `assignee`.
Dijalog je trajno montiran unutar `DialogTrigger`, pa stanje preživi zatvaranje.
Posledica: drugi posao tiho dobije ISTOG klijenta, ISTO vreme i ISTU adresu.
Provera zauzetosti (`:236-252`) radi samo za `assigneeType === "worker"`,
pa u SOLO režimu nema ni upozorenja.
Dodatno: `date` se inicijalizuje sa `today()` pri montiranju — telefon ostavljen
preko noći nudi jučerašnji datum.

## NALAZ H (potvrđen čitanjem) — ZAVRŠENO i OTKAZANO su susedne pilule
`Common.tsx:26-33` redosled: ZAKAZANO, DODELJENO, U TOKU, **ZAVRŠENO, OTKAZANO**,
ČEKA NAPLATU. Pilule su `py-1` + 11px tekst ≈ 22px visine, u flex-wrap redu.
`setJobStatus` upisuje odmah u Supabase, bez potvrde i bez undo.
Posledica: najčešća radnja u aplikaciji je na najmanjem targetu, a promašaj
nadole otkazuje posao.

## ISPRAVKA AGENTSKOG NALAZA — dev server NE vraća 404
D4 je tvrdio da posle `base: "/sveska/"` koren u dev-u daje Vite 404 i da će
sledeći čovek misliti da je build pokvaren. Provereno izvršavanjem:
  curl http://localhost:5173/        -> HTTP 307, location: /sveska/
  curl http://localhost:5173/sveska/ -> HTTP 200
Vite sam preusmerava. README je i dalje netačan (redovi 9, 20, 51), ali
posledica je kozmetička, ne „izgleda pokvareno". Ovo je razlog zašto se
agentski nalazi proveravaju — lekcija 3.

## MOJE REGRESIJE iz Faze 9 (uvedene mojom izmenom, moje da počistim)
- `README.md:9,20` — adrese bez `/sveska/` (blaže nego prijavljeno, vidi iznad)
- `README.md:51` — „TanStack Start je SSR → Vercel ili Netlify" protivreči
  `spa: { enabled: true }`
- `_shell.html` nosi `<title>` i og: tagove RUTE `/`, pa `head()` u solo.tsx,
  tim.tsx, zadruga.tsx, auth.tsx i radnik.tsx više ne daje ništa bez JS-a.
  Deljenje linka na WhatsApp prikazuje karticu početne za svaku rutu.
- `<body>` u shell-u je prazan — početna, jedina javna stranica, ne iscrtava
  ništa dok se bundle ne parsira. Pod SSR-om je imala pravi HTML.
- `public/robots.txt` je mrtav: crawleri ga čitaju samo na korenu domena.
- `nitro()` i `npm start` grade Node server koji se nigde ne deployuje.

## NALAZ I (potvrđen izvršavanjem) — interpreter bez „kod" uzima klijenta za radnika
Pokrenuto nad pravim `src/` modulima. Svaka tvrdnja D3 koju sam testirao se
reprodukovala.

  "Zakazi Ani Markovic sutra u deset servis bojlera."  (tim)
     -> ASSIGN_JOB  radnik=Marko  klijent=Ana Marković
        Posao se dodeljuje radniku koga korisnik nije pomenuo.

  "Napravi tim za Marka Petrovica."  (zadruga)
     -> CREATE_MIXED_TEAM  clanovi=[Marko, Petar]
        Tim sastavljen iz imena KLIJENTA, bez ijednog pomenutog radnika.

  "Napravi tim od Marka i Milana za Petrovica."
     -> clanovi=[Marko, Milan, Petar]   (Petar je iz klijentovog prezimena)

  "Posalji Marka kod Marka Petrovica sutra u deset."  (tim)
     -> CREATE_JOB, BEZ radnika. `owned` je Set stringova a ne pozicija, pa se
        radnikov token briše svuda u rečenici. Ovo je normalna muška deklinacija.

Uzrok: `splitByKod` čuva klijenta samo kad „kod" bukvalno postoji; inače obe
strane gledaju celu rečenicu.

## NALAZ J (potvrđen) — multi-dodela: parovi se zamene i drugo vreme se izgubi
  "...posalji ELEKTRICARE kod Jovanovic Company, a VODOINSTALATERE kod Marka Petrovica."
     -> VODOINSTALATERI->Jovanović Company,  ELEKTRIČARI->Marko Petrović
        Obrnuto. Timovi se dodaju u tvrdo kodiranom redu (`:176-182`), a pare se
        po indeksu (`:227-235`). Demo komanda prolazi samo zato što slučajno
        kaže „vodoinstalaterski" prvo.

  "Vodoinstalatere kod Ane Markovic U OSAM, a elektricare kod Milana Ilica U DESET."
     -> oba @08:00. Drugo vreme se odbacuje (`:231`).

## NALAZ K (potvrđen) — `/^sta/` pojede komandu
  "Stavi Marka na posao kod Marka Petrovica sutra u deset."  -> ANSWER
  "Stani, otkazi posao kod Ane Markovic."                    -> ANSWER
Treba granica reči: `/^(sta|šta)\b/`.

## NALAZ L (potvrđen) — parseTime izmišlja vremena
  "sedamdeset evra"   -> 07:00        "osamdeset evra"  -> 08:00
  "desetak minuta"    -> 10:00        "petnaestog u deset" -> 15:00
  "cena 120.50 evra"  -> 20:50 (!)    "u 24"            -> 24:00 (nevalidno)
  "u pola pet" / "u podne" -> undefined, pa kartica pokaže samouvereno 09:00
Cena i vreme se mešaju: broj uz „evra" se čita kao sat.

# Review Faze 10

Obim: 6605 LOC, četiri paralelna pregleda + moj pregled stvarnih podataka.
Nalazi: 12 potvrđenih grupa (A-L). Ništa u kodu nije menjano — tražen je pregled.

Šta me je iznenadilo:
1. Granica radnik/vlasnik NA POSLOVIMA drži (3 od 29) — to je ono što smo
   gradili i radi. Ali adresar klijenata je potpuno otvoren. Gradio sam izolaciju
   poslova i nisam primetio da polisa na `customers` nema isti član.
2. Popravka „sync samo vlasnik" iz Faze 7 je bila popravka simptoma. Pravi uzrok
   je šema ključevana po korisniku (`PK (user_id, id)`, složeni FK), koja fizički
   ne dopušta da iko osim vlasnika ubaci red.
3. Repo je neizgradiv zbog redosleda fajlova koji sam ja napravio prošle nedelje.
   Opisao sam ga kao kozmetički problem prefiksa. Nije.
4. `stateRef`/`mutate` prepravka je rešila isključivo čitanja u istom tick-u.
   Upisi su ostali neuslovljeni stanjem u bazi — otuda nalaz B.
5. D4 je imao jednu netačnu tvrdnju (dev koren daje 404; stvarno daje 307).
   D3 je bio tačan na svim tačkama koje sam testirao.

Šta ostaje rizično i nije pregledano:
- `src/components/ui/*` (shadcn) i `routeTree.gen.ts` su namerno izostavljeni.
- Prijava od početka do kraja nije testirana (ne kucam lozinke).
- `voiceService` nalaz da se pravilo 10 s ne naoruža pre prve reči NISAM
  proverio sam — traži lažni SpeechRecognition; prijavljujem kao agentski nalaz.
- AI putanja (čeka ANTHROPIC_API_KEY).

# Review popravki (2026-10-14, posle pregleda)

Urađeno, svako sa dokazom izvršavanjem i u svom commit-u:
- efa6625  RLS: radnik vidi samo klijente sa SVOJIH poslova (2 od 5), vlasnik
           nepromenjeno (29/5/6/2/1/6). Dvostrana provera prijavom kao oba.
           + tri migracije preimenovane, redosled zavisnosti ispravljen.
- 697edbb  parseTime/parsePrice: vreme samo uz „u", opseg 0-23, cena sa
           decimalama i hiljadama. time.ts 31/31.
- e3325a8  Imena: `owned` po poziciji, `coversAll`, `canBeName`, `vowelStem`,
           `lookupCustomer` prepisan. names2.ts 23/23.
- 09274cf  Izmena posla šalje samo patch. patch.ts 10/10 meri telo zahteva.
           + popravljena zaostala sync.ts proba (4/4).

Dve regresije koje je PROBA uhvatila, ne čitanje:
- „kod Ane Marković" je posle prve verzije `coversAll` padalo na nov klijent
  („ane" vs „ana" se razlikuju samo u zadnjem samoglasniku).
- „kod Petrovića da popravi" je davalo klijenta „Petrovica Da".
Bez probe bi oba otišla u produkciju. Ovo je argument za `names2.ts`.

Ostaje otvoreno:
- [ ] `sveska_init_schema` — traži `supabase db pull` i lozinku baze (Jovan)
- [x] git push — repo napravljen, 7 commita na `main`, Pages živ
- [ ] Bez „kod" interpreter može uzeti klijenta za radnika; „kod" kao obična
      reč krade mesto klijenta. Traži odluku o dizajnu, ne zakrpu.
- [ ] Tier je UI katanac (0 polisa čita profiles) — preskakanje plaćanja
- [ ] Radnik se ne može ukloniti (org_members bez DELETE polise)
- [ ] `jobs.status` bez CHECK-a, i stiže u prompt vlasnika
- [ ] Mrežni prekid upiše demo preko pravih podataka (loadStateFromSupabase
      ne razlikuje „prazno" od „palo")
- [ ] Dijalog „Novi posao" pamti prethodni posao; ZAVRŠENO/OTKAZANO susedni
- [ ] Shell nosi meta tagove rute `/` za sve rute

## Objavljeno (2026-10-14)

`https://mrmouse123.github.io/sveska/` — živ.

- Repo `mrmouse123/sveska`, javan, grana `main`, 7 commita.
- Pages Source = GitHub Actions; obe Actions tajne postavljene.
- Run #1 je PAO za 15 s sa porukom „Fale Actions secrets: VITE_SUPABASE_URL
  VITE_SUPABASE_ANON_KEY" — zaštita iz workflow-a je odradila tačno ono zbog
  čega postoji, umesto da objavi sajt bez backenda.
- Attempt #2: build 31 s, deploy 11 s, ukupno 53 s, uspeh.

Provereno na živom sajtu, ne na pretpostavci:
  /sveska/           200
  /sveska/auth       404 + shell  (namerni Pages fallback)
  /sveska/radnik     404 + shell
  /sveska/favicon.svg 200
  F5 na /sveska/auth -> prijava se iscrtava, nula grešaka u konzoli
  authContext-BSfwIYxP.js sadrži 3 pojave project ref-a => Actions tajne su
  stvarno stigle u build; sajt nije izašao bez backenda.

Upozorenja iz log-a, nisu prekidna: `actions/checkout@v4` i `setup-node@v4`
ciljaju Node 20 (deprecated, forsiraju se na 24); `ubuntu-latest` prelazi na
Ubuntu 26 od 19.10.2026.

## Incident: prijava je padala posle objave (2026-10-14)

Simptom: `Failed to execute 'fetch' on 'Window': Invalid value` na /sveska/auth,
bez obzira na kredencijale.

Uzrok: u Actions tajnu `VITE_SUPABASE_ANON_KEY` je ušao ceo blok
(`https://...supabase.co` + prelom reda + `VITE_SUPABASE_ANON_KEY=` + JWT).
Vite to ugradi u bundle, Supabase klijent stavi u `apikey` zaglavlje, a prelom
reda čini zaglavlje nevalidnim — `fetch` pukne pre slanja zahteva.

Rešeno: tajna prepravljena na čist JWT, deploy ponovljen.

Provereno posle popravke:
  bundle: VITE_SUPABASE_ANON_KEY = 208 znakova, počinje `eyJ`, bez preloma
          reda, bez `https://`, bez znakova nedozvoljenih u zaglavlju
  auth/v1/settings sa anon ključem -> HTTP 200 (ključ važeći, servis dostupan)
  rest/v1/{jobs,customers,workers} kao anon -> 200 i prazan niz (RLS drži)

- [ ] NALAZ: `supabaseService` ne proverava oblik ključa. Pokvarena vrednost
      daje nerazumljivu `fetch` grešku umesto jasne poruke. Mala popravka:
      odbaciti ključ koji ne liči na JWT i prikazati „Supabase nije ispravno
      konfigurisan" umesto da se pusti do `fetch`-a.

# Faza 11 — protivnički pregled mojih popravki (2026-10-14)

Agent je gledao SAMO izmene iz Faze 10, sa zadatkom da ih obori. Sve ispod sam
proverio izvršavanjem pre nego što sam dirao kod.

## Regresije koje sam ja uveo i koje su bile ŽIVE na sajtu
- F1 KRITIČNO: `NOT_A_NAME` lista je padala na otvoreni rečnik. 13 od 24 obične
  rečenice je pravilo fantomskog klijenta: „kod Petrovića servis bojlera"
  -> klijent „Petrovica Servis". Gore od buga koji je lečila.
  Ispravka: umesto liste zabranjenih reči, koristi se signal koji već postoji —
  da li reč uopšte imenuje nekog poznatog klijenta — plus red reči (opis stoji
  POSLE imena, ime PRE prezimena). Oslovljavanja ostaju lista, jer su zatvorena
  klasa.
- F2 VISOKO: `(?![\d.,:])` je gutao vreme kad iza sata stoji zarez ili tačka.
  „Sutra u 10, kod Petrovića" -> bez vremena -> kartica pokaže 09:00.
  Ispravka: `(?![\d:]|[.,]\d)`.
- F3 VISOKO: cena sa hiljadama I decimalama. „12.500,00 evra" -> 500.
  Ispravka: jedan izraz hvata ceo broj, `toAmount` ga tumači.
- F4 VISOKO: prelazak sa `upsert` na `update` je izgubio samopopravljanje —
  upis koji ne pogodi nijedan red vraća 200 i prazan niz bez greške.
  Ispravka: `.select("id")` i greška kad se ništa ne vrati.
- F9: ime migracionog fajla nije odgovaralo verziji u bazi (`20261014120000`
  vs `20261014103542`) — ista zamka koju sam istog dana ispravljao.

## Prihvaćeno kao poznato ograničenje (nije regresija, bilo i pre)
- F5: `rawTokens`/`tokens` se razilaze na slovima koja `deburr` ne pokriva
  (Tóth, Müller, ćirilica). Ime novog klijenta tada bude izmešano.
- F6: `vowelStem` spaja Rada/Rade, Savo/Sava, Mila/Mile.
- F7: `stems()` prefiks spaja Ana/Anastasija, Mila/Milan.
- F8: drugi deo imena kraći od 4 znaka (Pop, Vuk) i dalje ispada.
- Nova imena ostaju u padežu („Marka Nikolića", ne „Marko Nikolić").

## Dodato
- `tasks/probe/regress.ts` — rečenice koje su JEDNOM radile pa ih je moja
  popravka pokvarila. Držati zelenim.
- `tasks/probe/patch.ts` — tvrdnja da upis u nepostojeći red puca.

# Faza 12 — zatvaranje svih preostalih nalaza (2026-10-14)

Redosled bira RIZIK, ne lakoću: čiste funkcije prve (brza provera, nula uticaja
na živ sajt), baza poslednja (živa je, i greška se vidi tek kod korisnika).

## A. Jezik — čiste funkcije, provera izvršavanjem
- [x] N5 `/^sta/` guta komande: „Stavi Marka…", „Stani, otkaži…" -> ANSWER
- [x] N1 `deburr` pokriva samo šđčćž; Tóth/Müller/ćirilica razbijaju tokene
- [x] N2 `vowelStem`/`stems` spajaju različite ljude (Rada/Rade, Ana/Anastasija)
- [x] N3 delovi imena kraći od 3-4 znaka ispadaju (Pop, Vuk)
- [x] N4 nova imena ostaju u padežu („Marka Nikolića")
- [x] N6 multi-dodela: parovi zamenjeni kad su električari prvi; drugo vreme pada
- [x] N7 bez „kod" klijent se uzima za radnika

## B. Klijent — integritet podataka
- [x] C1 mrežni prekid upiše demo preko pravih podataka
- [x] C3 `supabaseService` ne proverava oblik ključa (nerazumljiva fetch greška)
- [x] C2 dijalog „Novi posao" pamti prethodni posao

## C. UI — bezbednost dodira
- [x] U1 ZAVRŠENO i OTKAZANO susedni, ~22px, bez potvrde i undo
- [ ] U2 shell nosi meta tagove rute `/` za sve rute

## D. Baza — živa, menja se poslednja i uz dvostranu proveru
- [x] S3 `CHECK` na `jobs.status` (pre toga proveriti postojeće vrednosti)
- [x] S4 indeksi na `jobs(assignee_id)`, `jobs(customer_id)`; `my_*` u `(select …)`
- [x] S2 `remove_member` RPC + DELETE polisa na `org_members`
- [x] S1 tier se proverava na serveru, ne samo u pregledaču

## Blokirano, nije moje
- [x] S5 `sveska_init_schema` — zaobiđeno: puna šema izvučena iz kataloga u
      `supabase/schema/current.sql`, potpunost proverena brojanjem (8/8 grupa)

## Pravilo za ovu fazu (iz lekcije 20)
Za svaku popravku proba se piše PRE nje i mora da bude crvena, pa tek onda
zelena. Proba napisana posle popravke meri ono što već znam.

## Review Faze 12

Zatvoreno 15 od 17. Svaka grupa u svom commit-u, svaka sa probom.

Nije zatvoreno, sa razlogom:
- **U2** (shell nosi meta tagove rute `/`): popravka traži prerender po ruti,
  a sve rute osim `/` su iza prijave i nemaju vrednost za pregled linka.
  Rizik izmene veći od koristi. Ostaje zapisano.
- **S5** `sveska_init_schema`: traži `supabase db pull` i lozinku baze.

Delimično, i to namerno:
- **N2** „kod Rade Nikolić" i dalje nalazi „Rada Nikolić". Isto pravilo čini da
  „kod Ane" nađe Anu; uklanjanje bi pokvarilo češći slučaj. Popravljena je
  druga polovina (Anastasija/Ana, Milan/Mila) kroz granicu dužine padeža.
- **N4** prezime dolazi u nominativ, ime na „-a" ne. „Marka" je genitiv i od
  „Marko" i od „Marka" — pogrešan nominativ je gori od padeža.
- **S1** zatvoreno je pozivanje radnika (traži TIM). Šire od toga traži da demo
  seed prestane da svakom nalogu upisuje `tim` i `zadruga` podatke — to je
  proizvodna odluka, nije moja.

Šta me je iznenadilo:
1. Moj prvi N7 filter je gubio Milana iz mixed tima, jer je on i radnik i
   klijent (Milan Ilić). Uhvatila demo proba, ne čitanje.
2. Pola „grešaka" u prvom prolazu `lang.ts` bile su pogrešna očekivanja u
   mojoj probi — ulaz sam pisao ASCII-jem pa je i izlaz bio bez dijakritike.
3. Tier se ne može zatvoriti kako je nalaz tražio, jer demo svesno krši to
   pravilo. Nalaz je bio tačan, ali rešenje nije tehničko.

# Faza 13 — tri komande koje su nedostajale (2026-10-15)

Prijava sa terena: „prepoznaje samo zakazivanje posla". Tačno — ostalo nikad
nije ni napisano. Dodato sve troje, probom pre implementacije (lekcija 20):
`tasks/probe/commands.ts`, crveno 11/19 pre, 19/19 posle.

## Dodato
- **CANCEL_JOB** — „Otkaži posao kod Marka Petrovića."
- **UPDATE_JOB** — „Pomeri posao kod Ane Marković na 15 časova.",
  „Promeni cenu posla kod Milana Ilića na 200 evra."
- **ADD_TEAM_MEMBER** — „Dodaj Jovana u tim vodoinstalateri."
- **Multi-dodela radnicima**, i u TIM režimu, ne samo timovima u ZADRUGA:
  „Pošalji Marka kod Ane, a Petra kod Milana" i
  „Marko i Petar da poprave bojler i grejalicu."

## Odluke koje su morale da se donesu
- **Koji posao se otkazuje kad ih klijent ima više?** Bira se najbliži
  predstojeći aktivan. Ne odbija se, jer bi komanda bila beskorisna u pravom
  imeniku gde klijent po pravilu ima više poslova. Kartica traži potvrdu i
  prikazuje KOJI posao, pa korisnik vidi pre nego što potvrdi.
- **„na" se sada čita kao vreme** („pomeri na 15 časova"), ali ne kad je broj
  uz valutu — „promeni cenu na 20 evra" ne postaje 20:00.
- **Bez „kod" u rečenici nema klijenta**, pa se radnici traže bez filtera koji
  inače sprečava da ime klijenta postane radnik. Da to ne proguta „Napravi tim
  za Marka Petrovića", multi-dodela traži ili „kod" ili bar dva posla u rečenici.
- `grejalicu` se nije prepoznavalo — DESCRIPTIONS je imao samo `grejanj|kotl`.

## Takođe
- `CREATE_ASSIGNMENTS` je uvek upisivao cenu 0; sada nosi cenu po dodeli.
- Kartica potvrde prikazuje šta će se desiti i za nove komande, dugme za
  otkazivanje je crveno, a „IZMENI" se ne nudi tamo gde nema šta da se menja.

# Faza 14 — četiri preostala nalaza sa telefona (2026-10-17)

- [x] RequireAuth: `creating` u zavisnostima + progutana greška = beskonačna
      petlja `ensure_org()` na lošem signalu. Sada jedan pokušaj po nalogu
      (stanje idle/running/done/failed) i vidljiva kartica „Pokušaj ponovo".
- [x] FAB preko dugmeta „Pošalji" u SVESKA AI tabu: forma dobila `pr-24` na
      telefonu. FAB je na telefonu samo ikona (~56px + 20px desno = 76px < 96px).
- [x] Editor cene u kartici: kontrolisan krug kroz `Number()` jeo tačku, pa se
      120,50 nije moglo uneti. Tekst polja je sada lokalni, broj se izvlači sa
      strane; `inputMode="decimal"`.
- [x] safe-area/dvh: `viewport-fit=cover` (bez toga je `env(safe-area-inset-*)`
      uvek 0), `pb-[env(safe-area-inset-bottom)]` na donjoj navigaciji, FAB
      podignut za istu vrednost, dijalozi `vh` -> `dvh`.

Provereno: typecheck, lint 0 grešaka, build, sve probe zeleno.
NIJE vizuelno provereno na pravom telefonu — #2 i #4 su izmerene iz klasa, ne
sa ekrana. Tester je prava provera.

# Faza 15 — glas preko servera za iPhone i Firefox (2026-10-17)

Zašto: aplikacija koristi pregledačev SpeechRecognition. Chrome: radi, besplatno.
iOS Safari: Apple-ov srpski je slab. Firefox: motora nema. Claude NE može da bude
motor za govor (API ne prima zvuk), pa treba zaseban provajder i zaseban ključ.

Odluke:
- Server SAMO na iOS-u i gde motora nema; Chrome ostaje na pregledaču.
- Na serverskom putu NEMA pravila tišine — snimanje prekida dodir ZAVRŠI, uz tvrdu
  granicu 60 s. Na gradilištu tišina nije signal, a AudioContext na iOS-u traži dodir.
- Provajder je OpenAI-kompatibilan (Groq podrazumevano), menja se tajnama
  STT_BASE_URL / STT_MODEL — bez izmene koda.

Urađeno:
- [x] `supabase/functions/transcribe` — deploy v1 ACTIVE; isti auth gate kao ai-process,
      kapa 8 MB, timeout 25 s, mapiranje grešaka provajdera na razloge.
- [x] `src/lib/sveska/recorderService.ts` — MediaRecorder sesija istog oblika kao
      pregledačeva (`VoiceSession`), mikrofon se pušta na svakom izlazu.
- [x] hook bira implementaciju; overlay menja tekstove u serverskom režimu.
- [x] `tasks/probe/recorder.ts` — 27 tvrdnji na lažnom MediaRecorder-u: adresa, zaglavlja,
      zvuk u telu, puštanje mikrofona, kodovi grešaka (bez ključa, 500, prazan tekst,
      bez sesije, odbijen mikrofon), otkaz ne šalje ništa, tvrda granica sama završava,
      izbor puta po uređaju (iPhone, iPadOS-kao-Mac, desktop).
- [x] Živa funkcija: anon → 401 unauthorized, bez zaglavlja → 401, OPTIONS → 204.

NIJE dokazano i ne tvrdi se:
- kvalitet prepoznavanja srpskog na iPhone-u — nema iPhone-a, nema srpskog snimka,
  nema ključa. To je test na uređaju posle `STT_API_KEY`.
- [~] STT_API_KEY — ODBAČENO 2026-10-21: Jovan hoće samo Claude ključ, bez STT
  provajdera. Claude API ne prima zvuk (provereno u `claude-api` dokumentaciji:
  blokovi su tekst/slika/PDF/alati — zvuka nema), pa serverski put na iPhone-u
  nema čime da radi. `shouldUseServerStt()` sad vraća server SAMO bez motora
  (Firefox); iPhone ide na Apple-ov motor u Safariju. Kod servera ostaje — vidi
  DEPLOY.md A5b za povratak.
- [~] 2026-10-21 kasnije: Jovan ipak napravio Groq ključ → iPhone VRAĆEN na server
  (`isIos() ||`), proba 30/30. Dva ključa, dva posla: `ANTHROPIC_API_KEY` (razumevanje),
  `STT_API_KEY` (glas → tekst). Claude ključ se NE menja Groq ključem.
- [x] Jovan uneo Groq ključ kao `GROQ_API_KEY` (ne `STT_API_KEY`) → funkcija `transcribe`
  sada čita oba imena (v4, deploy 2026-10-21 21:07 UTC). Probni WAV ton iz Chrome sesije
  → `{ok:true, text:"."}` za 2,7 s: gateway, prijava i Groq ključ rade.
- [ ] Jovan: srpska rečenica na iPhone-u u Safariju — jedino što ovo ne dokazuje je kvalitet.

# Faza 16 — dupliranje na Androidu, DRUGI mehanizam (2026-10-21)

Teren (video, Android 10 Chrome, 19.10.): „ponovo duplira sve". Prva popravka
(siroče posle neuspelog `start()`) je bila tačna, ali nedovoljna.

Uzrok 2: Android Chrome isporučuje rezultate KUMULATIVNO — svaki `onresult`
nosi sve dosadašnje rečenice, sve konačne, uz `resultIndex = 0`. Kod koji
dopisuje od `resultIndex` drugu rečenicu vidi kao „prva + druga". Proba
`voice-android.ts` pre popravke: posle tri rečenice prva TRI puta, druga dva.
Desktop šalje pravi indeks — zato „na desktopu radi, na telefonu duplira".

Popravka: tekuća sesija se gradi IZNOVA iz celog niza (kumulativna isporuka
postaje bezopasna); tekst prethodnih sesija u `committed`; posle restarta se
odbacuje rečenica koju Android ponovo isporuči (čuvar = poslednja konačna
rečenica, i ceo tekst sesije za svaki slučaj). Prvi pokušaj čuvara je držao
ceo tekst pa nije hvatao ponovljenu poslednju rečenicu — uhvatila proba.

- [x] `tasks/probe/voice-android.ts` 7/7; `voice.ts` (mehanizam 1) i dalje 5/5
- [ ] Jovan/tester: ponoviti na istom Androidu posle deploya

# Faza 17 — vokativ u pozdravu (2026-10-21)

Sa terena: „Dobro jutro, PETARE". Pozdrav je slepo lepio „e" na ime. Sada
`vocative()` u `text.ts`: pravila (samoglasnik ostaje, -ica → -ice, k/g/h → če/že/še,
š → še, meki suglasnici → u, ostali → e) + izuzeci sa nepostojanim „a" (Petar, Aleksandar,
Mitar, Dimitar). Ženska dvosložna na -a (Maja → Majo) namerno ostaju: nominativ je
uvek prihvatljiv, pogrešan vokativ nije. Primena: `CoreScreens` pozdrav i `ChatScreen`
prva poruka (bila ručno „Petre", sad isti izvor).

- [x] `tasks/probe/vocative.ts` 33/33
- Napomena: ime je i dalje demo („Petar") — u bazi nema imena korisnika (`profiles`
  ima samo `role`). Pravo ime bi tražilo kolonu i ekran za unos; nije traženo.

