// Dvojtýždňový (a dlhší) rozvrh rozdelí na samostatné týždne, aby sa každý ukázal vo vlastnej tabuľke.
// Školy ho v EduPage zapisujú dvoma spôsobmi:
//  - cyklus 10 dní („Pondelok PT“ … „Piatok NT“, „P/Po“ … „N/Pia“, „Deň 1“ … „Deň 10“): týždeň je každých 5 dní;
//  - 5 dní a hodiny označené týždňom (Blok.tyzden „A“, „B“, „P“, „NT“, „A+C“): hodina bez označenia je v každom týždni.
import type { Blok } from "../typy";

export type Den = { nazov: string; bloky: Blok[] };
export type Tyzden = { nazov: string | null; dni: Den[] };

const PARNY = /^(?:p|pt|tp|par|pár|parny|párny|parna|párna|parne|párne)$/;
const NEPARNY = /^(?:n|nt|tn|nep|neparny|nepárny|neparna|nepárna|neparne|nepárne)$/;
const kluc = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

const RIMSKE: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4 };
/** Čitateľný názov týždňa z označenia školy: „PT“ → „Párny týždeň“, „2.t“ → „2. týždeň“, „A“ → „Týždeň A“. */
export const menoTyzdna = (x: string) => {
  const k = kluc(x), t = x.trim();
  if (NEPARNY.test(k) || /^nep[aá]r/.test(k)) return "Nepárny týždeň";
  if (PARNY.test(k) || /^p[aá]rn/.test(k)) return "Párny týždeň";
  // Štvortýždňový cyklus „PT 1“, „NT 2“.
  const pn = /^(pt|nt|p|n)(\d)$/.exec(k);
  if (pn) return `${pn[1]!.startsWith("p") ? "Párny" : "Nepárny"} týždeň ${pn[2]}`;
  // „2“, „2.t“, „2. cyk.“, „2 roz.“, „2.Týždeň“, „T2“, „II.“
  const c = /^(\d+)(?:t|tyzden|týždeň|cyk|roz)?$/.exec(k) ?? /^t(\d+)$/.exec(k);
  if (c) return `${Number(c[1])}. týždeň`;
  if (RIMSKE[k] && /^[IV]+\.?$/.test(t)) return `${RIMSKE[k]}. týždeň`;
  const p = /^t([A-Z])$/.exec(t);
  return `Týždeň ${p ? p[1] : t}`;
};
const poradie = (a: string) => { const m = menoTyzdna(a); return m.startsWith("Párny") ? 0 : m.startsWith("Nepárny") ? 1 : 2; };
/** Niektoré školy si týždňami v EduPage značia skupiny („sk.A“, „1.sk“, „A (PVC)“, „VanOsztf“). */
export const jeSkupina = (t: string) => /(?:^|[^\p{L}])sk|osztf|\(/iu.test(t);
/** Atómové týždne jednej hodiny: „A+C“ je v týždni A aj C. */
const tyzdneBloku = (t: string) => t.split(/[+,]/).map((x) => x.trim()).filter(Boolean);

const DNI: [RegExp, string][] = [
  [/^(?:pondelok|po)$/, "Pondelok"], [/^(?:utorok|ut)$/, "Utorok"], [/^(?:streda|st|str)$/, "Streda"],
  [/^(?:štvrtok|štvtok|št|štv)$/, "Štvrtok"], [/^(?:piatok|pi|pia)$/, "Piatok"], [/^(?:sobota|so)$/, "Sobota"], [/^(?:nedeľa|ne)$/, "Nedeľa"],
];
/** „Párna streda“ → deň „Streda“ a zvyšok „Párna“; „Deň 3“ deň nemá. */
const rozober = (nazov: string) => {
  const slova = nazov.split(/[\s/()\-–,.]+/).filter(Boolean);
  for (const [i, s] of slova.entries()) {
    const d = DNI.find(([re]) => re.test(s.toLowerCase()));
    if (d) return { den: d[1], zvysok: slova.filter((_, j) => j !== i).join(" ") };
  }
  // „Pondelok1“: deň a číslo týždňa bez medzery.
  const m = /^(\p{L}+?)(\d+)$/u.exec(nazov.trim());
  const d = m && DNI.find(([re]) => re.test(m[1]!.toLowerCase()));
  return d && m ? { den: d[1], zvysok: m[2]! } : null;
};

/** dni: názvy dní z rozvrhu školy; bloky: hodiny jednej triedy. Jeden prvok = jedna tabuľka. */
export const tyzdne = (dni: string[], bloky: Blok[]): Tyzden[] => {
  const pocet = Math.max(dni.length, ...bloky.map((b) => b.den + 1));
  const den = (i: number, b: Blok[]) => ({ nazov: dni[i]?.trim() || `Deň ${i + 1}`, bloky: b.filter((x) => x.den === i) });
  if (dni.length > 5 && dni.length % 5 === 0 && pocet === dni.length) {
    return Array.from({ length: dni.length / 5 }, (_, t) => {
      const cast = Array.from({ length: 5 }, (_, i) => den(t * 5 + i, bloky));
      const r = cast.map((d) => rozober(d.nazov));
      const mena = r.map((x) => (x?.zvysok ? menoTyzdna(x.zvysok) : null));
      // Názov týždňa, keď ho dni nesú zhodne (stačí aj len niektoré dni, napr. „Pondelok PT“, „Utorok“ …).
      const roz = [...new Set(mena.filter((m) => m !== null))];
      const spolocne = roz.length === 1 && (!roz[0]!.startsWith("Týždeň ") || /^Týždeň [A-Z]$/.test(roz[0]!)) ? roz[0] : null;
      return {
        nazov: spolocne ?? `${t + 1}. týždeň`,
        dni: r.every(Boolean) ? cast.map((d, i) => ({ ...d, nazov: r[i]!.den })) : cast,
      };
    });
  }
  const oznacene = [...new Set(bloky.flatMap((b) => (b.tyzden ? tyzdneBloku(b.tyzden) : [])))]
    .sort((a, b) => poradie(a) - poradie(b) || a.localeCompare(b, "sk", { numeric: true }));
  // Skupiny zapísané ako týždne sa nedelia, ostanú pri hodine.
  if (oznacene.length < 2 || oznacene.some(jeSkupina)) return [{ nazov: null, dni: Array.from({ length: pocet }, (_, i) => den(i, bloky)) }];
  return oznacene.map((t) => {
    const v = bloky.filter((b) => !b.tyzden || tyzdneBloku(b.tyzden).includes(t)).map((b) => ({ ...b, tyzden: null }));
    return { nazov: menoTyzdna(t), dni: Array.from({ length: pocet }, (_, i) => den(i, v)) };
  });
};
