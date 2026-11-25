// Prieskum jednej školy za druhou: EduPage subdoména, verejnosť rozvrhu, zvonenie a jeho zdroj.
// bun prieskum/sonda.ts [--zs] [--do=HH:MM] [eduid…]
//   stredné školy: data/prieskum/<eduid>.json, základné (--zs): data/zs/prieskum/<eduid>.json, surové rozvrhy: data/raw/<sub>.json.gz
//   --do=21:30 po tomto čase nezačne ďalšiu školu (zber nebeží v noci; ďalší beh pokračuje, kde skončil).
// Dá sa prerušiť a spustiť znova: hotové školy preskočí.
import { mkdir } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { gzipSync } from "node:zlib";

export type Skola = {
  eduid: string; nazov: string; ulica: string; miesto: string; psc: string; web: string | null;
  kraj: string; typ: string; zriadovatel: string;
};
type Hodina = { n: string; od: string; do: string };
type Row = Record<string, unknown>;

// Ručné párovanie škôl, ktoré automaticky nejdú: data/rucne.json { eduid: { sub, poznamka } }.
const RUCNE = (await Bun.file("data/rucne.json").json()) as Record<string, { sub: string; poznamka: string }>;
export const UA = "rozvrh-prieskum/1.0 (+https://rozvrh.dvoriste.xyz/o-projekte/)";
const PAUZA_MS = 1000;
const IGNOROVANE_SUB = new Set(["www", "portal", "help", "login1", "cloud", "m", "api", "static", "help2"]);
// robots.txt EduPage: tieto cesty nevoláme nikdy.
const ZAKAZANE = /\/substitution\/|\/timetable\/view\.php|\/timetable\/online\.php|\/login\/|\/captcha|\/stats\/|\/gcall|\/exam\/|\/photos\/|\.(jpe?g|png)|[?&](blindFriendly|lang|edu)=/i;
const zakazana = (url: string) => { const u = new URL(url); return ZAKAZANE.test(u.pathname + u.search); };

let posledna = 0;
export let poziadavky = 0;
let slotFronta: Promise<void> = Promise.resolve();
// Globálne najviac 1 požiadavka za sekundu na všetky hosty spolu: aj webové stránky škôl
// bývajú na serveroch EduPage pod vlastnou doménou a z URL sa to nedá spoznať.
function slot() {
  const moj = slotFronta.then(async () => {
    const cakaj = posledna + PAUZA_MS - Date.now();
    if (cakaj > 0) await Bun.sleep(cakaj);
    posledna = Date.now();
    poziadavky++;
  });
  slotFronta = moj;
  return moj;
}

// Surové rozvrhy: obnova ich píše bokom (data/obnova/raw) a do data/raw presunie až po poistke.
let RAW = "data/raw";
export const nastavRaw = (dir: string) => { RAW = dir; };

/** Jeden zber naraz na stroji: dva behy by spolu išli 2 požiadavky za sekundu. Zámok sa uvoľní pri skončení procesu. */
export function zamkni(cesta = "data/.zber.lock") {
  for (let pokus = 0; pokus < 2; pokus++) {
    try {
      const fd = openSync(cesta, "wx");
      writeSync(fd, String(process.pid));
      closeSync(fd);
      process.on("exit", () => { try { unlinkSync(cesta); } catch {} });
      return;
    } catch {
      const pid = Number(readFileSync(cesta, "utf8").trim());
      if (pid && existsSync(`/proc/${pid}`)) throw new Error(`Zber už beží (PID ${pid}, ${cesta}).`);
      unlinkSync(cesta); // zámok po skončenom procese
    }
  }
  throw new Error(`Zámok ${cesta} sa nedá získať.`);
}

// EduPage obmedzuje: keď je z posledných 20 odpovedí EduPage aspoň 5 s 403/429, zber sa zastaví (každá ďalšia
// požiadavka by blok predĺžila). Okno, nie počet za sebou: 6 súbežných škôl by ho inak nulovalo.
const posledne: boolean[] = [];
export let zablokovane = false;

