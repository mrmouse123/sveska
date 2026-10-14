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
   Tek na osnovu stvarne greške odlučiti dalje — moguć kandidat je kombinacija
   forsiranog `tool_choice` i razmišljanja; ne menjati kod bez te potvrde,
   da `index.ts` ne odstupi od deploy-ovane verzije.
4. Zatim testirati duplikate klijenata u multi-dodeli (reproducibilno samo kroz AI).

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
