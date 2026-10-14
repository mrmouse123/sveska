# SVESKA

Voice-first AI digitalna sveska za majstore (SOLO / TIM / ZADRUGA). TanStack Start + React 19 + Tailwind v4 + Supabase.

## Pokretanje lokalno

```bash
npm install
npm run dev        # http://localhost:5173
```

`.env` je već popunjen (Supabase URL + anon ključ — anon ključ je javni, namenjen browseru).
Bez `.env` aplikacija radi samo sa localStorage-om.

## Provere

```bash
npm run typecheck  # tsc --noEmit
npm run build      # dist/client + dist/server
npm run preview    # http://localhost:4173
```

## Nalozi i podaci

- Prijava je obavezna za SOLO/TIM/ZADRUGA (`/auth`, email + lozinka, Supabase Auth). Početna je javna.
- Test nalozi (potvrđeni, spremni): `test1@sveska.app`, `test2@sveska.app`.
  Lozinke nisu u repou — vidi Supabase → Authentication → Users.
- Registracija novih naloga šalje potvrdni email. Supabase-ov ugrađeni SMTP dozvoljava svega par poruka na sat —
  za testiranje ili isključi **Authentication → Providers → Email → Confirm email**, ili podesi svoj SMTP.
- Svaki korisnik ima sopstvene redove (`user_id`, RLS `user_id = auth.uid()`), PK je `(user_id, id)`.
- **localStorage** je izvor istine na uređaju (ključ `sveska-state-v1:<user_id>`); svaka promena se posle 1.5 s
  upisuje u Supabase. Na novom uređaju / praznom browseru stanje se učitava iz Supabase-a, a ako korisnik nema ništa, seed-uje se demo.
- Notifikacije su samo lokalne.

## AI

`src/lib/sveska/aiService.ts` zove edge funkciju `ai-process` sa korisnikovim JWT-om. Funkcija odbija anon ključ (401), pa niko bez naloga ne može da troši OpenAI kredit. Ako vrati `{ok:false}` (nema OpenAI ključa, timeout, mreža) ili korisnik nije prijavljen, app tiho pada na lokalni deterministički interpreter.

Postavljanje ključa (jednom, iz terminala):

```bash
supabase login
supabase link --project-ref nieypuvbxvhapfvjbhoc
supabase secrets set OPENAI_API_KEY=sk-...
```

Redeploy funkcije posle izmene koda: `supabase functions deploy ai-process`.

## Deploy

TanStack Start je SSR → Vercel ili Netlify. U dashboard hostinga uneti `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY`.