// Len verejné http(s) adresy: presmerovanie ani odkaz z cudzieho webu nesmie viesť na tento stroj, sieť Tailscale ani súbor.
// IPv4 rozsahy [začiatok, dĺžka prefixu]: 0/8, 10/8, 100.64/10 (Tailscale), 127/8, 169.254/16, 172.16/12, 192.168/16, 224/3.
const SUKROMNE_V4 = [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3]] as const;
const v4 = (ip: string) => ip.split(".").reduce((a, b) => a * 256 + Number(b), 0);
const v4zCisla = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
/** IPv6 ako 8 čísel (aj „::“, „0:0:…:1“, vložená IPv4 „::ffff:1.2.3.4“). */
function skupiny6(ip: string): number[] {
  let x = ip.toLowerCase().replace(/%.*$/, "");
  const m = x.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (m) { const n = v4(m[1]!); x = x.slice(0, -m[1]!.length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`; }
  const [a, b] = x.split("::");
  const cast = (s?: string) => (s ? s.split(":").map((h) => parseInt(h, 16)) : []);
  const zac = cast(a), kon = cast(b);
  return b === undefined ? zac : [...zac, ...Array(8 - zac.length - kon.length).fill(0), ...kon];
}
export function sukromnaIp(ip: string): boolean {
  if (isIP(ip) === 4) return SUKROMNE_V4.some(([z, m]) => Math.floor(v4(ip) / 2 ** (32 - m)) === Math.floor(v4(z) / 2 ** (32 - m)));
  if (isIP(ip) !== 6) return true;
  const g = skupiny6(ip);
  const vnutorna = (h: number, l: number) => sukromnaIp(v4zCisla(h * 65536 + l));
  // ::, ::1, ::ffff:a.b.c.d a ::a.b.c.d: rozhoduje vložená IPv4.
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0 || g[5] === 0xffff)) return (g[5] === 0 && g[6] === 0) || vnutorna(g[6]!, g[7]!);
  if (g[0] === 0x64 && g[1] === 0xff9b) return vnutorna(g[6]!, g[7]!); // NAT64
  if (g[0] === 0x2002) return vnutorna(g[1]!, g[2]!); // 6to4
  return (g[0]! & 0xfe00) === 0xfc00 || (g[0]! & 0xffc0) === 0xfe80 || (g[0]! & 0xff00) === 0xff00;
}
async function verejnaUrl(url: string) {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.port && u.port !== "80" && u.port !== "443") return false;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return !sukromnaIp(host);
  if (!host.includes(".") || /\.(local|internal|lan|home|ts\.net)$/i.test(host)) return false;
  try { const a = await lookup(host, { all: true }); return a.length > 0 && a.every((x) => !sukromnaIp(x.address)); } catch { return false; }
}

// robots.txt cudzích webov (EduPage má vlastný zoznam ZAKAZANE): pravidlá pre „*“ alebo náš UA, len Disallow.
const robots = new Map<string, Promise<string[]>>();
async function povoleneRobots(url: string) {
  const u = new URL(url);
  if (jeEdupage(url)) return true;
  if (!robots.has(u.origin)) robots.set(u.origin, (async () => {
    if (!(await verejnaUrl(`${u.origin}/robots.txt`))) return [];
    await slot();
    // Bez presmerovaní: cieľ presmerovania by obišiel kontrolu verejnej adresy. Presmerovaný robots.txt = žiadne pravidlá.
    const r = await fetch(`${u.origin}/robots.txt`, { headers: { "user-agent": UA }, redirect: "manual", signal: AbortSignal.timeout(10_000) }).catch(() => null);
    const data = r?.ok ? await citaj(r, 500_000) : null;
    const zakazy: string[] = [];
    let nas = false;
    for (const riadok of (data ? new TextDecoder().decode(data) : "").split(/\r?\n/)) {
      const [k, ...v] = riadok.replace(/#.*/, "").split(":");
      const kluc = k?.trim().toLowerCase(), hodnota = v.join(":").trim();
      if (kluc === "user-agent") nas = hodnota === "*" || /rozvrh/i.test(hodnota);
      else if (kluc === "disallow" && nas && hodnota) zakazy.push(hodnota);
    }
    return zakazy;
  })());
  const zakazy = await robots.get(u.origin)!;
  return !zakazy.some((z) => (u.pathname + u.search).startsWith(z.replace(/\*.*$/, "")));
}

/** Telo odpovede najviac `max` bajtov, inak null (aj gzip bomba sa zastaví na limite, fetch rozbaľuje priebežne). */
async function citaj(res: Response, max: number): Promise<Uint8Array | null> {
  if (Number(res.headers.get("content-length") ?? 0) > max) { await res.body?.cancel(); return null; }
  if (!res.body) return new Uint8Array();
  const citac = res.body.getReader();
  const casti: Uint8Array[] = [];
  let spolu = 0;
  for (;;) {
    const { done, value } = await citac.read();
    if (done) break;
    spolu += value.byteLength;
    if (spolu > max) { await citac.cancel(); return null; }
    casti.push(value);
  }
  const out = new Uint8Array(spolu);
  let i = 0;
  for (const c of casti) { out.set(c, i); i += c.byteLength; }
  return out;
}

const subZHostu = (host: string) => host.toLowerCase().replace(/^www\./, "").split(".")[0]!;
const jeEdupage = (url: string) => /(^|\.)edupage\.org$/i.test(new URL(url).hostname);

// Presmerovania prechádzame ručne, aby aj každý skok čakal na slot.
export async function stiahni(url: string, init: RequestInit = {}) {
  let ciel = url;
  let metoda = init;
  const nic = (chyba?: string) => ({ ok: false, status: 0, url: ciel, text: "", pdf: false, data: new Uint8Array(), ...(chyba ? { chyba } : {}) });
  for (let skok = 0; skok < 6; skok++) {
    if (zablokovane) return nic("zber zastavený: EduPage blokuje");
    if (!(await verejnaUrl(ciel))) return nic("neverejná adresa");
    if (zakazana(ciel) || !(await povoleneRobots(ciel))) return nic("zakázané v robots.txt");
    await slot();
    try {
      const res = await fetch(ciel, {
        ...metoda, redirect: "manual", signal: AbortSignal.timeout(20_000),
        headers: { "user-agent": UA, ...(metoda.headers ?? {}) },
      });
      const kam = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && kam) {
        ciel = new URL(kam, ciel).href;
        if (res.status !== 307 && res.status !== 308) metoda = {};
        continue;
      }
      if (jeEdupage(ciel)) {
        posledne.push(res.status === 403 || res.status === 429);
        if (posledne.length > 20) posledne.shift();
        if (posledne.filter(Boolean).length >= 5) zablokovane = true;
      }
      const typ = res.headers.get("content-type") ?? "";
      const pdf = /pdf/i.test(typ) || /\.pdf($|\?)/i.test(ciel);
      const docx = /wordprocessingml/i.test(typ) || /\.docx($|\?)/i.test(ciel);
      const data = await citaj(res, pdf || docx ? 20_000_000 : 5_000_000);
      if (!data) return nic("odpoveď je priveľká");
      const text = pdf ? await textPdf(data) : docx ? await textDocx(data) : new TextDecoder().decode(data);
      return { ok: res.ok, status: res.status, url: ciel, text, pdf: pdf || docx, data };
    } catch (e) {
      return { ok: false, status: 0, url: ciel, text: "", pdf: false, data: new Uint8Array(), chyba: String(e) };
    }
  }
  return { ok: false, status: 0, url: ciel, text: "", pdf: false, data: new Uint8Array(), chyba: "priveľa presmerovaní" };
}

// Cudzí súbor: nástroj beží najviac 30 s a jeho výstup najviac 5 MB (PDF, ktoré pdftotext zasekne, ani zip bomba nezastavia zber).
async function vystup(prikaz: string[], subor: string, data: Uint8Array) {
  await Bun.write(subor, data);
  try {
    const p = Bun.spawn(prikaz, { stdout: "pipe", stderr: "ignore", timeout: 30_000, killSignal: "SIGKILL" });
    const text = await citaj(new Response(p.stdout), 5_000_000);
    if (!text) p.kill("SIGKILL");
    await p.exited;
    return text ? new TextDecoder().decode(text) : "";
  } finally {
    await Bun.file(subor).delete().catch(() => {});
  }
}
async function textPdf(data: Uint8Array) {
  const subor = `data/tmp/${crypto.randomUUID()}.pdf`;
  return vystup(["pdftotext", "-q", "-layout", "-l", "30", subor, "-"], subor, data);
}
async function textDocx(data: Uint8Array) {
  const subor = `data/tmp/${crypto.randomUUID()}.docx`;
  const xml = await vystup(["unzip", "-p", subor, "word/document.xml"], subor, data);
  return xml.replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "");
}

const bezDiakritiky = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function zhodaAdresy(html: string, s: Skola) {
  const h = bezDiakritiky(html).replace(/\s+/g, " ");
  const ulicaSlovo = bezDiakritiky(s.ulica).replace(/[0-9/].*$/, "").trim().split(" ").filter((w) => w.length > 3).at(-1);
  const psc = s.psc.replace(/\s/g, "");
  const pscOk = psc.length === 5 && (h.includes(psc) || h.includes(`${psc.slice(0, 3)} ${psc.slice(3)}`));
  const ulicaOk = !!ulicaSlovo && h.includes(ulicaSlovo);
  const miestoOk = h.includes(bezDiakritiky(s.miesto.split("-")[0]!.trim()));
  return { ulica: ulicaOk, psc: pscOk, miesto: miestoOk, ok: (ulicaOk && (pscOk || miestoOk)) || (pscOk && miestoOk) };
}

function subdomenyZHtml(html: string) {
  const pocty = new Map<string, number>();
  for (const m of html.matchAll(/([a-z0-9-]+)\.edupage\.org/gi)) {
    const sub = m[1]!.toLowerCase();
    if (!IGNOROVANE_SUB.has(sub)) pocty.set(sub, (pocty.get(sub) ?? 0) + 1);
  }
  return [...pocty.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
}

// Widget zvonenia na titulke EduPage: {"name":"1","short":"1","starttime":"07:30","endtime":"08:15","period":1,…}
export function zvonenieZWidgetu(html: string): Hodina[] {
  const out = new Map<string, Hodina>();
  for (const m of html.matchAll(/"name":"([^"]*)","short":"[^"]*","starttime":"(\d{1,2}:\d{2})","endtime":"(\d{1,2}:\d{2})"/g)) {
    let n = m[1]!;
    try { n = JSON.parse(`"${n}"`) as string; } catch {}
    out.set(n, { n, od: m[2]!.padStart(5, "0"), do: m[3]!.padStart(5, "0") });
  }
  return [...out.values()];
}

const ENTITY: Record<string, string> = { nbsp: " ", ndash: "–", mdash: "—", minus: "-", amp: "&", hellip: "…" };
const dekoduj = (s: string) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
  .replace(/&([A-Za-z])(acute|caron|uml|circ|grave|ring);/g, (_, p: string, z: string) =>
    (p + { acute: "\u0301", caron: "\u030C", uml: "\u0308", circ: "\u0302", grave: "\u0300", ring: "\u030A" }[z]).normalize("NFC"))
  .replace(/&([a-z]+);/gi, (m, n: string) => ENTITY[n.toLowerCase()] ?? m);

// Časy hodín v texte stránky alebo PDF („1. 7:50 – 8:35“, aj bunky tabuľky „7:50 | 8:35“).
// Zo všetkých rastúcich radov berie ten, ktorý najviac vyzerá ako bežné vyučovanie (hodiny 40 až 50 min),
// takže „zvonenie pri skrátenom vyučovaní“ vedľa riadneho neprebije riadne.
export function zvonenieZTextu(htmlAleboText: string): Hodina[] {
  const text = dekoduj(htmlAleboText.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
  const zhody = [...text.matchAll(/(?<![\d:.,])(\d{1,2})\s?[:.,]\s?(\d{2})\s*(?:-|–|—|do|\s)\s*(\d{1,2})\s?[:.,]\s?(\d{2})(?![\d:])/g)];
  const casy = zhody
    .map((m, i) => {
      // Popis riadku: text pred časom, najviac 30 znakov a nie cez predošlý čas.
      const predosly = i ? zhody[i - 1]!.index! + zhody[i - 1]![0].length : 0;
      const popis = text.slice(Math.max(predosly, m.index! - 30), m.index!);
      return {
        od: `${m[1]!.padStart(2, "0")}:${m[2]}`, do: `${m[3]!.padStart(2, "0")}:${m[4]}`,
        n: popis.match(/(?:^|\s)(\d{1,2})\s*\.\s*(?:vyu\S*\s*)?(?:hod\S*)?\s*[-–:|]?\s*$/)?.[1],
        ine: /prestavk|obed|rann|kruh|skd|klub|druzin|dozor|prichod|odchod|otvor/.test(bezDiakritiky(popis)),
      };
    })
    .filter((c) => !c.ine && c.od >= "06:00" && c.do <= "21:00" && c.od < c.do && Number(c.od.slice(3)) < 60 && Number(c.do.slice(3)) < 60);
  const rady: (typeof casy)[] = [];
  let aktualne: typeof casy = [];
  for (const c of casy) {
    if (aktualne.length && c.od >= aktualne.at(-1)!.do && minuty(c.od) - minuty(aktualne.at(-1)!.do) <= 90) aktualne.push(c);
    else if (aktualne.length && c.od < aktualne.at(-1)!.do && c.od > aktualne[0]!.od) continue;
    else { if (aktualne.length) rady.push(aktualne); aktualne = [c]; }
  }
  if (aktualne.length) rady.push(aktualne);
  const bezne = (r: typeof casy) => r.filter((c) => { const d = minuty(c.do) - minuty(c.od); return d >= 40 && d <= 50; }).length;
  const najlepsi = rady.filter((r) => r.length >= 5).sort((a, b) => bezne(b) - bezne(a))[0] ?? [];
  // Čísla hodín z textu, ak sú všetky a rastú; inak poradie od 1.
  const cisla = najlepsi.map((c) => c.n);
  const zTextu = cisla.every((n, i) => n !== undefined && (i === 0 || Number(n) > Number(cisla[i - 1])));
  return orez(najlepsi.map((c, i) => ({ n: zTextu ? c.n! : String(i + 1), od: c.od, do: c.do })));
}

const VZOR_ODKAZU = /zvonen|organizacia vyuc|organizacia skolskeho|casovy harmonogram|rozvrh hodin|skolsky poriadok|skolsky-poriadok|vnutorny poriadok|vnutorny-poriadok|vnutorny rezim|poriadok skoly|organizacny poriadok|dokument/;
function odkazyNaZvonenie(html: string, base: string) {
  const out: { url: string; vaha: number }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]{0,300}?)<\/a>/gi)) {
    const ciel = bezDiakritiky(`${dekoduj(m[1]!)} ${dekoduj(m[2]!.replace(/<[^>]+>/g, " "))}`);
    if (!VZOR_ODKAZU.test(ciel)) continue;
    const vaha = /zvonen/.test(ciel) ? 0 : /poriad|organizacia|rezim|harmonogram|rozvrh/.test(ciel) ? 1 : 2;
    try {
      const u = new URL(dekoduj(m[1]!).trim(), base);
      if ((u.protocol === "http:" || u.protocol === "https:") && !zakazana(u.href)) out.push({ url: u.href, vaha });
    } catch {}
  }
  return [...new Map(out.sort((a, b) => a.vaha - b.vaha).map((o) => [o.url, o])).keys()].slice(0, 6);
}

const CUDZIE = /facebook|instagram|youtube|youtu\.be|twitter|x\.com|tiktok|linkedin|google|gstatic|edupage|asc\.sk|minedu|gov\.sk|iedu\.sk|cvtisr|eu\/|europa\.eu|zsk\.sk|vucbb|bbsk|kosickykraj|po-kraj|tsk\.sk|trnava-vuc|unsk|region-bsk|bratislavskykraj|wikipedia|microsoft|office|apple|schema\.org|w3\.org|cloudflare|jquery|fonts\.|maps\.|mapy\.|teams|zoom|erasmus|etwinning|sk-nic|osobnyudaj|gdpr|dpo\.|ochranaudajov/i;
// Najčastejšia externá doména v odkazoch titulky EduPage, ktorá nie je sociálna sieť ani úrad.
function vlastnyWeb(html: string) {
  const pocty = new Map<string, number>();
  for (const m of html.matchAll(/href="(https?:\/\/[^"\/]+)[^"]*"/gi)) {
    const origin = m[1]!.toLowerCase();
    if (CUDZIE.test(origin)) continue;
    pocty.set(origin, (pocty.get(origin) ?? 0) + 1);
  }
  return [...pocty.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function inySystem(html: string) {
  const h = html.toLowerCase();
  const najdene: string[] = [];
  if (h.includes("bakalari")) najdene.push("Bakaláři");
  if (h.includes("skolaonline")) najdene.push("Škola OnLine");
  if (/asc ?(timetables|rozvrhy)|asctimetables/.test(h)) najdene.push("aSc Rozvrhy (export)");
  if (/izus\.sk/.test(h)) najdene.push("iZUŠ");
  if (/rozvrh[^"'<>]{0,80}\.pdf/.test(h)) najdene.push("rozvrh v PDF");
  return najdene;
}

// Predvolené zvonenie EduPage (8:00–8:45, 9:00–9:45, …): každá hodina okrem nultej začína celou hodinou.
export const predvolene = (h: Hodina[]) => { const z = h.filter((x) => x.n !== "0"); return z.length > 0 && z.every((x) => x.od.endsWith(":00")); };

// Krajné riadky, ktoré nie sú vyučovacia hodina (ranný kruh, ranná družina, ŠKD po vyučovaní), a prekryvy zahodí.
function orez(h: Hodina[]) {
  const dlzka = (x: Hodina) => minuty(x.do) - minuty(x.od);
  let z = [...h];
  // Na kraji: neobvyklá dĺžka, alebo odstup od ďalšej hodiny viac ako 90 min (družina popoludní).
  while (z.length > 1 && (dlzka(z[0]!) < 30 || dlzka(z[0]!) > 60 || minuty(z[1]!.od) - minuty(z[0]!.do) > 90)) z = z.slice(1);
  while (z.length > 1 && (dlzka(z.at(-1)!) < 30 || dlzka(z.at(-1)!) > 60 || minuty(z.at(-1)!.od) - minuty(z.at(-2)!.do) > 90)) z = z.slice(0, -1);
  return z.filter((x, i) => i === 0 || minuty(x.od) >= minuty(z[i - 1]!.do));
}
/** Upravené zvonenie, ak vyzerá ako riadne vyučovanie, inak null. */
export function platne(h: Hodina[]) { const o = orez(h); return kontrolaZvonenia(o) ? o : null; }

const minuty = (s: string) => { const [h, m] = s.split(":").map(Number); return h! * 60 + m!; };

// Školský rok začína v auguste (rozvrhy na nový rok sa zverejňujú koncom augusta).
export const skolskyRok = (d = new Date()) => d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;

// Zoznam rozvrhov školy: jedna požiadavka, na nej stojí aj lacná kontrola zmien pri obnove.
export async function ttviewer(sub: string) {
  const tv = await stiahni(`https://${sub}.edupage.org/timetable/server/ttviewer.js?__func=getTTViewerData`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ __args: [null, skolskyRok()], __gsh: "00000000" }),
  });
  let r: Row | undefined;
  try { r = (JSON.parse(tv.text) as { r?: Row }).r; } catch {}
  return { tv, r };
}

