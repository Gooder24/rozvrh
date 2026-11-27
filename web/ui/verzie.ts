// Staršie verzie rozvrhu školy, ako ich zapíše web/historia.ts do /data/historia/<id>.json a číta klient.ts.
import type { Blok, Hodina } from "../typy";

/** Jedna staršia verzia. `triedy`: [názov triedy, index do Historia.rozvrhy]. `hodiny` a `dni` sú indexy. */
export type VerziaRozvrhu = { od: string; do: string; rok: string; hodiny: number; dni: number; triedy: [string, number][] };
/** Blok v skratke: [deň, hodina, trvanie, predmet, skratka, učebňa, skupina, týždeň]; texty sú indexy do
 *  Historia.texty, -1 je prázdne. Každý blok školy je uložený raz, rozvrh triedy je zoznam indexov blokov. */
export type KratkyBlok = [den: number, hodina: number, trvanie: number, predmet: number, skratka: number, ucebna: number, skupina: number, tyzden: number];
/** Staršie verzie od najnovšej; dnešný rozvrh medzi nimi nie je (je v /data/skoly/<id>.json). */
export type Historia = { verzie: VerziaRozvrhu[]; texty: string[]; bloky: KratkyBlok[]; rozvrhy: number[][]; hodiny: Hodina[][]; dni: string[][] };

/** Rozvrh triedy z Historia späť na bloky (klient). */
export const rozbal = (h: Historia, rozvrh: number): Blok[] => (h.rozvrhy[rozvrh] ?? []).map((i) => {
  const [den, hodina, trvanie, predmet, skratka, ucebna, skupina, tyzden] = h.bloky[i]!;
  const t = (j: number) => (j < 0 ? null : h.texty[j] ?? null);
  return { den, hodina: t(hodina) ?? "", trvanie, predmet: t(predmet) ?? "", skratka: t(skratka) ?? "", ucebna: t(ucebna), skupina: t(skupina), tyzden: t(tyzden) };
});
