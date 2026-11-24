// Obnova údajov: každý druhý týždeň v stredu o 16:00 (rozvrh-obnova.timer na asuse).
//   bun prieskum/obnova.ts            beh z časovača: v nepárny týždeň skončí hneď
//   bun prieskum/obnova.ts --teraz    beh hneď (lacný, alebo plný podľa dátumu)
//   bun prieskum/obnova.ts --plna     plná obnova hneď
//   --stupen=SŠ alebo --stupen=ZŠ      len jeden stupeň (bez neho oba)
// Lacný beh: pri každej škole na EduPage jedna požiadavka (zoznam rozvrhov); školu, kde sa zmenil rozvrh
// alebo jeho verejnosť, preskúma celú. Plný beh (ten najbližší k 15. 9., 15. 11., 15. 2. a 15. 4.) preskúma
// všetky školy vrátane zvonenia zo školských poriadkov. Nové školy z registra CVTI preskúma vždy celé.
// Poistka: beh zapisuje do data/obnova/<stupeň> a data/obnova/raw; živé dáta oboch stupňov nahradí naraz, len keď
// výsledok nevyzerá pokazene. Škola, pri ktorej požiadavka zlyhala, si nechá starý záznam. Keď EduPage začne
// odpovedať 403/429, beh skončí. Inak dáta nechá, zapíše dôvod do data/obnova/posledny-beh.json a riadok do inboxu.
import { cp, mkdir, readdir, rename, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { nastavRaw, preskumaj, ttviewer, poziadavky, UA, zablokovane, zamkni, type Skola } from "./sonda";

const ARGY = process.argv.slice(2);
const dnes = new Date();
const den = (d: Date) => d.toISOString().slice(0, 10);

// Každý druhý týždeň od stredy 2. 12. 2026.
const KOTVA = Date.UTC(2026, 11, 2);
const tyzdne = Math.round((Date.UTC(dnes.getFullYear(), dnes.getMonth(), dnes.getDate()) - KOTVA) / (7 * 864e5));
if (!ARGY.includes("--teraz") && !ARGY.includes("--plna") && tyzdne % 2 !== 0) {
  console.log(`nepárny týždeň (${tyzdne} od kotvy), obnova nebeží`);
  process.exit(0);
}
// Plný beh: 15. 9., 15. 11., 15. 2. alebo 15. 4. padne do okna [dnes − 7, dnes + 6] (pri behu raz za 14 dní práve raz).
const PLNE = [[8, 15], [10, 15], [1, 15], [3, 15]] as const;
const plna = ARGY.includes("--plna") || PLNE.some(([m, d]) => [-1, 0, 1].some((posun) => {
  const rozdiel = (Date.UTC(dnes.getFullYear() + posun, m, d) - Date.UTC(dnes.getFullYear(), dnes.getMonth(), dnes.getDate())) / 864e5;
  return rozdiel >= -7 && rozdiel <= 6;
}));

const zaciatok = Date.now();
const log: string[] = [];
const zapis = (s: string) => { log.push(s); console.log(s); };
zapis(`obnova ${dnes.toISOString()} ${plna ? "plná" : "lacná"}`);
await mkdir("data/obnova", { recursive: true });
zamkni();
await mkdir("data/raw", { recursive: true });
await mkdir("data/tmp", { recursive: true });
const RAW = "data/obnova/raw";
await rm(RAW, { recursive: true, force: true });
await mkdir(RAW, { recursive: true });
nastavRaw(RAW);

// 1. Register CVTI: stiahne aktuálne XLS zo stránky CVTI, pri zmene ich načíta znova.
const CVTI = "https://www.cvtisr.sk/informacie-o-skolstve/registre/zoznamy-skol-a-skolskych-zariadeni/";
const REGISTRE = { "SŠ": ["GYM_Z", "KON_Z", "SOS_Z", "SPECSS_Z"], "ZŠ": ["zoznam_zakladne-skoly"] } as const;
type Stupen = keyof typeof REGISTRE;
const problemy: string[] = [];
const sha = (b: ArrayBuffer) => createHash("sha256").update(new Uint8Array(b)).digest("hex");

// Len z https://www.cvtisr.sk, s časovým limitom a najviac 30 MB.
async function zCvti(url: URL) {
  if (url.protocol !== "https:" || url.hostname !== "www.cvtisr.sk") return null;
  const r = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(60_000) }).catch(() => null);
  if (!r?.ok || Number(r.headers.get("content-length") ?? 0) > 30_000_000) return null;
  const data = await r.arrayBuffer().catch(() => null);
  return data && data.byteLength <= 30_000_000 ? data : null;
}
async function registre() {
  // Zálohy (.predosly) platia len pre tento beh: staré by pri návrate prepísali nezmenené súbory.
  for (const f of await readdir("data/register")) if (f.endsWith(".predosly")) await rm(`data/register/${f}`);
  const s = await zCvti(new URL(CVTI));
  const stranka = s ? new TextDecoder().decode(s) : "";
  const zmenene = new Set<Stupen>();
  for (const [stupen, subory] of Object.entries(REGISTRE) as [Stupen, readonly string[]][]) {
    for (const subor of subory) {
      const odkaz = stranka.match(new RegExp(`href="([^"]*/${subor.replace("-", "\\-")}\\.xls)"`, "i"))?.[1];
      if (!odkaz) { problemy.push(`register ${subor}: odkaz na stránke CVTI nenájdený`); continue; }
      const data = await zCvti(new URL(odkaz, CVTI));
      if (!data || data.byteLength < 10_000) { problemy.push(`register ${subor}: stiahnutie zlyhalo`); continue; }
      const cesta = `data/register/${subor}.xls`;
      const stary = await Bun.file(cesta).arrayBuffer().catch(() => null);
      if (stary && sha(stary) === sha(data)) continue;
      if (stary) await Bun.write(`${cesta}.predosly`, stary);
      await Bun.write(cesta, data);
      zmenene.add(stupen);
      zapis(`register ${subor}: nová verzia`);
    }
  }
  for (const stupen of zmenene) {
    const cesta = stupen === "SŠ" ? "data/skoly-register.json" : "data/zs/skoly-register.json";
    const predtym = ((await Bun.file(cesta).json()) as unknown[]).length;
    await Bun.write(`${cesta}.predosly`, Bun.file(cesta));
    const beh = Bun.spawnSync(["bun", "prieskum/register.ts", ...(stupen === "ZŠ" ? ["zs"] : [])]);
    const potom = beh.exitCode === 0 ? ((await Bun.file(cesta).json()) as unknown[]).length : 0;
    // Register sa medzi rokmi mení o jednotky percent; veľký pokles je zlý súbor, nie zatvorené školy.
    if (potom < predtym * 0.9) {
      await Bun.write(cesta, Bun.file(`${cesta}.predosly`));
      for (const subor of REGISTRE[stupen]) {
        const xls = Bun.file(`data/register/${subor}.xls.predosly`);
        if (await xls.exists()) await Bun.write(`data/register/${subor}.xls`, xls);
      }
      problemy.push(`register ${stupen}: nový má ${potom} škôl oproti ${predtym}, ostáva starý`);
    } else zapis(`register ${stupen}: ${predtym} → ${potom} škôl`);
  }
}
await registre();

