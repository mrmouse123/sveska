# SVESKA — objavljivanje

Dva puta. **GitHub Pages je ono što je trenutno postavljeno** (isti obrazac kao
`gradnjaos`). Vercel je pripremljen kao kasnija zamena i opisan niže — oba rade
sa istim kodom, razlika je jedan red u `vite.config.ts`.

---

# A. GitHub Pages (aktuelno)

Adresa na kraju: `https://mrmouse123.github.io/sveska/`

Preduslov: Node 20+, GitHub nalog (`mrmouse123`).

## A1. Lokalna provera

```bash
npm install
npm run build:pages
```
Mora da ispiše `[pages] index.html <- _shell.html`, `[pages] 404.html` i `[pages] .nojekyll`.
Ako `_shell.html` ne postoji, skripta pada sa objašnjenjem — ne idi dalje.

## A2. Repo

Napravi **prazan** repo `sveska` na github.com (bez README-a i .gitignore-a — commit već postoji), pa:

```bash
git remote add origin https://github.com/mrmouse123/sveska.git
git push -u origin main
```

## A3. Dve Actions tajne (obavezno)

Settings → Secrets and variables → **Actions** → New repository secret:

| Ime | Vrednost |
|---|---|
| `VITE_SUPABASE_URL` | `https://nieypuvbxvhapfvjbhoc.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | vrednost iz lokalnog `.env` |

Vite ugrađuje ove vrednosti u JS bundle **u trenutku build-a**. Bez njih build bi
prošao a sajt izašao bez backenda, pa workflow namerno pada odmah i imenuje šta fali.

Anon ključ je i inače javan — završava u bundle-u koji svako može da pročita. To je
po Supabase dizajnu; podatke štiti RLS, ne skrivanje ključa.

## A4. Uključi Pages

Settings → **Pages** → Source = **GitHub Actions**. Pa Actions → „Deploy na GitHub Pages" → Run workflow.

## A5. Supabase Site URL

Authentication → URL Configuration → **Site URL**: `https://mrmouse123.github.io/sveska/`

Prijava koristi samo email+lozinku (`signInWithPassword`), bez preusmeravanja — pa
ovo **nije blokada za prijavu**. Jeste bitno za link iz mejla potvrde pri registraciji:
bez Site URL-a taj link vodi u prazno.

## A6. Provera

1. Otvori `https://mrmouse123.github.io/sveska/` → početna.
2. **Otvori `https://mrmouse123.github.io/sveska/auth` direktno i pritisni F5.**
   Mora da ostane na prijavi. Ako vidiš GitHub-ovu stranicu greške, `404.html` nije objavljen.
3. Prijavi se → dodaj posao (mikrofon radi, Pages je HTTPS).
4. Supabase → Table Editor → `jobs` → red se pojavio.

---

# B. Alternativa: Vercel (kasnije)

Prednost nad Pages-om: pravi server, pa nema ni podputanje ni `404.html` trika,
a SSR može da se vrati. Pre prelaza u `vite.config.ts` postavi `BASE = "/"`.

Preduslov: Node 20+, nalog na vercel.com (besplatan Hobby plan je dovoljan).

## B1. Lokalna provera (2 min)

```bash
cd sveska
npm install
npm run build
```
Mora da ispiše `✓ built` i `Generated .output/nitro.json`. Ako ne — javi grešku, ne idi dalje.

## B2. Prvi deploy (CLI, bez GitHub-a)

```bash
npx vercel login          # otvori browser, potvrdi
npx vercel                # prvi put pita:
#   Set up and deploy? → Y
#   Which scope? → tvoj nalog
#   Link to existing project? → N
#   Project name? → sveska
#   In which directory is your code located? → ./   (Enter)
#   Vercel detektuje "TanStack Start" — potvrdi default build settings (Enter)
```
Dobijaš **preview URL** (`sveska-xxxx.vercel.app`). Još nema env varijabli, pa ne ide dalje od ovoga.

## B3. Env varijable (jednom)