async function rozvrhEdupage(sub: string) {
  const { tv, r } = await ttviewer(sub);
  // Prázdna odpoveď 200: škola nemá v EduPage modul rozvrhu.
  if (!r && tv.ok && !tv.text.trim()) return { stav: "bez_rozvrhu" as const, detail: "ttviewer prázdny" };
  if (!r) return { stav: "chyba" as const, detail: `ttviewer ${tv.status}` };
  const regular = (r.regular ?? {}) as { default_num?: string; timetables?: Row[] };
  const tts = regular.timetables ?? [];
  if (!tts.length && r.asklogin) return { stav: "len_prihlasenie" as const };
  const num = regular.default_num ?? (tts.at(-1)?.tt_num as string | undefined);
  if (!num) return { stav: "bez_rozvrhu" as const };
  const rt = await stiahni(`https://${sub}.edupage.org/timetable/server/regulartt.js?__func=regularttGetData`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ __args: [null, num], __gsh: "00000000" }),
  });
  let tables: Row[] = [];
  try { tables = ((JSON.parse(rt.text) as { r?: { dbiAccessorRes?: { tables?: Row[] } } }).r?.dbiAccessorRes?.tables) ?? []; } catch {}
  if (!tables.length) return { stav: /opr[aá]vnen/i.test(rt.text) ? "len_prihlasenie" as const : "chyba" as const, detail: `regulartt ${rt.status}` };
  const T = Object.fromEntries(tables.map((t) => [t.id as string, (t.data_rows ?? []) as Row[]]));
  // Prázdna škrupina (žiadne alebo pár hodín): nie je to rozvrh a jej zvonenie býva predvolené.
  if ((T.cards ?? []).length < 50 || !(T.lessons ?? []).length) return { stav: "prazdny_rozvrh" as const, detail: `karty ${(T.cards ?? []).length}` };
  await Bun.write(`${RAW}/${sub}.json.gz`, gzipSync(rt.text));
  const lekcie = new Map((T.lessons ?? []).map((l) => [l.id as string, l]));
  const pouzite = new Set((T.cards ?? []).filter((c) => lekcie.has(c.lessonid as string)).map((c) => String(c.period)));
  const hodiny = (T.periods ?? []).filter((p) => p.starttime && p.endtime)
    .map((p) => ({ n: String(p.period), od: String(p.starttime).padStart(5, "0"), do: String(p.endtime).padStart(5, "0"), pouzita: pouzite.has(String(p.period)) }));
  const tt = tts.find((t) => t.tt_num === num);
  return {
    stav: "verejny" as const,
    rozvrh: {
      nazov: (tt?.text as string) ?? null, od: (tt?.datefrom as string) ?? null, tt_num: num,
      dni: (T.days ?? []).length, triedy: (T.classes ?? []).length, ucitelia: (T.teachers ?? []).length,
      ucebne: (T.classrooms ?? []).length, lekcie: lekcie.size, karty: (T.cards ?? []).length,
      dvojhodiny: [...lekcie.values()].filter((l) => Number(l.durationperiods) > 1).length,
    },
    hodiny,
  };
}

