// Normalizacija srpskog teksta. Zasebno od interpretera jer ga koristi i
// queries.ts, a interpreter već uvozi queries — obrnuti uvoz bi bio kružni.

/** Ćirilica -> latinica. Srpski se piše oba pisma, a ASR vraća i jedno i drugo. */
const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ђ: "dj", е: "e", ж: "z", з: "z",
  и: "i", ј: "j", к: "k", л: "l", љ: "lj", м: "m", н: "n", њ: "nj", о: "o",
  п: "p", р: "r", с: "s", т: "t", ћ: "c", у: "u", ф: "f", х: "h", ц: "c",
  ч: "c", џ: "dz", ш: "s",
};

/**
 * Sve na goli ASCII. Ranije je pokrivalo samo šđčćž, pa su Tóth, Müller i
 * ćirilica ispadali kao RAZDVAJAČI reči — ime se lomilo na komade („Zoltána"
 * -> „zolt", „na"), a novi klijent dobijao izmešano ime.
 * Slovo mora da ostane slovo da bi granice reči ostale iste.
 */
export const deburr = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\u0400-\u04ff]/g, (c) => CYRILLIC[c] ?? c)
    .replaceAll("đ", "dj")
    .replaceAll("ß", "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");


/**
 * Vokativ imena za obraćanje („Dobro jutro, Petre!").
 *
 * Slepo dodavanje „e" davalo je „Petare". Pravila srpskog, dovoljna za
 * uobičajena imena, uz kratak spisak izuzetaka gde pravilo ne važi:
 *  - samoglasnik na kraju (Marko, Đorđe, Luka, Ana, Jovana) ostaje — osim
 *    „-ica" → „-ice" (Milica → Milice, Jovica → Jovice);
 *  - nepostojano „a" (Petar → Petre, Aleksandar → Aleksandre) — izuzeci, jer
 *    Lazar → Lazare zadržava „a";
 *  - k/g/h → če/že/še (Vuk → Vuče, Predrag → Predraže);
 *  - š → še (Miloš → Miloše), ostali „meki" suglasnici (ć đ č ž j lj nj c) → u;
 *  - ostali suglasnici → e (Jovan → Jovane, Milan → Milane, Igor → Igore).
 * Ženska dvosložna imena na „-a" (Maja → Majo) namerno ostaju nepromenjena:
 * nominativ je uvek prihvatljiv, a pogrešan vokativ nije.
 * Radi samo nad prvom reči; prezime se ne menja.
 */
const VOCATIVE_EXCEPTIONS: Record<string, string> = {
  petar: "Petre",
  aleksandar: "Aleksandre",
  mitar: "Mitre",
  dimitar: "Dimitre",
};

export function vocative(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  if (!first) return "";
  const lower = first.toLowerCase();
  const fixed = VOCATIVE_EXCEPTIONS[lower];
  if (fixed) return matchCase(first, fixed);

  if (/[aeiou]$/.test(lower)) {
    if (lower.endsWith("ica")) return first.slice(0, -1) + "e";
    return first;
  }
  const last = lower.slice(-1);
  if (last === "k") return first.slice(0, -1) + "če";
  if (last === "g") return first.slice(0, -1) + "že";
  if (last === "h") return first.slice(0, -1) + "še";
  if (last === "š") return first + "e";
  if (/[ćđčžjc]$/.test(lower) || /(lj|nj)$/.test(lower)) return first + "u";
  return first + "e";
}

/** „PETAR" → „PETRE", „petar" → „petre", inače kako je u tabeli. */
function matchCase(source: string, target: string): string {
  if (source === source.toUpperCase()) return target.toUpperCase();
  if (source === source.toLowerCase()) return target.toLowerCase();
  return target;
}
