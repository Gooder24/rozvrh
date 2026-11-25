import type { Trieda } from "../typy";

// Farby predmetov: každý predmet má plnú farbu, v rozvrhu jednej triedy sa nezopakuje a vo všetkých triedach školy
// je rovnaká. Predmety, ktoré sa stretnú v niektorej triede, dostanú rôzne farby; častejšie predmety vyberajú prvé.
// Prvých 22 je Kellyho farby s najväčším vzájomným rozdielom, zoradené tak, aby si podobné (žlté, fialové) boli
// v poradí ďaleko; škola, ktorá ich potrebuje viac, dostane ďalšie vypočítané. Písmo biele alebo tmavé, kontrast
// aspoň 4,5 : 1.
const T = "#14213d", B = "#fff";
export const FARBY = ([
  ["#F3C300", T], ["#875692", B], ["#F38400", T], ["#A1CAF1", T], ["#BE0032", B], ["#C2B280", T], ["#6E6E6C", B],
  ["#007F50", B], ["#E68FAC", T], ["#0067A5", B], ["#F99379", T], ["#23305E", B], ["#8DB600", T], ["#B3446C", B],
  ["#882D17", B], ["#604E97", B], ["#654522", B], ["#2B3D26", B], ["#00827F", B], ["#C44715", B], ["#F6A600", T], ["#DCD300", T],
] as const).map(([bg, fg]) => ({ bg, fg }));

/** i-ta farba: z FARBY, potom odtiene po zlatom uhle striedavo tmavé (biele písmo) a svetlé (tmavé písmo). */
export const farba = (i: number) => {
  const k = FARBY[i];
  if (k) return k;
  const j = i - FARBY.length, tmava = j % 2 === 0;
  return { bg: `hsl(${Math.round((j * 137.508 + 20) % 360)} 55% ${tmava ? 30 : 76}%)`, fg: tmava ? B : T };
};

const farbySkol = new WeakMap<Trieda[], Map<string, number>>();
/** Skratka predmetu → číslo farby (pre farba()) pre všetky triedy jednej školy. */
export const farbyPredmetov = (triedy: Trieda[]) => {
  const hotove = farbySkol.get(triedy);
  if (hotove) return hotove;
  const pocet = new Map<string, number>(), stretne = new Map<string, Set<string>>();
  for (const t of triedy) {
    const v = [...new Set(t.bloky.map((b) => b.skratka))];
    for (const b of t.bloky) pocet.set(b.skratka, (pocet.get(b.skratka) ?? 0) + 1);
    for (const a of v) { const z = stretne.get(a) ?? stretne.set(a, new Set()).get(a)!; for (const b of v) if (b !== a) z.add(b); }
  }
  const f = new Map<string, number>();
  for (const a of [...pocet.keys()].sort((x, y) => pocet.get(y)! - pocet.get(x)! || x.localeCompare(y, "sk"))) {
    const obsadene = new Set([...stretne.get(a)!].map((b) => f.get(b)));
    let i = 0;
    while (obsadene.has(i)) i++;
    f.set(a, i);
  }
  farbySkol.set(triedy, f);
  return f;
};