// Zvonenie z widgetu alebo textu: zlé dáta neprepíšu dobré.
function kontrolaZvonenia(h: Hodina[]) {
  if (h.length < 3) return false;
  const dlzky = h.map((x) => minuty(x.do) - minuty(x.od));
  for (let i = 0; i < h.length; i++) {
    if (dlzky[i]! < 20 || dlzky[i]! > 120) return false;
    if (i && minuty(h[i]!.od) - minuty(h[i - 1]!.do) < 0) return false;
    if (i && minuty(h[i]!.od) - minuty(h[i - 1]!.do) > 90) return false;
  }
  if (predvolene(h)) return false;
  // Bežné vyučovanie: aspoň 80 % hodín trvá 40 až 50 minút a najviac 2 dlhé prestávky.
  const dlhe = h.slice(1).filter((x, i) => minuty(x.od) - minuty(h[i]!.do) > 25).length;
  return dlzky.filter((d) => d >= 40 && d <= 50).length >= 0.8 * h.length && dlhe <= 2;
}

// Prejde odkazy na zvonenie / školský poriadok / dokumenty do hĺbky 2, najviac 8 stránok alebo PDF.
// Na EduPage skúsi aj /a/skolsky-poriadok, aj keď naň titulka neodkazuje.
async function hladajZvonenie(html: string, base: string, zdroj: string) {
  const navstivene = new Set<string>([base]);
  let fronta = odkazyNaZvonenie(html, base);
  const host = new URL(base).origin;
  if (/edupage/i.test(html) && !fronta.some((u) => u.includes("skolsky-poriadok"))) fronta.push(`${host}/a/skolsky-poriadok`);
  for (let hlbka = 0; hlbka < 2 && fronta.length; hlbka++) {
    const dalsie: string[] = [];
    for (const odkaz of fronta) {
      if (navstivene.has(odkaz) || navstivene.size > 8) continue;
      navstivene.add(odkaz);
      const p = await stiahni(odkaz);
      if (!p.ok) continue;
      const z = platne(zvonenieZTextu(p.text));
      if (z) return { hodiny: z, zdroj: p.pdf ? `${zdroj} (súbor)` : zdroj, url: odkaz };
      if (!p.pdf) dalsie.push(...odkazyNaZvonenie(p.text, p.url));
    }
    fronta = dalsie;
  }
  return null;
}

