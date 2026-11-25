// Slovník predmetov naprieč školami (beta): čo znamená skratka, keď ju škola nenapíše celú, a farba predmetu.
// - Niektoré školy majú v rozvrhu namiesto názvu len skratku („ANJ“). Ak tú istú skratku iné školy rovnakého stupňa
//   takmer vždy píšu jedným názvom, doplníme ho ako odhad (odhad: true); inak ostane skratka.
// - Farba patrí názvu predmetu, nie škole: rovnaký názov (bez ohľadu na veľké písmená a diakritiku) má na každej škole
//   rovnakú farbu. Farbu dostane len názov, ktorý používa aspoň MIN_SKOL škôl; poradie farieb je v data/predmety-farby.json
//   a len sa dopĺňa, takže sa farby pri obnove nepresúvajú.
import type { Skola } from "./typy";

/** Odhad názvu sa prijme, keď ho píše aspoň toľko škôl… */
export const MIN_SKOL = 5;
/** …a aspoň taký podiel škôl, ktoré pri tej skratke píšu nejaký názov. */
export const MIN_PODIEL = 0.8;

export const klucNazvu = (n: string) => n.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
const bezNazvu = (b: { predmet: string; skratka: string }) => klucNazvu(b.predmet) === klucNazvu(b.skratka);

type Pocty = Map<string, Map<string, Set<string>>>; // kľúč skratky → kľúč názvu → id škôl
export type Odhad = { nazov: string; skol: number; podiel: number };
export type Slovnik = { odhad: (stupen: string, skratka: string) => Odhad | null; tvary: Map<string, string>; skolPreNazov: Map<string, number> };

/** Zo všetkých škôl: pre každú skratku najčastejší názov a koľko škôl ho používa. */
export const slovnik = (skoly: Pick<Skola, "id" | "stupen" | "triedy">[]): Slovnik => {
  const poStupni = new Map<string, Pocty>();
  const tvaryPocet = new Map<string, Map<string, number>>(); // kľúč názvu → presný zápis → počet škôl
  const skolPreNazov = new Map<string, Set<string>>();
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
      (skolPreNazov.get(kn) ?? skolPreNazov.set(kn, new Set()).get(kn)!).add(s.id);
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
  return {
    // Najprv rovnaký stupeň (ZŠ a SŠ môžu tú istú skratku používať inak); keď tam údaje nestačia, všetky školy.
    odhad: (stupen, skratka) => {
      if ([...klucNazvu(skratka)].length < 2) return null; // „V“ či „M“ je príliš nejasné
      const v = vyber(poStupni.get(stupen), skratka);
      return v && v.skol >= MIN_SKOL ? ok(v) : ok(vyber(poStupni.get("*"), skratka));
    },
    tvary,
    skolPreNazov: new Map([...skolPreNazov].map(([k, v]) => [k, v.size])),
  };
};

/** 24 odtieňov po 15° v poradí, v ktorom je každý ďalší čo najďalej od už použitých; susedné odtiene majú
 *  rozdielnu svetlosť (t), takže aj blízke farby sa dajú rozoznať. Dostane ich 24 najčastejších predmetov. */
const SLOTY = (() => {
  const von = [0];
  while (von.length < 24) {
    let naj = -1, vzd = -1;
    for (let k = 0; k < 24; k++) {
      if (von.includes(k)) continue;
      const d = Math.min(...von.map((x) => Math.min(Math.abs(x - k), 24 - Math.abs(x - k))));
      if (d > vzd) { vzd = d; naj = k; }
    }
    von.push(naj);
  }
  return von;
})();
/** Farba i-teho predmetu v poradí: odtieň h (0–359) a tón t (0 svetlejší, 1 sýtejší). Ďalšie predmety zlatým uhlom. */
export const farba = (i: number) => (i < SLOTY.length ? { h: SLOTY[i]! * 15, t: SLOTY[i]! % 2 } : { h: Math.round((i * 137.508) % 360), t: i % 2 });

/** Doplní poradie farieb o nové názvy (podľa počtu škôl), staré nechá na mieste. */
export const doplnFarby = (poradie: string[], sl: Slovnik) => {
  const nove = [...sl.skolPreNazov].filter(([k, n]) => n >= MIN_SKOL && !poradie.includes(k)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return [...poradie, ...nove.map(([k]) => k)];
};

export type PredmetSkoly = { nazov?: string; odhad?: true; h?: number; t?: number };
/** Pre jednu školu: podľa textu predmetu z rozvrhu doplnený názov (odhad) a odtieň farby. */
export const predmetySkoly = (s: Pick<Skola, "stupen" | "triedy">, sl: Slovnik, farby: Map<string, number>) => {
  const von: Record<string, PredmetSkoly> = {};
  for (const t of s.triedy) for (const b of t.bloky) {
    if (!b.predmet || von[b.predmet]) continue;
    const o = bezNazvu(b) ? sl.odhad(s.stupen, b.skratka) : null;
    const nazov = o?.nazov ?? b.predmet;
    const i = farby.get(klucNazvu(nazov));
    const p: PredmetSkoly = { ...(o ? { nazov: o.nazov, odhad: true as const } : {}), ...(i !== undefined ? farba(i) : {}) };
    if (Object.keys(p).length) von[b.predmet] = p;
  }
  return von;
};
