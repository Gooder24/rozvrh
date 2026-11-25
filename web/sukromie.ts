// Mená ľudí z názvov skupín, učební, tried a predmetov, ktoré školy píšu do EduPage
// („Janko Hraško“, „I.A - Mgr. Jana Vzorná“, „ANJ Vzorová“). Na web nesmú. Príklady v kóde a testoch sú vymyslené.
// Radšej zahodí aj nevinný názov (blok ostane bez skupiny, trieda dostane krátky názov), ako by pustil meno.
import { KRATKE, KRSTNE, PRIEZVISKA } from "./krstne";

/** Anglické názvy jazykov, ktoré sú zároveň priezviskami. */
const JAZYKY = new Set(["Slovak"]);

export const zlozene = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const slova = (s: string) => s.split(/[^\p{L}]+/u).filter(Boolean);

const TITUL = /(?:^|[^\p{L}])(?:(?:Mgr|Ing|Bc|Dr|Doc|Prof|Akad|Ph|Th)\.|(?:PaedDr|RNDr|PhDr|MUDr|JUDr|ThDr|ThLic|PharmDr|MVDr|ArtD|PhD|CSc|MBA|DiS)(?![\p{L}]))/iu;

/** Kontext školy: skratky jej učiteľov (EduPage teachers.short) a koľko škôl používa ktoré slovo. */
export type Kontext = { ucitelia: Set<string>; vyskyt: Map<string, number> };
export const ZRIEDKAVE = 3; // slovo z 4+ písmen, ktoré má menej škôl, môže byť priezvisko

/** Dôvod, prečo text môže obsahovať meno, alebo null. `prisne`: aj zriedkavé slová (skupiny, učebne, triedy).
 *  `kratke`: aj dvoj- a trojpísmenové skratky mien (skupiny a učebne; v triedach sú to kódy odborov ako „I.GA“). */
