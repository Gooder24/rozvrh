// Údaje pre web a API: z výsledkov prieskumu (data/prieskum, data/zs/prieskum) a surových rozvrhov (data/raw).
// Do webu nejde nič o ľuďoch: ani skratky učiteľov, ani žiaci, len predmety, učebne, skupiny a časy.
// Mená, ktoré školy píšu do názvov skupín, učební a tried, odstráni web/sukromie.ts.
import { gunzipSync } from "node:zlib";
import { readdir } from "node:fs/promises";
import * as XLSX from "xlsx";

import { celaObec } from "./obce";
import { cisty, meno, nazovTriedy, SPECIALNE, zlozene, type Kontext } from "./sukromie";
import type { Blok, Hodina, Skola, SkolaKratko, Stav, Trieda } from "./typy";
export type * from "./typy";

type Vysledok = {
  eduid: string; web: string | null; skontrolovane: string; rozvrh_stav: string;
  edupage?: { sub: string }; zvonenie?: { hodiny: Hodina[]; zdroj: string; url: string; predvolene?: boolean };
  rozvrh?: { nazov: string | null; od: string | null; dni: number; triedy: number; ucebne: number; lekcie: number; karty: number; dvojhodiny: number };
};
type Reg = { eduid: string; nazov: string; typ: string; druh: string; kraj: string; okres: string; miesto: string; ulica: string; psc: string; web: string | null; zriadovatel: string; ziaci: number };
type Row = Record<string, unknown>;

export const slug = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

async function ciselnik(harok: string) {
  const wb = XLSX.read(await Bun.file("data/register/Ciselniky.xlsx").arrayBuffer());
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[harok]!, { header: 1, raw: false });
  return new Map(rows.filter((r) => r[0] && r[1]).map((r) => [String(r[0]).trim(), String(r[1]).trim()]));
}

/** Rozvrhy tried zo surových dát EduPage, bez osôb. `ucitelia`: slová zo skratiek učiteľov, len na hľadanie mien.
 *  `hodiny`: zvonenie podľa rozvrhu (číslo hodiny a časy), pre staršie verzie, ktoré majú iné zvonenie ako dnes. */
export function triedyZRaw(raw: string): { triedy: Trieda[]; dni: string[]; ucitelia: Set<string>; hodiny: Hodina[] } {
  const tables = (JSON.parse(raw) as { r: { dbiAccessorRes: { tables: { id: string; data_rows: Row[] }[] } } }).r.dbiAccessorRes.tables;
  const T = Object.fromEntries(tables.map((t) => [t.id, t.data_rows]));
  const podla = (t: string) => new Map((T[t] ?? []).map((r) => [String(r.id), r]));
  const [predmety, ucebne, skupiny, lekcie, periody, tyzdne] = ["subjects", "classrooms", "groups", "lessons", "periods", "weeks"].map(podla);
  const dni = (T.days ?? []).map((d) => String(d.name));
  const triedy = (T.classes ?? []).map((c) => ({ id: String(c.id), nazov: String(c.name ?? c.short), bloky: [] as Blok[] }));
  const triedaPodla = new Map(triedy.map((t) => [t.id, t]));
  const vsetkyTyzdne = (T.weeks ?? []).length <= 1;
  for (const k of T.cards ?? []) {
    const l = lekcie!.get(String(k.lessonid));
    const den = String(k.days ?? "").indexOf("1");
    if (!l || den < 0 || !k.period) continue;
    const p = predmety!.get(String(l.subjectid));
    const ucebna = ((k.classroomids ?? []) as string[]).map((id) => ucebne!.get(id)).filter(Boolean)[0];
    const tyzdenMaska = String(k.weeks ?? "");
    const tyzden = vsetkyTyzdne || !/0/.test(tyzdenMaska) ? null
      : [...tyzdenMaska].map((b, i) => b === "1" ? String([...tyzdne!.values()][i]?.short ?? i + 1) : "").filter(Boolean).join("+") || null;
    for (const cid of (l.classids ?? []) as string[]) {
      const t = triedaPodla.get(cid);
      if (!t) continue;
      const sk = ((l.groupids ?? []) as string[]).map((g) => skupiny!.get(g)).find((g) => g && g.classid === cid);
      t.bloky.push({
        den, hodina: String(periody!.get(String(k.period))?.period ?? k.period), trvanie: Number(l.durationperiods) || 1,
        predmet: String(p?.name ?? "?"), skratka: String(p?.short ?? p?.name ?? "?"),
        ucebna: ucebna ? String(ucebna.short || ucebna.name) : null,
        skupina: sk && !sk.entireclass ? String(sk.name) : null, tyzden,
      });
    }
  }
  for (const t of triedy) t.bloky.sort((a, b) => a.den - b.den || Number(a.hodina) - Number(b.hodina) || a.predmet.localeCompare(b.predmet));
  // Skratka učiteľa, ktorá je zároveň skratkou predmetu školy (učiteľ „MAT“ aj predmet „MAT“), meno neprezradí.
  const kody = (t: string, pole: string) => (T[t] ?? []).flatMap((r) => String(r[pole] ?? "").split(/[^\p{L}]+/u)).map(zlozene);
  const predmetove = new Set(kody("subjects", "short"));
  // Skratka „PriezviskoM“ dáva aj iniciály „PM“ a „MP“ (skupina „ANJ_PM“), „HraM“ aj „Hra“ (skupina „anj hra“).
  const inicialy = (T.teachers ?? []).flatMap((u) => {
    const casti = String(u.short ?? "").match(/\p{Lu}\p{Ll}*/gu) ?? [];
    return casti.length === 2 ? [casti.map((c) => c[0]).join(""), casti.map((c) => c[0]).reverse().join(""), ...casti.filter((c) => c.length >= 3)].map(zlozene) : [];
  });
  const ucitelia = new Set([...kody("teachers", "short"), ...inicialy].filter((x) => x.length >= 2 && !predmetove.has(x)));
  const cas = /^([01]\d|2[0-3]):[0-5]\d$/;
  const hodiny = (T.periods ?? []).map((p) => ({ n: cisty(String(p.period ?? p.short ?? ""), 12), od: String(p.starttime ?? "").padStart(5, "0"), do: String(p.endtime ?? "").padStart(5, "0") }))
    .filter((h) => h.n && cas.test(h.od) && cas.test(h.do) && h.od < h.do);
  return { triedy: triedy.filter((t) => t.bloky.length).map(({ nazov, bloky }) => ({ nazov, bloky })), dni, ucitelia, hodiny };
}

