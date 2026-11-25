// Archív starších rozvrhov z EduPage: škola tam drží všetky verzie rozvrhu z minulých rokov.
//   bun prieskum/historia.ts zoznam    zoznam verzií každej školy s verejným rozvrhom → data/historia/verzie.json
//   bun prieskum/historia.ts stiahni   stiahne verzie, ktoré ešte nemá → data/historia/raw/<sub>/<tt_num>.json.gz
// Oba sa dajú prerušiť a pustiť znova; pokračujú tam, kde skončili. Najviac 1 požiadavka za sekundu (sonda.ts)
// a len cez deň: o 21:00 sa zastavia samy. data/historia/ nie je v gite (surové údaje EduPage).
import { mkdir, readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { stiahni } from "./sonda";

const DIR = "data/historia";
const ZOZNAM = `${DIR}/verzie.json`;
export type Verzia = { tt_num: string; year: number; text: string; datefrom: string };

/** Zber beží len cez deň (7:00 až 21:00). */
export const cezDen = (d = new Date()) => d.getHours() >= 7 && d.getHours() < 21;

const edupage = (sub: string, f: "ttviewer" | "regulartt", args: unknown[]) =>
  stiahni(`https://${sub}.edupage.org/timetable/server/${f}.js?__func=${f === "ttviewer" ? "getTTViewerData" : "regularttGetData"}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ __args: args, __gsh: "00000000" }),
  });

const skolyEdupage = async () => {
  const sub = new Set<string>();
  for (const f of await readdir("site/public/data/skoly")) {
    const s = (await Bun.file(`site/public/data/skoly/${f}`).json()) as { stav: string; edupage: string | null };
    if (s.stav === "verejny_rozvrh" && s.edupage) sub.add(s.edupage);
  }
  return [...sub].sort();
};

async function zoznam() {
  const verzie: Record<string, Verzia[]> = (await Bun.file(ZOZNAM).exists()) ? await Bun.file(ZOZNAM).json() : {};
  const skoly = (await skolyEdupage()).filter((s) => !(s in verzie));
  console.log(`${skoly.length} škôl bez zoznamu`);
  for (const [i, sub] of skoly.entries()) {
    if (!cezDen()) { console.log("21:00, zastavené"); break; }
    const r = await edupage(sub, "ttviewer", [null, new Date().getFullYear()]);
    let tts: Verzia[] = [];
    try { tts = (JSON.parse(r.text) as { r?: { regular?: { timetables?: Verzia[] } } }).r?.regular?.timetables ?? []; } catch { /* nie JSON */ }
    if (!r.ok) continue; // chyba siete: skúsi sa pri ďalšom behu
    verzie[sub] = tts.map(({ tt_num, year, text, datefrom }) => ({ tt_num, year, text, datefrom }));
    if (i % 50 === 0 || i === skoly.length - 1) { await Bun.write(ZOZNAM, JSON.stringify(verzie)); console.log(`${i + 1}/${skoly.length}`); }
  }
  await Bun.write(ZOZNAM, JSON.stringify(verzie));
}

async function stiahniVerzie() {
  const verzie = (await Bun.file(ZOZNAM).json()) as Record<string, Verzia[]>;
  const ulohy = Object.entries(verzie).flatMap(([sub, v]) => v.map((x) => ({ sub, num: x.tt_num })));
  let nove = 0, chyby = 0, mam = 0;
  for (const { sub, num } of ulohy) {
    const cesta = `${DIR}/raw/${sub}/${num}.json.gz`;
    if (await Bun.file(cesta).exists()) { mam++; continue; }
    if (!cezDen()) { console.log("21:00, zastavené"); break; }
    const r = await edupage(sub, "regulartt", [null, num]);
    if (r.ok && r.text.includes("dbiAccessorRes")) {
      await mkdir(`${DIR}/raw/${sub}`, { recursive: true });
      await Bun.write(cesta, gzipSync(r.text));
      nove++;
    } else chyby++;
    if ((nove + chyby) % 200 === 0) console.log(`${mam + nove}/${ulohy.length} (${chyby} chýb)`);
  }
  console.log(`hotovo: ${mam + nove}/${ulohy.length}, nových ${nove}, chýb ${chyby}`);
}

if (import.meta.main) {
  await mkdir(DIR, { recursive: true });
  const prikaz = process.argv[2];
  if (prikaz === "zoznam") await zoznam();
  else if (prikaz === "stiahni") await stiahniVerzie();
  else console.log("použitie: bun prieskum/historia.ts zoznam | stiahni");
}
