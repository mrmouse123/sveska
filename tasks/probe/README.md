# Probe skripte

Pokreću se nad pravim izvorom iz `src/` (esbuild ih bandluje, node izvrši).
Jedna komanda za sve, ili filter po imenu:

    npm run probe
    npm run probe -- voice

`scripts/probe.mjs` svakoj probi ubacuje stub konfiguracije koja LIČI na pravu
(`getSupabaseConfig` proverava oblik adrese i ključa; bez toga probe koje zovu
`supabaseService` tiho postaju no-op i lažno padaju). Probe koje stubuju `fetch`
same odlučuju šta se sa tom konfiguracijom dešava.

Presuda po probi: `OK` / `LOSE`; `INFO` su istraživački ispisi bez presude
(`demo`, `t`, `names`). Izlazni kod je 1 ako ijedna padne.

## Šta koja proba dokazuje

Razumevanje (interpreter, queries, text):
- `time.ts` — `parseTime` i cena, lažni pozitivi („sedamdeset evra" nije 07:00) i opseg 0-23
- `names2.ts` — imena i padeži: `lookupCustomer` + interpreter, radnik i klijent sa istim oblikom
- `lang.ts` — ćirilica, dijakritika, strana imena kroz `deburr`
- `regress.ts` — regresije ranijih faza
- `commands.ts` — otkazivanje, izmena, član tima, više dodela; i `executeAiResult` nad lažnim akcijama
- `vocative.ts` — vokativ za pozdrav (33 imena)
- `demo.ts`, `t.ts`, `names.ts` — istraživački ispisi

AI put:
- `ai-merge.ts` — `mergeAiResult`: spajanje AI i lokalnog rezultata po akciji,
  `jobId` iz spojenog klijenta, opseg režima, bez lokalnih podrazumevanih vrednosti u izmeni

Glas:
- `voice.ts` — pregledačev motor, dupliranje mehanizam 1 (zamena instance)
- `voice-android.ts` — dupliranje mehanizam 2 (kumulativni rezultati, ponovna isporuka)
- `voice-silence.ts` — mikrofon otvoren bez ijedne reči završava posle 10 s (lažni sat)
- `recorder.ts` — serverski put (MediaRecorder + `transcribe`): zaglavlja, puštanje
  mikrofona, kodovi grešaka, otkaz, tvrda granica, ZAVRŠI pre dozvole, `start()` baci,
  otkaz u procepu posle ZAVRŠI, dozvola odbijena posle otkaza, izbor puta po uređaju

Perzistencija (supabaseService):
- `config.ts` — `getSupabaseConfig` i učitavanje stanja
- `sync.ts` — serijalizacija upisa, novije stanje preživi pad starijeg
- `patch.ts` — izmena posla šalje SAMO izmenjene kolone (PATCH, mapiranje camelCase -> kolona)

Bez probe (poznato): `store.tsx` reduktor kao živ modul, `RequireAuth`/`authContext`
mašina stanja, obe edge funkcije (proveravaju se uživo kroz gateway, vidi `tasks/todo.md`).

Uvozi su relativni (`../../src/...`), a esbuild ih razrešava iz putanje fajla —
pokreći komande iz korena projekta.