/** Odkaz na cudzí web len ako http(s); z „a.sk, b.sk“ prvý, bez schémy doplní https://. */
export function bezpecnaUrl(raw: string | null | undefined): string | null {
  const prva = (raw ?? "").split(/[\s,;]+/).find((a) => /\./.test(a));
  if (!prva) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(prva) ? prva : `https://${prva}`);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".") ? u.href : null;
  } catch { return null; }
}

/** Mená von zo všetkých textov školy, ktoré prišli z EduPage. */
export function bezMien(skola: Skola, k: KontextMien) {
  const pouzite = new Set<string>();
  const bezPoctov = { ucitelia: k.ucitelia, vyskyt: new Map<string, number>() };
  // Skupina alebo učebňa, ktorú tak volá len pár škôl, so začiatkom priezviska („ANJ Hr“, „Hra skupina“)
  // alebo iniciálami („PS“, kým „CH“ či „NJ“ má veľa škôl).
  // Učebne z dvoch veľkých písmen („KS“, „PM“) sú bežné označenia miestností, tie ostanú.
  const skratkaMena = (x: string, druh: "s" | "u") => {
    const t = x.trim(), inicialy = druh === "s" && /^\p{Lu}{2}$/u.test(t) && !/^[IVX]+$/.test(t);
    // Aj dve veľké písmená vnútri zriedkavého názvu skupiny („XY skupina“ vedľa „Hra skupina“)
    // a trojpísmenové slovo za skratkou predmetu („anj hra“, „SED vzo“).
    const vnutri = (y: string, i: number) => /^\p{Lu}\p{Ll}{1,2}$/u.test(y)
      || (druh === "s" && ((/^\p{Lu}{2}$/u.test(y) && !/^[IVX]+$/.test(y)) || (i > 0 && /^\p{L}{3}$/u.test(y))));
    return (k.nazvy.get(`${druh}:${t}`) ?? 0) < (inicialy ? 5 : 3) && (inicialy || t.split(/[^\p{L}]+/u).filter(Boolean).some(vnutri));
  };
  // Špeciálne a praktické školy: skupiny bývajú jednotlivé deti (aj len iniciály), nezverejňujú sa vôbec.
  const specialnaSkola = /špeciáln|internátn|praktick|pre žiakov s|pre deti s/i.test(`${skola.nazov} ${skola.druh} ${skola.typ}`);
  skola.triedy = skola.triedy.map((t, i) => {
    // „V.ST“ v ZŠ je špeciálna trieda; „II.ST“ v SOŠ je stavebníctvo.
    const specialnaTrieda = specialnaSkola || SPECIALNE.test(t.nazov) || (skola.stupen === "ZŠ" && /(?:^|[^\p{L}])ST[AB]?(?![\p{L}])/u.test(t.nazov));
    let nazov = nazovTriedy(t.nazov, k, `Trieda ${i + 1}`);
    if (pouzite.has(nazov)) nazov = `${nazov} (${i + 1})`;
    pouzite.add(nazov);
    return {
      nazov, bloky: t.bloky.map((b) => {
        // V špeciálnej triede býva aj „predmet“ meno dieťaťa (individuálny plán): prísne aj tam.
        const skratka = meno(b.skratka, k, specialnaTrieda) ? "?" : cisty(b.skratka, 20);
        return {
          ...b, skratka,
          predmet: meno(b.predmet, k, specialnaTrieda) ? skratka : cisty(b.predmet, 100),
          ucebna: b.ucebna && !meno(b.ucebna, k, true) && !skratkaMena(b.ucebna, "u") ? cisty(b.ucebna, 40) : null,
          skupina: b.skupina && !specialnaTrieda && !SPECIALNE.test(b.predmet) && !meno(b.skupina, k, true, true) && !skratkaMena(b.skupina, "s")
            ? cisty(b.skupina, 40) : null,
          tyzden: b.tyzden && !meno(b.tyzden, bezPoctov, false) ? cisty(b.tyzden, 20) : null,
        };
      }),
    };
  });
  // Dni a hodiny pomenúva škola tiež sama („Deň 1“, „Párny pondelok“, „Pondelok - Hétfő“); s menom dostanú poradové
  // číslo. Bez pravidiel o zriedkavých slovách (bezPoctov): názvy dní sú zriedkavé, ale mená nie sú.
  if (skola.rozvrh) skola.rozvrh.dni = skola.rozvrh.dni.map((d, i) => (meno(d, bezPoctov, false) ? `Deň ${i + 1}` : cisty(d, 30)));
  if (skola.zvonenie) skola.zvonenie.hodiny = skola.zvonenie.hodiny.map((h, i) => (meno(h.n, bezPoctov, false) ? { ...h, n: String(i + 1) } : h));
  if (skola.rozvrh?.nazov && meno(skola.rozvrh.nazov, k, true)) skola.rozvrh.nazov = null;
  else if (skola.rozvrh?.nazov) skola.rozvrh.nazov = cisty(skola.rozvrh.nazov, 80);
}