// 2. Školy: lacná kontrola alebo plná obnova, do pracovnej kópie.
type Vysledok = {
  eduid: string; rozvrh_stav: string; edupage?: { sub: string }; rozvrh?: { tt_num: string; od: string | null }; zvonenie?: unknown;
  odtlacok?: string; // stav zoznamu rozvrhov z poslednej kontroly
};
const ZIVE = { "SŠ": "data/prieskum", "ZŠ": "data/zs/prieskum" } as const;
const PRACOVNE = { "SŠ": "data/obnova/ss", "ZŠ": "data/obnova/zs" } as const;
const REG = { "SŠ": "data/skoly-register.json", "ZŠ": "data/zs/skoly-register.json" } as const;

const nacitajDir = async (dir: string) => new Map(await Promise.all((await readdir(dir).catch(() => [] as string[]))
  .filter((f) => f.endsWith(".json")).map(async (f) => [f.slice(0, -5), (await Bun.file(`${dir}/${f}`).json()) as Vysledok] as const)));

// Odtlačok zo zoznamu rozvrhov (ttviewer): žiadny modul, len po prihlásení, alebo predvolený rozvrh a jeho začiatok.
async function odtlacok(sub: string) {
  const { tv, r } = await ttviewer(sub);
  if (!r) return tv.ok && !tv.text.trim() ? "bez_rozvrhu" : null; // null = chyba požiadavky
  const regular = (r.regular ?? {}) as { default_num?: string; timetables?: { tt_num: string; datefrom?: string }[] };
  const tts = regular.timetables ?? [];
  if (!tts.length) return r.asklogin ? "len_prihlasenie" : "bez_rozvrhu";
  const num = regular.default_num ?? tts.at(-1)?.tt_num;
  return `${num}|${tts.find((t) => t.tt_num === num)?.datefrom ?? ""}`;
}
// Verejný rozvrh bez uloženého odtlačku (prvý prieskum) sa porovná podľa tt_num a dátumu začiatku.
const predosly = (v: Vysledok) => v.odtlacok ?? (v.rozvrh_stav === "verejny" ? `${v.rozvrh?.tt_num}|${v.rozvrh?.od ?? ""}` : null);

