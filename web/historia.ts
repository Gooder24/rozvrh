// Staršie verzie rozvrhu školy z archívu EduPage (data/historia, zbiera prieskum/historia.ts) pre výber verzie na
// stránke školy. Každá verzia prejde tým istým čistením mien ako dnešný rozvrh (bezMien vo web/data.ts) a rovnaké
// rozvrhy tried sa uložia raz: verzia drží len odkaz na rozvrh triedy, na zvonenie a na dni.
//   historiaSkoly(skoly, kontext) → Map<id školy, Historia>   (volá web/build.ts, zapíše /data/historia/<id>.json)
// Názvy verzií, ktoré si dala škola („Rozvrh počas PN …“), sa nepreberajú: verziu určujú len dátumy.
import { gunzipSync, gzipSync } from "node:zlib";
import { mkdir, rename } from "node:fs/promises";
import { bezMien, triedyZRaw, type KontextSkol } from "./data";
import type { Blok, Hodina, Skola, Trieda } from "./typy";
import type { Historia, KratkyBlok } from "./ui/verzie";
export type { Historia } from "./ui/verzie";

type Verzia = { tt_num: string; year: number; text: string; datefrom: string };
const DIR = "data/historia";
/** Medzivýsledok triedyZRaw každej verzie (pred čistením mien): archív sa nemení, tak sa surové JSON čítajú raz.
 *  Pri zmene triedyZRaw zvýš číslo, nech sa medzivýsledok prepočíta. */
const MEDZI = `${DIR}/triedy-v1`;

const rokText = (y: number) => `${y}/${String((y + 1) % 100).padStart(2, "0")}`;
const den = (iso: string, posun: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + posun * 864e5).toISOString().slice(0, 10);
/** Koniec platnosti z textu verzie, napr. „… (02. 09. - 10. 09. 2025)“ alebo „(11. 09. 2025 - 15. 05. 2026)“. Z textu
 *  sa berú len tieto dátumy. */