export function meno(text: string, k: Kontext, prisne: boolean, kratke = false): string | null {
  if (TITUL.test(text)) return "titul";
  // Iniciály: „J.H.“, „J.M.Hraško“, „J. Hraško“, „Hraško J.“. Nie rímska trieda „II.A“ (bez bodky na konci:
  // „I.K.“ sú iniciály) ani učebňa triedy „U.V.A“.
  const t = text.trim();
  if (!/^[IVX]+\.\s?\p{Lu}$/u.test(t) && !/^U\.\s?[IVX]+\.\s?\p{Lu}$/u.test(t) && (/\p{Lu}\p{Ll}?\.\s?\p{Lu}\p{Ll}?\./u.test(text) || /(?:^|[^\p{L}])\p{Lu}\.\s?\p{Lu}\p{Ll}{2,}/u.test(text) || /\p{Lu}\p{Ll}{2,}\s\p{Lu}\.(?!\p{L})/u.test(text))) return "iniciály";
  // Bez počtov výskytu (k.vyskyt prázdne, poistka pri zostavení) sa pravidlá o zriedkavých slovách nepoužijú.
  const zriedkave = (z: string) => k.vyskyt.size > 0 && (k.vyskyt.get(z) ?? 0) < ZRIEDKAVE;
  const w = slova(text);
  for (let i = 0; i < w.length; i++) {
    const z = zlozene(w[i]!);
    // Krátke mená (Ema, Ján) len s veľkým začiatočným písmenom: EMA, ETV a podobné sú skratky predmetov.
    if (KRATKE.has(z) && /^\p{Lu}\p{Ll}+$/u.test(w[i]!)) return `krstné meno ${w[i]}`;
    // Skratky učiteľov školy („INF LAC“, „TSV_GAL“; v skupinách, učebniach a triedach aj dvojpísmenové „IB.PA“)
    // a časté priezviská („Novák“; anglické „IB Slovak“ je jazyk).
    // Len slovo s veľkým písmenom: „1.sk“ či „nem“ sú bežné slová, nie skratka učiteľa „SK“.
    if ((z.length >= 3 || (kratke && z.length === 2 && !/^[IVX]+$/.test(w[i]!))) && /\p{Lu}/u.test(w[i]!) && k.ucitelia.has(z)) return `učiteľ ${w[i]}`;
    if (z.length >= 3 && PRIEZVISKA.has(z) && !JAZYKY.has(w[i]!)) return `priezvisko ${w[i]}`;
    // Skupina pomenovaná začiatkom priezviska („ANJ Hra“, „Hra skupina“) alebo iniciálami žiaka („VJ“), ktoré má len pár škôl.
    if (kratke && (/^\p{Lu}\p{Ll}{2}$/u.test(w[i]!) || (/^\p{Lu}{2}$/u.test(w[i]!) && !/^[IVX]+$/.test(w[i]!))) && zriedkave(z)) return `skratka mena ${w[i]}`;
    if (z.length < 4) continue;
    if (KRSTNE.has(z)) return `krstné meno ${w[i]}`;
    // Ženské priezvisko: -ová na konci alebo pred skratkou („ANJ Vzorová“, „6.roč.-VZOROVÁ“, „Vzorová sk.“),
    // alebo od častého priezviska („Nováková“). Prídavné meno (Športová príprava, TELESNÁ A ŠPORTOVÁ VÝCHOVA)
    // stojí pred slovom od 4 písmen a má ho viac škôl.
    if (/ová$/i.test(w[i]!)) {
      const kmen = z.slice(0, -3);
      if (PRIEZVISKA.has(kmen) || PRIEZVISKA.has(kmen.replace(/k$/, "")) || !w[i + 1] || w[i + 1]!.length < 4 || zriedkave(z)) return `priezvisko ${w[i]}`;
    }
    if (/ova$/i.test(w[i]!) && zriedkave(z)) return `priezvisko ${w[i]}`;
    if (prisne && zriedkave(z)) return `zriedkavé slovo ${w[i]}`;
    // „Janko Hraško“ ako predmet: dve slová s veľkým písmenom, druhé zriedkavé.
    if (i && /^\p{Lu}\p{Ll}+$/u.test(w[i - 1]!) && /^\p{Lu}\p{Ll}+$/u.test(w[i]!) && zriedkave(z)) return `meno a priezvisko ${w[i - 1]} ${w[i]}`;
  }
  return null;
}

/** Predmety a triedy žiakov so špeciálnymi potrebami: tam je skupina takmer vždy konkrétne dieťa. */
export const SPECIALNE = /rozv[ií]janie|logoped|individu[aá]ln|terap|intervenc|korek[cč]n|kompenza[cč]n|ŠVVP|\bIVP\b|\baut\b|autis|špec|variant|integr|(?:^|[^\p{L}])(?:ŠT|ŠPT|ST)(?![\p{L}])/iu;

/** Riadiace znaky preč, medzery zlúčené, dĺžka obmedzená. */
export const cisty = (s: string, max: number) => s.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** Názov triedy bez mena: najprv časť pred „ - “, „,“, „(“; keď ani tá nie je čistá, náhradný názov. */
export function nazovTriedy(nazov: string, k: Kontext, nahradny: string) {
  const n = cisty(nazov, 40);
  // Pseudotrieda asistenta alebo učiteľa: „Hb“, „MF PA“ (začína skratkou učiteľa).
  const prva = zlozene(n.split(/[.\s]/)[0]!);
  if (prva.length >= 2 && !/^[ivx]+$/.test(prva) && k.ucitelia.has(prva)) return nahradny;
  // „IB.PA“: iniciály a pedagogický asistent (trieda „I.GA“ či „II.SZ“ začína rímskym číslom).
  if (/^(?![IVX]+\.)\p{Lu}{2,3}\.\p{Lu}{1,3}$/u.test(n)) return nahradny;
  if (!meno(n, k, true)) return n;
  const predok = n.split(/\s+[-–—]\s*|\s*[,(;/]\s*/)[0]!.trim();
  return predok && !meno(predok, k, true) ? predok : nahradny;
}