```bash
npx vercel env add VITE_SUPABASE_URL production
#   → nalepi: https://nieypuvbxvhapfvjbhoc.supabase.co
npx vercel env add VITE_SUPABASE_ANON_KEY production
#   → nalepi vrednost iz .env (red VITE_SUPABASE_ANON_KEY=...)
```
Isto ponovi sa `preview` umesto `production` ako želiš da i preview linkovi rade.
(Alternativa: Vercel dashboard → Project → Settings → Environment Variables.)

## B4. Produkcijski deploy

```bash
npx vercel --prod
```
Ispisuje `https://sveska.vercel.app` (ili sličan). **To je adresa koju šalješ kolegi.**

Svaki sledeći put kad promeniš kod: `npx vercel --prod`.

## B5. Supabase: Vercel domen

Prijava ne koristi preusmeravanje, pa ovo nije blokada za login — bitno je za
linkove iz mejlova (potvrda registracije, reset lozinke).

Supabase dashboard → **Authentication → URL Configuration**:
- **Site URL**: `https://sveska.vercel.app`
- **Redirect URLs**: dodaj `https://sveska.vercel.app/**` i `http://localhost:5173/**`

## B6. Registracija naloga za kolegu

Dve opcije:

**A) Bez emaila (najbrže za test):** Supabase → Authentication → Providers → Email → isključi **Confirm email** → Save. Kolega ode na `https://sveska.vercel.app/auth` → „Registruj se“ → odmah ulazi.

**B) Ručno (ne diraš podešavanja):** Supabase → Authentication → Users → **Add user** → **Create new user** → email + lozinka, štikliraj **Auto Confirm User**. Pošalješ mu kredencijale.

Test nalozi već postoje (`test1@sveska.app`, `test2@sveska.app`, `claude-test@sveska.app`
i nalozi za TIM/ZADRUGA). **Lozinke namerno nisu u ovom fajlu** — repo je javan.
Vidi ih u Supabase → Authentication → Users, ili ih resetuj odatle.

## B7. Claude ključ (opciono — bez njega radi lokalni interpreter)

AI sloj je u Fazi 8 prešao sa OpenAI na Claude, pa se tajna zove `ANTHROPIC_API_KEY`:

```bash
supabase login
supabase link --project-ref nieypuvbxvhapfvjbhoc
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

Ili kroz dashboard: Edge Functions → Secrets.
Provera da AI zaista radi nije „pojavila se kartica" — app tiho pada na lokalni
interpreter. Mora `source === "ai"` u rezultatu; vidi `tasks/todo.md`, Faza 8.

## B8. Provera da sve radi

1. Otvori `https://sveska.vercel.app` na telefonu → SOLO → prijavi se.
2. Dodaj posao (mikrofon radi jer je HTTPS).
3. Supabase → Table Editor → `jobs` → red se pojavio sa tvojim `user_id`.
4. Otvori isti nalog na laptopu → isti poslovi (multi-device).
5. Kolega sa svojim nalogom → vidi samo svoje.

## Ako nešto pukne

- **Rute daju 404 na Vercelu** → `nitro()` fali u `vite.config.ts` (već je tu; proveri da nisi obrisao).
- **Pages: osvežavanje podstrane daje GitHub 404** → `404.html` nije objavljen;
  proveri da je `npm run build:pages` (ne `build`) i da Actions log ispisuje `[pages] 404.html`.
- **Pages: sajt se otvori ali prijava ne radi, konzola kaže da Supabase nije konfigurisan**
  → fale Actions tajne (A3); vrednosti se ugrađuju u build, ne čitaju se u pregledaču.
- **Pages: beli ekran, konzola puna 404 na /assets/...** → `BASE` u `vite.config.ts`
  ne odgovara imenu repoa.
- **Vercel: login vraća na /auth** → B5 (URL Configuration).
- **„Nalog nije potvrđen“** → B6.
- **Glas ne radi** → samo HTTPS ili localhost; Safari na iOS-u traži dozvolu za mikrofon svaki put.
- Logovi: Pages → repo → Actions → zadnji run. Vercel → `npx vercel logs sveska --prod`.
