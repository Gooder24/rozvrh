// Čo sa v rozvrhu triedy zmenilo oproti predchádzajúcej verzii: hodina je miesto v týždni (deň, číslo hodiny, dĺžka,
// týždeň cyklu) a jej obsah (predmet, učebňa, skupina). Zmenené miesto sa v mriežke obtiahne, zrušené ukáže prerušovane.
import type { Blok } from "../typy";

const cislo = (n: string) => n.trim().replace(/\.$/, "");
export const miestoBloku = (b: Blok) => `${b.den}|${cislo(b.hodina)}|${Math.max(b.trvanie, 1)}|${b.tyzden ?? ""}`;
const obsah = (b: Blok) => `${b.skratka}|${b.predmet}|${b.ucebna ?? ""}|${b.skupina ?? ""}`;

const podlaMiesta = (bloky: Blok[]) => {
  const m = new Map<string, string[]>();
  for (const b of bloky) (m.get(miestoBloku(b)) ?? m.set(miestoBloku(b), []).get(miestoBloku(b))!).push(obsah(b));
  return new Map([...m].map(([k, v]) => [k, v.sort().join("\n")]));
};

/** `zmenene`: miesta, kde je teraz iná alebo nová hodina; `zrusene`: bloky staršej verzie na miestach, ktoré teraz
 *  ostali prázdne; `pocet`: koľko miest sa zmenilo spolu. */
export const porovnaj = (nove: Blok[], stare: Blok[]) => {
  const a = podlaMiesta(nove), b = podlaMiesta(stare);
  const zmenene = new Set([...a].filter(([k, v]) => b.get(k) !== v).map(([k]) => k));
  const zrusene = stare.filter((x) => !a.has(miestoBloku(x)));
  return { zmenene, zrusene, pocet: zmenene.size + new Set(zrusene.map(miestoBloku)).size };
};