export const koniecZTextu = (text: string) => {
  const m = /(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})\s?\)\s*$/.exec(text);
  if (!m || !/\s-\s?\d/.test(text)) return null;
  const iso = `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
};

type Surova = { triedy: Trieda[]; dni: string[]; ucitelia: string[]; hodiny: Hodina[] };
async function surove(sub: string, verzie: Verzia[]): Promise<Map<string, Surova>> {
  const cesta = `${MEDZI}/${sub}.json.gz`;
  const ulozene: Record<string, Surova> = (await Bun.file(cesta).exists()) ? JSON.parse(gunzipSync(await Bun.file(cesta).arrayBuffer()).toString()) : {};
  let nove = false;
  for (const v of verzie) {
    if (ulozene[v.tt_num]) continue;
    const f = Bun.file(`${DIR}/raw/${sub}/${v.tt_num}.json.gz`);
    if (!(await f.exists())) continue;
    try {
      const r = triedyZRaw(gunzipSync(await f.arrayBuffer()).toString());
      ulozene[v.tt_num] = { ...r, ucitelia: [...r.ucitelia] };
      nove = true;
    } catch { /* pokazený súbor: verzia sa vynechá */ }
  }
  if (nove) {
    await mkdir(MEDZI, { recursive: true });
    await Bun.write(`${cesta}.tmp`, gzipSync(JSON.stringify(ulozene)));
    await rename(`${cesta}.tmp`, cesta);
  }
  return new Map(Object.entries(ulozene));
}

export async function historiaSkoly(skoly: Skola[], kontext: KontextSkol, dnes = new Date().toISOString().slice(0, 10)) {
  const zoznam = (await Bun.file(`${DIR}/verzie.json`).json().catch(() => ({}))) as Record<string, Verzia[]>;
  const von = new Map<string, Historia>();
  for (const s of skoly) {
    if (s.stav !== "verejny_rozvrh" || !s.edupage || !zoznam[s.edupage]) continue;
    // Viac verzií od toho istého dňa: platí posledná (najvyššie číslo), staršie sa nikdy nepoužili a adresa
    // (#trieda=…&od=dátum) musí určiť verziu jednoznačne.
    const podlaDna = new Map<string, Verzia>();
    for (const v of [...zoznam[s.edupage]!].sort((a, b) => Number(a.tt_num) - Number(b.tt_num)))
      if (/^\d{4}-\d{2}-\d{2}$/.test(v.datefrom) && v.datefrom <= dnes) podlaDna.set(v.datefrom, v);
    const vsetky = [...podlaDna.values()].sort((a, b) => a.datefrom.localeCompare(b.datefrom));
    // Dnešný rozvrh je verzia, ktorá platí od s.rozvrh.od; bez toho dátumu posledná, ktorá sa už začala.
    const od = s.rozvrh?.od;
    const dnesna = od ? vsetky.findLastIndex((v) => v.datefrom === od) : vsetky.length - 1;
    const starsie = dnesna >= 0 ? vsetky.slice(0, dnesna) : vsetky.filter((v) => !od || v.datefrom < od);
    if (!starsie.length) continue;
    const raw = await surove(s.edupage, starsie);
    const h: Historia = { verzie: [], texty: [], bloky: [], rozvrhy: [], hodiny: [], dni: [] };
    const idx = <T>(pole: T[], mapa: Map<string, number>, x: T) => {
      const k = JSON.stringify(x);
      let i = mapa.get(k);
      if (i === undefined) { i = pole.push(x) - 1; mapa.set(k, i); }
      return i;
    };
    const [mR, mH, mD, mB] = [new Map<string, number>(), new Map<string, number>(), new Map<string, number>(), new Map<string, number>()];
    const mT = new Map<string, number>();
    const text = (x: string | null) => {
      if (x === null) return -1;
      let i = mT.get(x);
      if (i === undefined) { i = h.texty.push(x) - 1; mT.set(x, i); }
      return i;
    };
    const kratky = (b: Blok): KratkyBlok => [b.den, text(b.hodina), b.trvanie, text(b.predmet), text(b.skratka), text(b.ucebna), text(b.skupina), text(b.tyzden)];
    const dalsia = (i: number) => (i + 1 < vsetky.length ? vsetky[i + 1]! : null);
    starsie.forEach((v, i) => {
      const r = raw.get(v.tt_num);
      if (!r || !r.triedy.length) return;
      // Čistenie mien: kópia školy s triedami tejto verzie; skratky učiteľov z verzie aj z dneška.
      const kopia: Skola = {
        ...s, triedy: structuredClone(r.triedy), zvonenie: { hodiny: structuredClone(r.hodiny), zdroj: "EduPage", url: "", predvolene: false },
        rozvrh: { nazov: null, od: v.datefrom, dni: [...r.dni], triedy: 0, ucebne: 0, lekcie: 0, karty: 0, dvojhodiny: 0 },
      };
      bezMien(kopia, { ucitelia: new Set([...r.ucitelia, ...(kontext.ucitelia.get(s.id) ?? [])]), vyskyt: kontext.vyskyt, nazvy: kontext.nazvy });
      const n = dalsia(i);
      const doText = koniecZTextu(v.text);
      const koniecRoka = `${v.year + 1}-06-30`;
      // Platí do dňa pred ďalšou verziou toho istého roka, inak do konca školského roka (alebo do dátumu z textu).
      const doDna = n && n.year === v.year ? den(n.datefrom, -1) : doText && doText >= v.datefrom && doText <= koniecRoka ? doText : koniecRoka;
      h.verzie.push({
        od: v.datefrom, do: doDna < v.datefrom ? v.datefrom : doDna, rok: rokText(v.year),
        hodiny: idx(h.hodiny, mH, kopia.zvonenie!.hodiny), dni: idx(h.dni, mD, kopia.rozvrh!.dni),
        triedy: kopia.triedy.map((t) => [t.nazov, idx(h.rozvrhy, mR, t.bloky.map((b) => idx(h.bloky, mB, kratky(b))))]),
      });
    });
    if (!h.verzie.length) continue;
    h.verzie.reverse();
    von.set(s.id, h);
  }
  return von;
}
