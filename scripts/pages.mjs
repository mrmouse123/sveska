// Priprema `.output/public` za statični hosting (GitHub Pages).
//
// SPA režim TanStack Start-a ispisuje `_shell.html` — prazan okvir koji se
// hidrira u pregledaču. Nitro server ga servira za svaku rutu; statični hosting
// to ne ume, pa mu okvir treba pod dva imena:
//   index.html — početna
//   404.html   — Pages ga vraća za svaku nepoznatu putanju, pa duboki link
//                (/sveska/radnik) i F5 na njemu stignu do aplikacije.
//                Status je 404, ali pregledač ipak izvrši HTML i ruter preuzme.
// Bez 404.html osveženje na podstrani vraća GitHub-ovu stranicu greške.
import { copyFile, access, writeFile } from "node:fs/promises";
import { join } from "node:path";

const dir = join(process.cwd(), ".output", "public");
const shell = join(dir, "_shell.html");

try {
  await access(shell);
} catch {
  console.error(
    "[pages] Nema .output/public/_shell.html — SPA režim nije ispisao okvir.\n" +
      "        Proveri `spa: { enabled: true }` u vite.config.ts i pokreni `vite build`.",
  );
  process.exit(1);
}

for (const name of ["index.html", "404.html"]) {
  await copyFile(shell, join(dir, name));
  console.log(`[pages] ${name} <- _shell.html`);
}

// Jekyll preskace fajlove koji pocinju donjom crtom (_shell.html, _assets).
// Preko Actions artefakta se Jekyll ne pokrece, ali .nojekyll je besplatna
// sigurnost ako se izvor Pages-a ikada vrati na "deploy from branch".
await writeFile(join(dir, ".nojekyll"), "");
console.log("[pages] .nojekyll");
