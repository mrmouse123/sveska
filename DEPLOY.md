# SVESKA — deploy na Vercel (korak po korak)

Preduslov: Node 20+, nalog na vercel.com (besplatan Hobby plan je dovoljan), raspakovan `sveska.zip`.

## 1. Lokalna provera (2 min)

```bash
cd sveska
npm install
npm run build
```
Mora da ispiše `✓ built` i `Generated .output/nitro.json`. Ako ne — javi grešku, ne idi dalje.

## 2. Prvi deploy (CLI, bez GitHub-a)

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

## 3. Env varijable (jednom)

```bash
npx vercel env add VITE_SUPABASE_URL production
#   → nalepi: https://nieypuvbxvhapfvjbhoc.supabase.co
npx vercel env add VITE_SUPABASE_ANON_KEY production
#   → nalepi vrednost iz .env (red VITE_SUPABASE_ANON_KEY=...)
```
Isto ponovi sa `preview` umesto `production` ako želiš da i preview linkovi rade.
(Alternativa: Vercel dashboard → Project → Settings → Environment Variables.)

## 4. Produkcijski deploy

```bash
npx vercel --prod
```
Ispisuje `https://sveska.vercel.app` (ili sličan). **To je adresa koju šalješ kolegi.**

Svaki sledeći put kad promeniš kod: `npx vercel --prod`.

## 5. Supabase: dozvoli Vercel domen (obavezno, inače login ne radi)

Supabase dashboard → **Authentication → URL Configuration**:
- **Site URL**: `https://sveska.vercel.app`
- **Redirect URLs**: dodaj `https://sveska.vercel.app/**` i `http://localhost:5173/**`

## 6. Registracija naloga za kolegu

Dve opcije:

**A) Bez emaila (najbrže za test):** Supabase → Authentication → Providers → Email → isključi **Confirm email** → Save. Kolega ode na `https://sveska.vercel.app/auth` → „Registruj se“ → odmah ulazi.

**B) Ručno (ne diraš podešavanja):** Supabase → Authentication → Users → **Add user** → **Create new user** → email + lozinka, štikliraj **Auto Confirm User**. Pošalješ mu kredencijale.

Test nalozi već postoje (`test1@sveska.app`, `test2@sveska.app`, `claude-test@sveska.app`
i nalozi za TIM/ZADRUGA). **Lozinke namerno nisu u ovom fajlu** — repo je javan.
Vidi ih u Supabase → Authentication → Users, ili ih resetuj odatle.

## 7. Claude ključ (opciono — bez njega radi lokalni interpreter)

AI sloj je u Fazi 8 prešao sa OpenAI na Claude, pa se tajna zove `ANTHROPIC_API_KEY`:

```bash
supabase login
supabase link --project-ref nieypuvbxvhapfvjbhoc
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

Ili kroz dashboard: Edge Functions → Secrets.
Provera da AI zaista radi nije „pojavila se kartica" — app tiho pada na lokalni
interpreter. Mora `source === "ai"` u rezultatu; vidi `tasks/todo.md`, Faza 8.

## 8. Provera da sve radi

1. Otvori `https://sveska.vercel.app` na telefonu → SOLO → prijavi se.
2. Dodaj posao (mikrofon radi jer je HTTPS).
3. Supabase → Table Editor → `jobs` → red se pojavio sa tvojim `user_id`.
4. Otvori isti nalog na laptopu → isti poslovi (multi-device).
5. Kolega sa svojim nalogom → vidi samo svoje.

## Ako nešto pukne

- **Rute daju 404 na Vercelu** → `nitro()` fali u `vite.config.ts` (već je tu; proveri da nisi obrisao).
- **Login vraća na /auth** → korak 5 (URL Configuration).
- **„Nalog nije potvrđen“** → korak 6.
- **Glas ne radi** → samo HTTPS ili localhost; Safari na iOS-u traži dozvolu za mikrofon svaki put.
- Logovi: `npx vercel logs sveska --prod`.
