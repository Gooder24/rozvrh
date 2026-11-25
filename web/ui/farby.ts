import type { Trieda } from "../typy";

// Farby predmetov: každý predmet má plnú farbu, v rozvrhu jednej triedy sa nezopakuje a vo všetkých triedach školy
// je rovnaká (predmety, ktoré sa stretnú v niektorej triede, dostanú rôzne farby; častejšie predmety vyberajú prvé).
// Poradie je Kellyho 22 farieb s najväčším vzájomným rozdielom; písmo biele alebo tmavé, kontrast aspoň 4,5 : 1.
const T = "#14213d", B = "#fff";
export const FARBY = ([
  ["#F3C300", T], ["#875692", B], ["#F38400", T], ["#A1CAF1", T], ["#BE0032", B], ["#C2B280", T], ["#6E6E6C", B],
  ["#007F50", B], ["#E68FAC", T], ["#0067A5", B], ["#F99379", T], ["#604E97", B], ["#F6A600", T], ["#B3446C", B],
  ["#DCD300", T], ["#882D17", B], ["#8DB600", T], ["#654522", B], ["#C44715", B], ["#2B3D26", B], ["#00827F", B], ["#23305E", B],
] as const).map(([bg, fg]) => ({ bg, fg }));
const farbySkol = new WeakMap<Trieda[], Map<string, number>>();
/** Skratka predmetu → index do FARBY pre všetky triedy jednej školy. */
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
  const poradie = [...pocet.keys()].sort((x, y) => pocet.get(y)! - pocet.get(x)! || x.localeCompare(y, "sk"));
  for (const [k, a] of poradie.entries()) {
    const obsadene = new Set([...stretne.get(a)!].map((b) => f.get(b)));
    const volna = FARBY.findIndex((_, i) => !obsadene.has(i));
    // Viac než 22 predmetov, ktoré sa stretnú: farba sa zopakuje, ale ďaleko od seba v poradí.
    f.set(a, volna >= 0 ? volna : k % FARBY.length);
  }
  farbySkol.set(triedy, f);
  return f;
};
