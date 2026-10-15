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
