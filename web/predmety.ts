// Slovník predmetov naprieč školami (beta): čo znamená skratka, keď ju škola nenapíše celú.
// Niektoré školy majú v rozvrhu namiesto názvu len skratku („ANJ“). Ak tú istú skratku iné školy rovnakého stupňa
// takmer vždy píšu jedným názvom, doplníme ho ako odhad (odhad: true); inak ostane skratka.
import type { Skola } from "./typy";

/** Odhad názvu sa prijme, keď ho píše aspoň toľko škôl… */
export const MIN_SKOL = 5;
/** …a aspoň taký podiel škôl, ktoré pri tej skratke píšu nejaký názov. */
export const MIN_PODIEL = 0.8;

export const klucNazvu = (n: string) => n.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
const bezNazvu = (b: { predmet: string; skratka: string }) => klucNazvu(b.predmet) === klucNazvu(b.skratka);

type Pocty = Map<string, Map<string, Set<string>>>; // kľúč skratky → kľúč názvu → id škôl
export type Odhad = { nazov: string; skol: number; podiel: number };
export type Slovnik = { odhad: (stupen: string, skratka: string) => Odhad | null };

/** Zo všetkých škôl: pre každú skratku najčastejší názov a koľko škôl ho používa. */
export const slovnik = (skoly: Pick<Skola, "id" | "stupen" | "triedy">[]): Slovnik => {
  const poStupni = new Map<string, Pocty>();
  const tvaryPocet = new Map<string, Map<string, number>>(); // kľúč názvu → presný zápis → počet škôl
  for (const s of skoly) {
    const videne = new Set<string>();
    for (const t of s.triedy) for (const b of t.bloky) {
      if (!b.predmet || !b.skratka || bezNazvu(b)) continue;
      const kn = klucNazvu(b.predmet);
      for (const st of [s.stupen, "*"]) {
        const p = poStupni.get(st) ?? poStupni.set(st, new Map()).get(st)!;
        const m = p.get(klucNazvu(b.skratka)) ?? p.set(klucNazvu(b.skratka), new Map()).get(klucNazvu(b.skratka))!;
        (m.get(kn) ?? m.set(kn, new Set()).get(kn)!).add(s.id);
      }
      if (!videne.has(b.predmet)) {
        videne.add(b.predmet);
        const tv = tvaryPocet.get(kn) ?? tvaryPocet.set(kn, new Map()).get(kn)!;
        tv.set(b.predmet, (tv.get(b.predmet) ?? 0) + 1);
      }
    }
  }
  // Zobrazený tvar: najčastejší zápis, pri zhode ten s veľkým začiatočným písmenom.
  const tvary = new Map([...tvaryPocet].map(([k, m]) => [k, [...m].sort((a, b) => b[1] - a[1] || Number(/^\p{Lu}/u.test(b[0])) - Number(/^\p{Lu}/u.test(a[0])))[0]![0]]));
  const vyber = (p: Pocty | undefined, skratka: string): Odhad | null => {
    const m = p?.get(klucNazvu(skratka));
    if (!m) return null;
    const vsetky = new Set([...m.values()].flatMap((x) => [...x])).size;
    const [kn, sk] = [...m].sort((a, b) => b[1].size - a[1].size)[0]!;
    return { nazov: tvary.get(kn) ?? kn, skol: sk.size, podiel: sk.size / vsetky };
  };
  const ok = (o: Odhad | null) => (o && o.skol >= MIN_SKOL && o.podiel >= MIN_PODIEL ? o : null);
  const preStupen = (stupen: string, skratka: string) => {
    const v = vyber(poStupni.get(stupen), skratka);
    return v && v.skol >= MIN_SKOL ? ok(v) : ok(vyber(poStupni.get("*"), skratka));
  };
  return {
    // Najprv rovnaký stupeň (ZŠ a SŠ môžu tú istú skratku používať inak); keď tam údaje nestačia, všetky školy.
    // Keď ZŠ a SŠ tú skratku čítajú inak („TEC“: Technika / Technológia), odhad nedáme: spojená škola má v jednom
    // rozvrhu triedy oboch stupňov.
    odhad: (stupen, skratka) => {
      if ([...klucNazvu(skratka)].length < 2) return null; // „V“ či „M“ je príliš nejasné
      const z = preStupen("ZŠ", skratka), s = preStupen("SŠ", skratka);
      if (z && s && klucNazvu(z.nazov) !== klucNazvu(s.nazov)) return null;
      return stupen === "ZŠ" ? z : stupen === "SŠ" ? s : preStupen(stupen, skratka);
    },
  };
};

export type PredmetSkoly = { nazov: string; odhad: true };
/** Pre jednu školu: názvy doplnené podľa iných škôl tam, kde škola píše len skratku. */
export const predmetySkoly = (s: Pick<Skola, "stupen" | "triedy">, sl: Slovnik) => {
  const von: Record<string, PredmetSkoly> = {};
  for (const t of s.triedy) for (const b of t.bloky) {
    if (!b.predmet || von[b.predmet] || !bezNazvu(b)) continue;
    const o = sl.odhad(s.stupen, b.skratka);
    if (o) von[b.predmet] = { nazov: o.nazov, odhad: true };
  }
  return von;
};
