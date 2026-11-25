import type { Trieda } from "../typy";

// Farby predmetov: každý predmet má plnú farbu, v rozvrhu jednej triedy sa nezopakuje a vo všetkých triedach školy
// je rovnaká. Predmety, ktoré sa stretnú v niektorej triede, dostanú rôzne farby; častejšie predmety vyberajú prvé.
// Najprv Kellyho 22 farieb s najväčším vzájomným rozdielom (podobné žlté a fialové na konci poradia). Keď sú všetky
// obsadené (gymnáziá so seminármi, konzervatóriá), predmet dostane z ďalších odtieňov ten, ktorý sa najviac líši od
// farieb predmetov, s ktorými sa stretne. Písmo biele alebo tmavé, kontrast vždy aspoň 4,5 : 1.
export type Farba = { bg: string; fg: string };
const B = "#ffffff", T = "#14213d";
const KELLY = ["#F3C300", "#875692", "#F38400", "#A1CAF1", "#BE0032", "#C2B280", "#6E6E6C", "#007F50", "#E68FAC", "#0067A5", "#F99379",
  "#23305E", "#8DB600", "#B3446C", "#882D17", "#604E97", "#654522", "#2B3D26", "#00827F", "#C44715", "#F6A600", "#DCD300"];

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const jas = (hex: string) => { const [r, g, b] = rgb(hex).map(lin) as [number, number, number]; return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const kontrast = (a: string, b: string) => { const x = jas(a), y = jas(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** OKLab: vzdialenosť dvoch farieb zhruba tak, ako ju vidí oko. */
const oklab = (hex: string) => {
  const [r, g, b] = rgb(hex).map(lin) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s] as const;
};
export const rozdiel = (a: string, b: string) => { const x = oklab(a), y = oklab(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
const hex = (h: number, s: number, l: number) => {
  const a = s * Math.min(l, 1 - l), f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return `#${[f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
};
const sPismom = (bg: string): Farba | null => {
  const fg = kontrast(bg, B) >= kontrast(bg, T) ? B : T;
  return kontrast(bg, fg) >= 4.5 ? { bg, fg } : null;
};
export const KELLYHO = KELLY.map((bg) => { const f = sPismom(bg); if (!f) throw new Error(`farba ${bg} nemá čitateľné písmo`); return f; });
/** Ďalšie odtiene: každých 15° v štyroch svetlostiach, len tie, na ktorých je písmo čitateľné. */
export const DALSIE = Array.from({ length: 24 }, (_, i) => i * 15).flatMap((h) => [0.26, 0.38, 0.68, 0.82].map((l) => sPismom(hex(h, 0.62, l))))
  .filter((f): f is Farba => f !== null && KELLY.every((k) => rozdiel(k, f.bg) > 0.04));

const farbySkol = new WeakMap<Trieda[], Map<string, Farba>>();
/** Skratka predmetu → farba pre všetky triedy jednej školy. */
export const farbyPredmetov = (triedy: Trieda[]) => {
  const hotove = farbySkol.get(triedy);
  if (hotove) return hotove;
  const pocet = new Map<string, number>(), stretne = new Map<string, Set<string>>();
  for (const t of triedy) {
    const v = [...new Set(t.bloky.map((b) => b.skratka))];
    for (const b of t.bloky) pocet.set(b.skratka, (pocet.get(b.skratka) ?? 0) + 1);
    for (const a of v) { const z = stretne.get(a) ?? stretne.set(a, new Set()).get(a)!; for (const b of v) if (b !== a) z.add(b); }
  }
  const f = new Map<string, Farba>();
  for (const a of [...pocet.keys()].sort((x, y) => pocet.get(y)! - pocet.get(x)! || x.localeCompare(y, "sk"))) {
    const susedne = [...stretne.get(a)!].flatMap((b) => { const c = f.get(b); return c ? [c.bg] : []; });
    const kelly = KELLYHO.find((k) => !susedne.includes(k.bg));
    if (kelly) { f.set(a, kelly); continue; }
    // Všetkých 22 obsadených: odtieň s najväčším najmenším rozdielom od farieb susedných predmetov.
    let naj = DALSIE[0]!, najD = -1;
    for (const c of DALSIE) {
      const d = Math.min(...susedne.map((s) => rozdiel(s, c.bg)));
      if (d > najD) { naj = c; najD = d; }
    }
    f.set(a, naj);
  }
  farbySkol.set(triedy, f);
  return f;
};
