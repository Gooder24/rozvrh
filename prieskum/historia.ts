// Archív starších rozvrhov z EduPage: škola tam drží všetky verzie rozvrhu z minulých rokov.
//   bun prieskum/historia.ts zoznam    zoznam verzií každej školy s verejným rozvrhom → data/historia/verzie.json
//   bun prieskum/historia.ts stiahni   stiahne verzie, ktoré ešte nemá → data/historia/raw/<sub>/<tt_num>.json.gz
//   … --aj-v-noci                      nezastaví sa o 21:00 (Karchi 2026-11-25: aj v noci, kým EduPage neblokuje)
// Mimo agenta (bez agenta a cez noc) beží ako služba:
//   systemd-run --user --unit=rozvrh-historia --working-directory=$PWD reboot-when-idle hold bun prieskum/historia.ts stiahni --aj-v-noci
// stav: journalctl --user -u rozvrh-historia; zastaviť: systemctl --user stop rozvrh-historia.
// Oba sa dajú prerušiť a pustiť znova; pokračujú tam, kde skončili. Najviac 1 požiadavka za sekundu (sonda.ts),
// nikdy naraz s obnovou (zámok data/.zber.lock) a len cez deň: o 21:00 sa zastavia samy. Surové údaje obsahujú mená
// učiteľov: na web smú len cez web/data.ts (bezMien), nikdy priamo. data/historia/ nie je v gite (surové údaje EduPage).
import { mkdir, readdir, rename } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { stiahni, zablokovane, zamkni } from "./sonda";

const DIR = "data/historia";
const AJ_V_NOCI = process.argv.includes("--aj-v-noci");
const ZOZNAM = `${DIR}/verzie.json`;
export type Verzia = { tt_num: string; year: number; text: string; datefrom: string };

/** Súbor sa zapíše celý alebo vôbec: prerušený beh nenechá polovičný súbor, ktorý by ďalší beh preskočil. */
const zapis = async (cesta: string, data: string | Uint8Array) => { await Bun.write(`${cesta}.tmp`, data); await rename(`${cesta}.tmp`, cesta); };

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
    if (!AJ_V_NOCI && !cezDen()) { console.log("21:00, zastavené"); break; }
    if (zablokovane) { console.log("EduPage blokuje, zastavené"); break; }
    const r = await edupage(sub, "ttviewer", [null, new Date().getFullYear()]);
    let tts: Verzia[] | null = null;
    // Len odpoveď so zoznamom rozvrhov (r.regular); chybová odpoveď s HTTP 200 sa skúsi pri ďalšom behu.
    try { const reg = (JSON.parse(r.text) as { r?: { regular?: { timetables?: Verzia[] } } }).r?.regular; tts = reg ? reg.timetables ?? [] : null; } catch { /* nie JSON */ }
    if (!r.ok || !tts) continue; // chyba siete alebo pokazená odpoveď: skúsi sa pri ďalšom behu
    verzie[sub] = tts.map(({ tt_num, year, text, datefrom }) => ({ tt_num, year, text, datefrom }));
    if (i % 50 === 0 || i === skoly.length - 1) { await zapis(ZOZNAM, JSON.stringify(verzie)); console.log(`${i + 1}/${skoly.length}`); }
  }
  await zapis(ZOZNAM, JSON.stringify(verzie));
}

async function stiahniVerzie() {
  const verzie = (await Bun.file(ZOZNAM).json()) as Record<string, Verzia[]>;
  const ulohy = Object.entries(verzie).flatMap(([sub, v]) => v.map((x) => ({ sub, num: x.tt_num })));
  let nove = 0, chyby = 0, mam = 0;
  for (const { sub, num } of ulohy) {
    const cesta = `${DIR}/raw/${sub}/${num}.json.gz`;
    if (await Bun.file(cesta).exists()) { mam++; continue; }
    if (!AJ_V_NOCI && !cezDen()) { console.log("21:00, zastavené"); break; }
    if (zablokovane) { console.log("EduPage blokuje, zastavené"); break; }
    const r = await edupage(sub, "regulartt", [null, num]);
    if (r.ok && r.text.includes("dbiAccessorRes")) {
      await mkdir(`${DIR}/raw/${sub}`, { recursive: true });
      await zapis(cesta, gzipSync(r.text));
      nove++;
    } else chyby++;
    if ((nove + chyby) % 200 === 0) console.log(`${mam + nove}/${ulohy.length} (${chyby} chýb)`);
  }
  console.log(`hotovo: ${mam + nove}/${ulohy.length}, nových ${nove}, chýb ${chyby}`);
}

if (import.meta.main) {
  await mkdir(DIR, { recursive: true });
  zamkni(); // s obnovou rozvrhov ani druhým behom naraz nie: spolu by išli 2 požiadavky za sekundu
  const prikaz = process.argv[2];
  if (prikaz === "zoznam") await zoznam();
  else if (prikaz === "stiahni") await stiahniVerzie();
  else console.log("použitie: bun prieskum/historia.ts zoznam | stiahni");
}