export async function preskumaj(s: Skola) {
  const vysledok: Row = { eduid: s.eduid, nazov: s.nazov, kraj: s.kraj, typ: s.typ, zriadovatel: s.zriadovatel, miesto: s.miesto, web: s.web, skontrolovane: new Date().toISOString() };
  const kandidati: { sub: string; zdroj: string }[] = [];
  // Register má niekedy viac adries naraz („a.sk, b.edupage.org“): prednosť má EduPage.
  const adresy = (s.web ?? "").split(/[\s,;]+/).filter((a) => /\./.test(a));
  const prva = adresy.find((a) => /\.edupage\.org/i.test(a)) ?? adresy[0];
  const webUrl = prva ? (/^https?:/i.test(prva) ? prva : `https://${prva}`) : null;

  const rucne = RUCNE[s.eduid];
  if (rucne) kandidati.push({ sub: rucne.sub, zdroj: "ručne" });
  if (webUrl && /\.edupage\.org/i.test(webUrl)) {
    kandidati.push({ sub: subZHostu(new URL(webUrl).hostname), zdroj: "register" });
  } else if (webUrl && !rucne) {
    let w = await stiahni(webUrl);
    if (!w.ok && webUrl.startsWith("https:")) w = await stiahni(webUrl.replace(/^https:/, "http:"));
    vysledok.web_stav = w.status;
    vysledok.web_konecna = w.url;
    if (w.ok) {
      if (jeEdupage(w.url)) kandidati.push({ sub: subZHostu(new URL(w.url).hostname), zdroj: "presmerovanie webu" });
      // Vlastná doména na EduPage: stránka sa načítava z EduPage, subdoména je v skriptoch.
      for (const sub of subdomenyZHtml(w.text).slice(0, 2)) kandidati.push({ sub, zdroj: "odkaz z webu" });
      vysledok.iny_system = inySystem(w.text);
      const zvWeb = platne(zvonenieZWidgetu(w.text));
      const zvText = zvWeb ?? platne(zvonenieZTextu(w.text));
      if (zvText) vysledok.zvonenie = { hodiny: zvText, zdroj: zvWeb ? "widget na webe školy" : "text webu školy", url: w.url };
      vysledok.web_html = w.text;
    }
  }

  for (const k of kandidati) {
    const hp = await stiahni(`https://${k.sub}.edupage.org/`);
    // Subdoména, ktorá presmeruje mimo EduPage (zrušená, cudzí web), nie je rozvrh školy.
    if (hp.ok && !jeEdupage(hp.url)) { (vysledok.zamietnute ??= [] as Row[]) && (vysledok.zamietnute as Row[]).push({ ...k, dovod: `presmeruje na ${new URL(hp.url).hostname}` }); continue; }
    if (!hp.ok) { (vysledok.zamietnute ??= [] as Row[]) && (vysledok.zamietnute as Row[]).push({ ...k, dovod: `HTTP ${hp.status}` }); continue; }
    const adresa = zhodaAdresy(hp.text, s);
    // Z registra berieme subdoménu aj bez zhody adresy (titulka ju nemusí mať), z odkazov len so zhodou.
    if (k.zdroj !== "register" && k.zdroj !== "ručne" && !adresa.ok) { (vysledok.zamietnute ??= [] as Row[]) && (vysledok.zamietnute as Row[]).push({ ...k, dovod: "adresa nesedí" }); continue; }
    // Zlúčené školy: stará subdoména presmeruje na novú, POST rozvrhu musí ísť priamo na ňu.
    const sub = jeEdupage(hp.url) ? subZHostu(new URL(hp.url).hostname) : k.sub;
    vysledok.edupage = { sub, ...(sub !== k.sub ? { povodna: k.sub } : {}), zdroj: k.zdroj, titulka: hp.url, title: hp.text.match(/<title>([^<]*)/)?.[1]?.trim() ?? null, adresa };
    const tt = await rozvrhEdupage(sub);
    vysledok.rozvrh_stav = tt.stav;
    if ("detail" in tt) vysledok.rozvrh_detail = tt.detail;
    if (tt.stav === "verejny") {
      vysledok.rozvrh = tt.rozvrh;
      // Predvolené zvonenie EduPage (8:00, 9:00, …) nie je skutočné: rozvrh je verejný, časy hodín hľadáme inde.
      const pred = predvolene(tt.hodiny.filter((h) => h.pouzita));
      vysledok.zvonenie = { hodiny: tt.hodiny, zdroj: "EduPage API (rozvrh)", url: `https://${sub}.edupage.org/timetable/`, ...(pred ? { predvolene: true } : {}) };
    }
    if (tt.stav !== "verejny" || (vysledok.zvonenie as Row).predvolene) {
      const widget = platne(zvonenieZWidgetu(hp.text));
      const titulka = widget ? null : platne(zvonenieZTextu(hp.text));
      if (widget) vysledok.zvonenie = { hodiny: widget, zdroj: "EduPage widget na titulke", url: hp.url };
      else if (titulka) vysledok.zvonenie = { hodiny: titulka, zdroj: "text titulky na EduPage", url: hp.url };
      else {
        const z = await hladajZvonenie(hp.text, hp.url, "text stránky na EduPage");
        if (z) vysledok.zvonenie = z;
        else {
          // Škola má popri EduPage vlastný web (často tam je školský poriadok so zvonením).
          const vlastny = vlastnyWeb(hp.text);
          if (vlastny) {
            const w = await stiahni(vlastny);
            // Najčastejšia cudzia doména na titulke nemusí byť web školy (unicef.sk, strava.cz): musí na nej sedieť adresa.
            const zw = w.ok && !w.pdf && zhodaAdresy(w.text, s).ok ? await hladajZvonenie(w.text, w.url, "web školy") : null;
            if (zw) vysledok.zvonenie = zw;
            vysledok.vlastny_web = vlastny;
          }
        }
      }
    }
    vysledok.iny_system ??= inySystem(hp.text);
    break;
  }

  if (!vysledok.zvonenie && vysledok.web_html) {
    const z = await hladajZvonenie(vysledok.web_html as string, vysledok.web_konecna as string, "text podstránky webu školy");
    if (z) vysledok.zvonenie = z;
  }
  delete vysledok.web_html;
  vysledok.rozvrh_stav ??= "bez_edupage";
  return vysledok;
}