export type KontextMien = Kontext & { nazvy: Map<string, number> };
/** Počty výskytu slov a názvov naprieč školami (z dnešných rozvrhov) a skratky učiteľov každej školy:
 *  podľa nich bezMien() čistí aj staršie verzie rozvrhov (web/historia.ts). */
export type KontextSkol = { vyskyt: Map<string, number>; nazvy: Map<string, number>; ucitelia: Map<string, Set<string>> };

export const nacitajSkoly = async () => (await nacitajSkolyAKontext()).skoly;
export async function nacitajSkolyAKontext(): Promise<{ skoly: Skola[]; kontext: KontextSkol }> {
  const okresy = await ciselnik("Okres");
  const druhy = await ciselnik("Druh školy");
  // Školy, ktoré si neželajú byť v prehľade: data/vyradene.json { eduid: dôvod }.
  const vyradene = (await Bun.file("data/vyradene.json").json().catch(() => ({}))) as Record<string, string>;
  const skoly: Skola[] = [];
  const ucitelia = new Map<string, Set<string>>();
  const pouziteSlugy = new Set<string>();
  for (const [stupen, reg, dir] of [["SŠ", "data/skoly-register.json", "data/prieskum"], ["ZŠ", "data/zs/skoly-register.json", "data/zs/prieskum"]] as const) {
    const register = (await Bun.file(reg).json()) as Reg[];
    const subory = new Set(await readdir(dir));
    for (const r of register) {
      if (!subory.has(`${r.eduid}.json`) || !/^\d{6,12}$/.test(r.eduid) || vyradene[r.eduid]) continue;
      const v = (await Bun.file(`${dir}/${r.eduid}.json`).json()) as Vysledok;
      const zv = v.zvonenie && !v.zvonenie.predvolene ? v.zvonenie : null;
      const stav: Stav = v.rozvrh_stav === "verejny" ? "verejny_rozvrh" : zv ? "len_zvonenie" : "nenajdene";
      // Chybné riadky zo zdrojov (00:00–00:00, 31:45, koniec pred začiatkom) sa vynechajú, názvy hodín sa dekódujú.
      if (zv) zv.hodiny = zv.hodiny.filter((h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h.od) && /^([01]\d|2[0-3]):[0-5]\d$/.test(h.do) && h.od < h.do)
        .map((h) => ({ ...h, n: cisty(/\\[u\/"\\]/.test(h.n) ? (() => { try { return JSON.parse(`"${h.n}"`) as string; } catch { return h.n; } })() : h.n, 12) }));
      const pouzite = zv ? zv.hodiny.filter((h) => h.pouzita !== false) : [];
      let triedy: Trieda[] = [];
      let dni: string[] = [];
      let uc = new Set<string>();
      const sub = v.edupage?.sub ?? null;
      if (stav === "verejny_rozvrh" && sub && (await Bun.file(`data/raw/${sub}.json.gz`).exists())) {
        ({ triedy, dni, ucitelia: uc } = triedyZRaw(gunzipSync(await Bun.file(`data/raw/${sub}.json.gz`).arrayBuffer()).toString()));
      }
      const miesto = celaObec(r.miesto);
      let s = slug(`${r.nazov} ${miesto}`);
      if (pouziteSlugy.has(s)) s = `${s}-${r.eduid}`;
      pouziteSlugy.add(s);
      skoly.push({
        id: r.eduid, slug: s, nazov: r.nazov, stupen, typ: r.typ, druh: druhy.get(r.druh) ?? r.druh,
        kraj: r.kraj, okres: okresy.get(r.okres) ?? r.okres, miesto, mestoSlug: slug(miesto),
        zriadovatel: r.zriadovatel, ziaci: r.ziaci, stav, edupage: sub,
        zaciatok: pouzite[0]?.od ?? null, koniec: pouzite.at(-1)?.do ?? null, pocetHodin: pouzite.length || null,
        ulica: r.ulica, psc: r.psc, web: bezpecnaUrl(r.web),
        zvonenie: zv ? { hodiny: zv.hodiny, zdroj: zv.zdroj, url: bezpecnaUrl(zv.url) ?? "", predvolene: false } : null,
        rozvrh: stav === "verejny_rozvrh" && v.rozvrh ? {
          nazov: v.rozvrh.nazov, od: v.rozvrh.od, dni, triedy: v.rozvrh.triedy, ucebne: v.rozvrh.ucebne,
          lekcie: v.rozvrh.lekcie, karty: v.rozvrh.karty, dvojhodiny: v.rozvrh.dvojhodiny,
        } : null,
        triedy, skontrolovane: v.skontrolovane,
      });
      ucitelia.set(r.eduid, uc);
    }
  }
  // V koľkých školách sa slovo objaví v názve skupiny, učebne, triedy alebo predmetu: priezvisko býva len v jednej-dvoch.
  const vyskyt = new Map<string, number>();
  for (const s of skoly) {
    const w = new Set<string>();
    for (const t of s.triedy) for (const x of [t.nazov, ...t.bloky.flatMap((b) => [b.skupina ?? "", b.ucebna ?? "", b.predmet])])
      for (const y of x.split(/[^\p{L}]+/u)) w.add(zlozene(y));
    for (const y of w) vyskyt.set(y, (vyskyt.get(y) ?? 0) + 1);
  }
  // V koľkých školách sa celý názov skupiny („s:…“) alebo učebne („u:…“) objaví presne tak.
  const nazvy = new Map<string, number>();
  for (const s of skoly) for (const n of new Set(s.triedy.flatMap((t) => t.bloky.flatMap((b) => [`s:${b.skupina?.trim() ?? ""}`, `u:${b.ucebna?.trim() ?? ""}`])))) nazvy.set(n, (nazvy.get(n) ?? 0) + 1);
  for (const s of skoly) bezMien(s, { ucitelia: ucitelia.get(s.id)!, vyskyt, nazvy });
  return { skoly, kontext: { vyskyt, nazvy, ucitelia } };
}

export const kratko = (s: Skola): SkolaKratko => ({
  id: s.id, slug: s.slug, nazov: s.nazov, stupen: s.stupen, typ: s.typ, druh: s.druh, kraj: s.kraj, okres: s.okres,
  miesto: s.miesto, ulica: s.ulica, mestoSlug: s.mestoSlug, zriadovatel: s.zriadovatel, ziaci: s.ziaci, stav: s.stav, edupage: s.edupage,
  zaciatok: s.zaciatok, koniec: s.koniec, pocetHodin: s.pocetHodin,
});