const vysledky: Record<string, unknown> = {};
const len = ARGY.find((a) => a.startsWith("--stupen="))?.slice(9);
const stupne = (["SŠ", "ZŠ"] as const).filter((s) => !len || s === len);
const sZvonenim = (v: Vysledok) => !!v.zvonenie && !(v.zvonenie as { predvolene?: boolean }).predvolene;
// Nový výsledok, ktorý vznikol z chyby požiadavky (EduPage neodpovedal, zablokoval), nie zo zmeny na škole.
const zChyby = (v: Vysledok, stary: Vysledok | undefined) =>
  !!stary && (v.rozvrh_stav === "chyba" || (!!stary.edupage && !v.edupage));
for (const stupen of stupne) {
  const register = (await Bun.file(REG[stupen]).json()) as Skola[];
  const zive = await nacitajDir(ZIVE[stupen]);
  const pracovne = PRACOVNE[stupen];
  await rm(pracovne, { recursive: true, force: true });
  await mkdir(pracovne, { recursive: true });
  let zmenene = 0, nove = 0, chyby = 0, kontrolovane = 0, ponechane = 0;
  const zmeneneSkoly: string[] = [];
  for (const s of register) {
    if (zablokovane) break;
    const stary = zive.get(s.eduid);
    let celu = plna || !stary;
    let odtl: string | null = null;
    if (!celu && stary?.edupage) {
      kontrolovane++;
      odtl = await odtlacok(stary.edupage.sub);
      if (odtl === null) chyby++;
      // Bez predošlého odtlačku (nie verejný rozvrh pri prvej obnove) sa len zapamätá, škola sa nepreskúma.
      celu = odtl !== null && predosly(stary) !== null && odtl !== predosly(stary);
    }
    let v: Vysledok = celu ? (await preskumaj(s)) as Vysledok : { ...stary! };
    if (celu && zChyby(v, stary)) { chyby++; ponechane++; v = { ...stary! }; }
    // Skutočné zvonenie, ktoré tentoraz nevyšlo (web školy neodpovedal, PDF nešlo stiahnuť), ostane z minula.
    else if (celu && stary && sZvonenim(stary) && !sZvonenim(v)) { ponechane++; v = { ...v, zvonenie: stary.zvonenie }; }
    if (odtl !== null) v.odtlacok = odtl;
    if (!stary) nove++;
    else if (celu && !plna) { zmenene++; zmeneneSkoly.push(s.eduid); }
    await Bun.write(`${pracovne}/${s.eduid}.json`, JSON.stringify(v, null, 1));
  }
  // Poistka: porovnanie s živými dátami.
  const nove_ = await nacitajDir(pracovne);
  const pocet = (m: Map<string, Vysledok>, f: (v: Vysledok) => boolean) => [...m.values()].filter(f).length;
  const [vPred, vPo] = [pocet(zive, (v) => v.rozvrh_stav === "verejny"), pocet(nove_, (v) => v.rozvrh_stav === "verejny")];
  const [zPred, zPo] = [pocet(zive, sZvonenim), pocet(nove_, sZvonenim)];
  const pokusy = plna ? register.length : kontrolovane;
  const dovody: string[] = [];
  if (zablokovane) dovody.push("EduPage odpovedá 403/429 (blokuje), beh zastavený");
  if (zive.size && vPo < vPred * 0.8) dovody.push(`verejných rozvrhov ${vPred} → ${vPo}`);
  if (zive.size && zPo < zPred * 0.9) dovody.push(`škôl so zvonením ${zPred} → ${zPo}`);
  if (pokusy && chyby > pokusy * 0.2) dovody.push(`zlyhalo ${chyby} z ${pokusy} požiadaviek (EduPage blokuje alebo zmenil rozhranie)`);
  if (nove_.size < register.length * 0.95) dovody.push(`výsledkov ${nove_.size} z ${register.length} škôl v registri`);
  vysledky[stupen] = { skol: register.length, kontrolovane, zmenene, nove, chyby, ponechane, verejne: [vPred, vPo], zvonenie: [zPred, zPo], zmeneneSkoly, dovody };
  zapis(`${stupen}: ${register.length} škôl, kontrol ${kontrolovane}, zmenených ${zmenene}, nových ${nove}, chýb ${chyby} (starý záznam ${ponechane}), verejné ${vPred}→${vPo}, zvonenie ${zPred}→${zPo}`);
  problemy.push(...dovody.map((d) => `${stupen}: ${d}`));
}