if (import.meta.main) {
  const ARGY = process.argv.slice(2);
  const ZS = ARGY.includes("--zs");
  const DO = ARGY.find((a) => a.startsWith("--do="))?.slice(5);
  const VYSTUP = ZS ? "data/zs/prieskum" : "data/prieskum";
  zamkni();
  await mkdir(VYSTUP, { recursive: true });
  await mkdir("data/raw", { recursive: true });
  await mkdir("data/tmp", { recursive: true });
  const vsetky = (await Bun.file(ZS ? "data/zs/skoly-register.json" : "data/skoly-register.json").json()) as Skola[];
  const vyber = ARGY.filter((a) => !a.startsWith("--"));
  const zoznam = vyber.length ? vsetky.filter((s) => vyber.includes(s.eduid)) : vsetky;
  const SUBEZNE = 6;
  let hotovo = 0;
  const fronta = [...zoznam];
  await Promise.all(Array.from({ length: SUBEZNE }, async () => {
    for (let s = fronta.shift(); s; s = fronta.shift()) {
      if (DO && new Date().toTimeString().slice(0, 5) >= DO) { console.log(`zastavené o ${DO}`); break; }
      if (zablokovane) { console.log("zastavené: EduPage odpovedá 403/429, ďalšie požiadavky by blok predĺžili"); break; }
      const subor = Bun.file(`${VYSTUP}/${s.eduid}.json`);
      if (!vyber.length && (await subor.exists())) { hotovo++; continue; }
      const v = await preskumaj(s);
      if (zablokovane) break; // výsledok z času blokovania by bol chybný
      await Bun.write(subor, JSON.stringify(v, null, 1));
      hotovo++;
      if (hotovo % 20 === 0 || vyber.length) console.log(`${hotovo}/${zoznam.length} ${s.eduid} ${v.rozvrh_stav} ${(v.zvonenie as Row | undefined)?.zdroj ?? "bez zvonenia"} | ${s.nazov.slice(0, 50)}`);
    }
  }));
  console.log("hotovo", hotovo, "požiadaviek", poziadavky);
}
