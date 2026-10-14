# Probe skripte

Pokreću se nad pravim izvorom iz `src/` (esbuild ih bundluje, node izvrši).
Nisu vezane za package.json da ne bi uvele zavisnost od esbuild-a kao direktnog paketa.

    npx esbuild tasks/probe/demo.ts --bundle --format=esm --platform=node --outfile=.probe/demo.mjs && node .probe/demo.mjs
    npx esbuild tasks/probe/t.ts    --bundle --format=esm --platform=node --outfile=.probe/t.mjs    && node .probe/t.mjs

Sync probe traži stub za `import.meta.env`:

    npx esbuild tasks/probe/sync.ts --bundle --format=esm --platform=node --outfile=.probe/sync.mjs \
      --define:import.meta.env=globalThis.__ENV \
      --banner:js='globalThis.__ENV={VITE_SUPABASE_URL:"http://stub.local",VITE_SUPABASE_ANON_KEY:"anon"};' && node .probe/sync.mjs

- `demo.ts` — svih 10 ugrađenih demo komandi kroz `interpretLocal`
- `t.ts` — `parseTime` i tri reprezentativne rečenice
- `time.ts` — 31 tvrdnja o `parseTime` i ceni, uključujući lažne pozitive
  („sedamdeset evra" nije 07:00, „cena 120.50 evra" nije 20:50) i opseg 0-23
- `sync.ts` — serijalizacija upisa u Supabase sa stub-ovanim `fetch` (4 tvrdnje)

Uvozi su relativni (`../../src/...`), a esbuild ih razrešava iz putanje fajla —
pokreći komande iz korena projekta.