// Výmena až keď prešli všetky stupne: živé idú do data/obnova/<stupeň>-predosle, pracovné sa stanú živými,
// surové rozvrhy z data/obnova/raw prepíšu tie v data/raw.
if (!problemy.length) {
  for (const stupen of stupne) {
    const predosle = `${PRACOVNE[stupen]}-predosle`;
    await rm(predosle, { recursive: true, force: true });
    await rename(ZIVE[stupen], predosle).catch(() => {});
    await rename(PRACOVNE[stupen], ZIVE[stupen]);
  }
  for (const f of await readdir(RAW)) await rename(`${RAW}/${f}`, `data/raw/${f}`);
}

// Web: po obnove sa zostaví a nasadí (keď je na stroji token Cloudflare).
if (!problemy.length && (await Bun.file(`${process.env.HOME}/.config/rozvrh/cloudflare.env`).exists())) {
  const nasad = Bun.spawnSync(["bun", "web/nasad.ts"], { stdout: "inherit", stderr: "inherit" });
  if (nasad.exitCode !== 0) problemy.push("nasadenie webu zlyhalo (journalctl --user -u rozvrh-obnova)");
  else zapis("web nasadený");
}

const beh = { cas: dnes.toISOString(), plna, trvanieMin: Math.round((Date.now() - zaciatok) / 6e4), poziadavky, vysledky, problemy, log };
await Bun.write("data/obnova/posledny-beh.json", JSON.stringify(beh, null, 1));
await Bun.write(`data/obnova/beh-${den(dnes)}.json`, JSON.stringify(beh, null, 1));
Bun.spawnSync(["bun", "prieskum/suhrn.ts"]);
// Register a súhrn idú do verejného repa Gooder24/rozvrh (výsledky po školách nie: môžu obsahovať mená z EduPage).
// Commit len týchto ciest (--only); push len keď commit vznikol, bez autostash (cudziu rozrobenú prácu nepushne).
const DATA = ["data/register", "data/skoly-register.json", "data/zs/skoly-register.json", "data/PRIESKUM.md", "data/prieskum-suhrn.json"];
Bun.spawnSync(["git", "add", "--", ...DATA]);
const commit = Bun.spawnSync(["git", "commit", "-q", "--only", "-m", `chore(data): obnova ${den(dnes)} (${plna ? "plná" : "lacná"}${problemy.length ? ", poistka nenahradila dáta" : ""})`, "--", ...DATA]);
if (commit.exitCode === 0 && Bun.spawnSync(["git", "pull", "-q", "--rebase"]).exitCode === 0) Bun.spawnSync(["git", "push", "-q"]);

if (problemy.length) {
  // Poistka sa ozve: jeden riadok v inboxe (číta ho Hermes), nikdy dvakrát za ten istý deň.
  const inbox = `${process.env.HOME}/inbox/inbox.md`;
  const text = await Bun.file(inbox).text().catch(() => null);
  const riadok = `- [ ] ${den(dnes)} · Obnova rozvrhov škôl nenahradila dáta: ${problemy.join("; ")}. Povedz agentovi v projekte rozvrh, nech to pozrie (data/obnova/posledny-beh.json) · úloha „rozvrh-obnova“`.slice(0, 300);
  if (text && !text.includes(`${den(dnes)} · Obnova rozvrhov škôl`)) {
    await Bun.write(inbox, text.replace(/^## P1 teraz\s*\n/m, (m) => `${m}${riadok}\n`));
  }
  console.error(problemy.join("\n"));
  process.exit(1);
}
zapis(`hotovo za ${beh.trvanieMin} min, ${poziadavky} požiadaviek`);
