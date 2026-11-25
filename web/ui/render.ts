// Vzhľad webu: z hotových údajov (web/stranky.ts) skladá celé HTML každej stránky.
// Štýly sú v assets/styl.css, správanie (hľadanie, triedenie osi, mriežka triedy) v klient.ts.
// HTML stránok školy a mesta je zámerne úsporné: krátke triedy, časy hodín ako --s a --e v minútach.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { SkolaKratko } from "../data";
import { vDruhu, vObci } from "../obce";
import type { Api, Domov, Hlava, Kraj, Mesto, Omrvinka, OProjekte, Pocty, StrankaSkoly, VsPredmet, VsStranka, VysokeSkoly } from "../stranky";

const GITHUB = "https://github.com/Gooder24/rozvrh";
const WEB = "https://rozvrh.dvoriste.xyz";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Verzia súborov vzhľadu do adresy, aby sa po nasadení nenačítal starý štýl z medzipamäte. */
const verzia = createHash("sha1").update(["assets/styl.css", "klient.ts"].map((s) => readFileSync(new URL(s, import.meta.url))).join("")).digest("hex").slice(0, 8);
const zostavene = new Date().toISOString();

const cas = (t: string) => t.replace(/^0(\d)/, "$1");
const minuty = (t: string) => { const [h, m] = t.split(":"); return Number(h) * 60 + Number(m); };
const sklonuj = (n: number, jeden: string, dva: string, pat: string) => `${n} ${n === 1 ? jeden : n >= 2 && n <= 4 ? dva : pat}`;
const skol = (n: number) => sklonuj(n, "škola", "školy", "škôl");
const hodin = (n: number) => sklonuj(n, "hodina", "hodiny", "hodín");
const percent = (cast: number, celok: number) => `${celok ? Math.round((cast / celok) * 100) : 0} %`;
const datumSk = new Intl.DateTimeFormat("sk-SK", { timeZone: "Europe/Bratislava", day: "numeric", month: "numeric", year: "numeric" });
const datum = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? esc(iso) : `<time datetime="${esc(iso.slice(0, 10))}">${datumSk.format(d).replace(/ /g, "\u00a0")}</time>`; };

const znacka = `<svg viewBox="0 0 30 20" aria-hidden="true"><rect y="3" width="8" height="14" rx="2.5"/><rect x="10" y="3" width="8" height="14" rx="2.5"/><rect x="23" y="3" width="7" height="14" rx="2.5"/></svg>`;

function obal(h: Hlava, telo: string, v: { omrvinky?: Omrvinka[]; hladanie?: boolean; vytvorene?: string } = {}) {
  const hladanie = v.hladanie === false ? "" : `<form class="hladaj-male" action="/" role="search"><label class="vh" for="q">Hľadať školu alebo obec</label><input class="pole" id="q" name="q" type="search" placeholder="Škola alebo obec" autocomplete="off"><button class="tlacidlo">Hľadať</button></form>`;
  const omrvinky = v.omrvinky?.length ? `<nav aria-label="Kde som"><ol class="omrvinky">${v.omrvinky.map((o) => `<li><a href="${esc(o.cesta)}">${esc(o.nazov)}</a></li>`).join("")}</ol></nav>` : "";
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${h.html}
<link rel="preload" href="/assets/pismo/next-latin.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/assets/pismo/next-ext.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/assets/styl.css?v=${verzia}"><link rel="icon" href="/assets/ikona.svg" type="image/svg+xml"><meta name="theme-color" content="#f4f7fa" media="(prefers-color-scheme:light)"><meta name="theme-color" content="#12161d" media="(prefers-color-scheme:dark)"><script src="/assets/klient.js?v=${verzia}" defer></script></head>
<body><a class="preskoc" href="#obsah">Preskočiť na obsah</a><header class="obal hlavicka"><a class="znacka" href="/">${znacka}<span>Rozvrhy škôl</span></a>${hladanie}</header>
<main class="obal" id="obsah">${omrvinky}${telo}</main>
<footer class="obal"><div class="patka"><p>Údaje: register škôl CVTI SR, verejné rozvrhy na EduPage a weby škôl. Zostavené ${datum(v.vytvorene ?? zostavene)}.</p><ul><li><a href="/vysoke-skoly/">Vysoké školy (beta)</a></li><li><a href="/api/">API a MCP</a></li><li><a href="/o-projekte/">O projekte</a></li><li><a href="${GITHUB}">GitHub</a></li></ul></div></footer></body></html>`;
}

// Stavy škôl ---------------------------------------------------------------------------------------------------
const STAVY = { a: "verejný rozvrh", b: "len zvonenie", c: "nenájdené" } as const;
const legendaStavov = `<p class="legenda"><span><i class="st a"></i>verejný rozvrh tried aj zvonenie</span><span><i class="st b"></i>len zvonenie</span><span><i class="st c"></i>zatiaľ nenájdené</span></p>`;

/** Pruh podielov troch stavov. Čísla sú v pruhu pre oči, pre čítačku je vedľa neho veta. */
const pruh = (p: Pocty) => `<div class="pruh" aria-hidden="true">${([["a", p.verejny_rozvrh], ["b", p.len_zvonenie], ["c", p.nenajdene]] as const)
  .filter(([, n]) => n > 0).map(([k, n]) => `<i class="${k}" style="--n:${n}">${n}</i>`).join("")}</div>`;
const poctySlovom = (p: Pocty) => `verejný rozvrh ${p.verejny_rozvrh}, len zvonenie ${p.len_zvonenie}, nenájdené ${p.nenajdene}`;
const riadokPrehladu = (nazov: string, p: Pocty, cesta?: string) =>
  `<li><span class="nz">${cesta ? `<a href="${esc(cesta)}">${esc(nazov)}</a>` : esc(nazov)}</span><span class="pocet">${p.spolu}<span class="vh"> škôl: ${poctySlovom(p)}</span></span>${pruh(p)}</li>`;

/** Ulica príde, keď ju zostavenie pridá do SkolaKratko; dovtedy školu v obci odlíši adresa EduPage alebo druh. */
const ulica = (s: object) => { const u = (s as { ulica?: unknown }).ulica; return typeof u === "string" && u ? u : null; };
const podNazvom = (s: SkolaKratko) => ulica(s) ?? (s.edupage ? `${s.edupage}.edupage.org` : s.druh);
const stavBezOsi = (s: SkolaKratko) =>
  s.stav === "verejny_rozvrh" ? "rozvrh tried je verejný, skutočné zvonenie nepoznáme"
  : s.stav === "len_zvonenie" ? "zvonenie je na stránke školy"
  : s.edupage ? "rozvrh na EduPage nie je verejný, zvonenie sme nenašli"
  : "zatiaľ nenájdené";

// Časová os ----------------------------------------------------------------------------------------------------
type HodinaOsi = { n: string; od: string; do: string; pouzita: boolean };
/** Bez zjavných chýb zberu: hodina 00:00–00:00 a časy po polnoci (EduPage niekde pokračuje až do „31:45“). */
const citatelne = <T extends { od: string; do: string }>(h: T[]) => h.filter((x) => minuty(x.od) < 1440 && minuty(x.do) <= 1440 && minuty(x.do) > 0);
/** Hodiny, ktoré sa dajú nakresliť na os. */
const platne = (h: HodinaOsi[]) => h.filter((x) => minuty(x.do) > minuty(x.od) && minuty(x.od) >= 300 && minuty(x.do) <= 1320);
/** Začiatok prvej a koniec poslednej použitej hodiny. */
const rozpatie = (h: HodinaOsi[]) => { const p = citatelne(h).filter((x) => x.pouzita); return p.length ? { od: p[0]!.od, do: p.at(-1)!.do, pocet: p.length } : null; };
/** Rozsah osi na celé hodiny podľa použitých hodín; večerné výnimky po 20:00 os nenaťahujú. */
function rozsah(hodiny: HodinaOsi[]) {
  const z = hodiny.some((h) => h.pouzita) ? hodiny.filter((h) => h.pouzita) : hodiny;
  let t0 = Math.floor(Math.min(...z.map((h) => minuty(h.od))) / 60) * 60;
  let t1 = Math.min(Math.ceil(Math.max(...z.map((h) => minuty(h.do))) / 60) * 60, 1200);
  if (t1 - t0 < 360) t1 = t0 + 360;
  if (t1 > 1320) { t1 = 1320; t0 = Math.min(t0, t1 - 360); }
  return { t0, t1, h: (t1 - t0) / 60 };
}
const cisloHodiny = (n: string) => { const k = n.trim().replace(/\.$/, ""); return k.length <= 2 ? k : ""; };
const trat = (hodiny: HodinaOsi[], popis: string) =>
  `<div class="trat" role="img" aria-label="${esc(popis)}">${hodiny.map((h) => `<i${h.pouzita ? "" : ` class="n"`} style="--s:${minuty(h.od)};--e:${minuty(h.do)}">${esc(cisloHodiny(h.n))}</i>`).join("")}</div>`;
const popisTrate = (hodiny: HodinaOsi[]) => {
  const p = hodiny.filter((h) => h.pouzita);
  return `${hodin(p.length)}: ${p.map((h) => `${/^\d+$/.test(h.n.trim()) ? `${h.n.trim()}.` : h.n.trim()} ${cas(h.od)}–${cas(h.do)}`).join(", ")}`;
};
const cislaOsi = (r: { t0: number; h: number }) =>
  `<div class="os-cisla" aria-hidden="true">${Array.from({ length: r.h + 1 }, (_, i) => `<b style="--i:${i}">${r.t0 / 60 + i}:00</b>`).join("")}</div>`;
const stylOsi = (r: { t0: number; t1: number; h: number }) => `--t0:${r.t0};--tr:${r.t1 - r.t0};--h:${r.h}`;

// Stránky ------------------------------------------------------------------------------------------------------
export const domov = (d: Domov) => {
  const c = d.celkom.spolu;
  return obal(d.hlava, `<h1>Kedy zvoní na slovenských školách</h1>
<p class="uvod">Zvonenie a rozvrhy hodín ${c.spolu} základných a stredných škôl na jednom mieste: kedy sa začína prvá hodina, aké dlhé sú prestávky a kedy sa vyučovanie končí.</p>
<form class="hladanie" id="hladanie" action="/" role="search"><label for="q">Nájdite školu alebo obec</label><div><input class="pole" id="q" name="q" type="search" placeholder="napríklad Gymnázium Žilina alebo Bytča" autocomplete="off" aria-describedby="hladanie-stav"><button class="tlacidlo">Hľadať</button></div></form>
<p class="pocet-najdenych" id="hladanie-stav" role="status"><noscript>Hľadanie potrebuje JavaScript. Školu nájdete aj cez kraj a obec nižšie.</noscript></p><div id="vysledky"></div>
<section><h2>Čo o školách vieme</h2>
<p class="uvod">Pri ${c.zvonenie} z ${c.spolu} škôl (${percent(c.zvonenie, c.spolu)}) poznáme skutočné zvonenie a ${c.verejny_rozvrh} škôl má verejný rozvrh tried. Ako údaje vznikajú, píšeme <a href="/o-projekte/">o projekte</a>.</p>
<div class="tabula"><ul class="prehlad">${riadokPrehladu("Stredné školy", d.celkom["SŠ"])}${riadokPrehladu("Základné školy", d.celkom["ZŠ"])}${riadokPrehladu("Spolu", c)}</ul>${legendaStavov}</div></section>
<section><h2>Kraje</h2><div class="tabula"><ul class="prehlad">${d.kraje.map((k) => riadokPrehladu(`${k.nazov} kraj`, k.pocty, k.cesta)).join("")}</ul></div></section>
<section><h2>Najviac škôl</h2><ul class="stlpce">${d.mesta.map((m) => `<li><a href="${esc(m.cesta)}">${esc(m.nazov)}</a><small>${skol(m.pocet)}</small></li>`).join("")}</ul></section>
<section class="text"><h2>Vysoké školy <span class="beta-znak">beta</span></h2><p>Vysoká škola nemá rozvrh triedy, predmety si študent zapisuje sám. V skúšobnej verzii ukazujeme, aké predmety má študijný program v ktorom semestri, a dá sa z nich poskladať týždeň, akoby vás prijali. <a href="/vysoke-skoly/">Vyskúšať</a>.</p></section>
<section class="text"><h2>Údaje pre aplikácie</h2><p>Všetko, čo je na stránke, sa dá čítať aj strojovo: otvorené API bez kľúča, súbory JSON a CSV na stiahnutie a MCP server pre Claude, ChatGPT či Cursor. Návod a príklady sú na stránke <a href="/api/">API a MCP</a>.</p></section>`, { hladanie: false, vytvorene: d.vytvorene });
};

export const kraj = (d: Kraj) => {
  const okresy = new Map<string, Kraj["mesta"]>();
  for (const m of d.mesta) okresy.set(m.okres, [...(okresy.get(m.okres) ?? []), m]);
  const stvorceky = (p: Pocty) => `<span class="stv" aria-hidden="true">${"<i class=\"st a\"></i>".repeat(p.verejny_rozvrh)}${"<i class=\"st b\"></i>".repeat(p.len_zvonenie)}${"<i class=\"st c\"></i>".repeat(p.nenajdene)}</span>`;
  return obal(d.hlava, `<h1>${esc(d.nazov)} kraj</h1>
<p class="uvod">${skol(d.pocty.spolu)} v ${sklonuj(d.mesta.length, "obci", "obciach", "obciach")}. Jeden štvorček je jedna škola.</p>
<div class="tabula"><ul class="prehlad">${riadokPrehladu("Školy v kraji", d.pocty)}</ul>${legendaStavov}</div>
${[...okresy].sort((a, b) => a[0].localeCompare(b[0], "sk")).map(([okres, mesta]) => `<section class="okres"><h2>Okres ${esc(okres)}</h2><ul class="obce">${mesta.map((m) =>
    `<li><a href="${esc(m.cesta)}">${esc(m.nazov)}</a>${stvorceky(m.pocty)}<span class="vh">${skol(m.pocty.spolu)}: ${poctySlovom(m.pocty)}</span></li>`).join("")}</ul></section>`).join("")}`, { omrvinky: d.omrvinky });
};

export const mesto = (d: Mesto) => {
  const sk = (a: { nazov: string }, b: { nazov: string }) => a.nazov.localeCompare(b.nazov, "sk");
  const naOsi = d.skoly.flatMap((s) => { const hodiny = platne(s.hodiny), r = rozpatie(s.hodiny); return hodiny.length && r ? [{ s, hodiny, r }] : []; })
    .sort((a, b) => minuty(a.r.od) - minuty(b.r.od) || sk(a.s, b.s));
  const bez = d.skoly.filter((s) => !naOsi.some((x) => x.s === s)).sort(sk);
  const r = naOsi.length ? rozsah(naOsi.flatMap((x) => x.hodiny)) : null;
  const stupne = new Set(naOsi.map((x) => x.s.stupen));
  const nepouzite = naOsi.some((x) => x.hodiny.some((h) => !h.pouzita));
  const os = r ? `<div class="tabula os" id="os" style="${stylOsi(r)}">
<div class="volby"><div role="group" aria-label="Zoradiť školy"><span aria-hidden="true">Zoradiť</span><button class="volba" data-zorad="od" aria-pressed="true">podľa začiatku</button><button class="volba" data-zorad="do" aria-pressed="false">podľa konca</button><button class="volba" data-zorad="nazov" aria-pressed="false">podľa názvu</button></div>${stupne.size > 1 ? `<div role="group" aria-label="Ukázať školy"><span aria-hidden="true">Ukázať</span><button class="volba" data-stupen="" aria-pressed="true">všetky</button><button class="volba" data-stupen="ZŠ" aria-pressed="false">základné</button><button class="volba" data-stupen="SŠ" aria-pressed="false">stredné</button></div>` : ""}</div>
<div class="os-hlava" aria-hidden="true"><span>Škola</span><span class="od">Začiatok</span><span class="do">Koniec</span>${cislaOsi(r)}</div>
<ol class="os-rady">${naOsi.map(({ s, hodiny, r }) => `<li data-o="${minuty(r.od)}" data-k="${minuty(r.do)}" data-st="${s.stupen}"><div class="kto"><a href="${esc(s.cesta)}">${esc(s.nazov)}</a><small>${esc(podNazvom(s))}${s.stav === "verejny_rozvrh" ? ", rozvrh tried" : ""}</small></div><span class="od"><span class="vh">začiatok </span>${cas(r.od)}</span><span class="do"><span class="vh">koniec </span>${cas(r.do)}</span>${trat(hodiny, popisTrate(hodiny))}</li>`).join("")}</ol>
<p class="legenda"><span><i class="st a"></i>vyučovacia hodina</span>${nepouzite ? `<span><i class="st n"></i>hodina v zvonení, ktorú rozvrh nepoužíva</span>` : ""}<span class="vh" id="os-stav" role="status"></span></p></div>` : "";
  return obal(d.hlava, `<h1>Kedy zvoní ${esc(vObci(d.nazov))}</h1>
<p class="uvod">${skol(d.pocty.spolu)}, okres ${esc(d.okres)}. ${naOsi.length ? `Zvonenie poznáme pri ${naOsi.length === d.pocty.spolu ? (naOsi.length === 1 ? "nej" : "všetkých") : naOsi.length}: každý riadok je jedna škola, každý modrý blok jedna vyučovacia hodina.` : "Zvonenie tu zatiaľ nepoznáme pri žiadnej."}</p>
${os}${bez.length ? `<section><h2>${naOsi.length ? "Školy bez zvonenia" : "Školy"}</h2><ul class="zoznam">${bez.map((s) => `<li><span><a href="${esc(s.cesta)}">${esc(s.nazov)}</a> <small>${esc(podNazvom(s))}</small></span><span class="stav">${stavBezOsi(s)}</span></li>`).join("")}</ul></section>` : ""}`, { omrvinky: d.omrvinky });
};

export const skola = (d: StrankaSkoly) => {
  const s = d.skola;
  const hodiny: HodinaOsi[] = citatelne(s.zvonenie?.hodiny ?? []).map((h) => ({ ...h, pouzita: h.pouzita !== false }));
  const rp = rozpatie(hodiny);
  const pouzite = hodiny.filter((h) => h.pouzita);
  const dlzky = new Set(pouzite.map((h) => minuty(h.do) - minuty(h.od)));
  const edupage = s.edupage ? `https://${s.edupage}.edupage.org/` : null;
  const veta = rp
    ? `Vyučovanie sa začína o <b>${cas(rp.od)}</b> a posledná hodina sa končí o <b>${cas(rp.do)}</b>. Zvonenie má ${hodin(rp.pocet)}${dlzky.size === 1 ? ` po ${[...dlzky][0]} minút` : ""}.`
    : s.stav === "verejny_rozvrh" ? "Rozvrh tried je verejný, skutočné zvonenie však nepoznáme: škola má v EduPage len predvolené časy (8:00, 9:00, 10:00…)."
    : `Verejný rozvrh ani zvonenie tejto školy sme zatiaľ nenašli.${edupage ? " Škola používa EduPage, rozvrh tam môže byť dostupný po prihlásení." : ""} Ak ich škola zverejňuje, <a href="${GITHUB}/issues">napíšte nám, kde</a>.`;
  // Zvonenie ako deň zhora nadol: každá hodina s presným časom a medzi nimi prestávky, vyššie podľa toho, ako dlho trvajú.
  const trvanie = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);
  const zvonenie = s.zvonenie ? `<section><h2>Zvonenie</h2><p class="teraz" id="teraz" role="status"></p>
<div class="dvoje"><ol class="zvon">${hodiny.map((h, i) => {
    const dalsia = hodiny[i + 1];
    const prestavka = dalsia ? minuty(dalsia.od) - minuty(h.do) : 0;
    const n = /^\d+$/.test(h.n.trim()) ? `${h.n.trim()}.` : h.n.trim();
    return `<li class="hod${h.pouzita ? "" : " n"}" data-n="${esc(h.n.trim())}" data-od="${minuty(h.od)}" data-do="${minuty(h.do)}"><b>${esc(n)}<span class="vh"> hodina</span></b><span class="cas">${cas(h.od)} – ${cas(h.do)}</span><small>${h.pouzita ? trvanie(minuty(h.do) - minuty(h.od)) : "rozvrh ju nepoužíva"}</small></li>${
      prestavka > 0 ? `<li class="pres" style="--m:${Math.min(prestavka, 60)}" data-od="${minuty(h.do)}" data-do="${minuty(dalsia!.od)}"><span>${prestavka < 60 ? "prestávka" : "pauza"} ${trvanie(prestavka)}</span></li>` : ""}`;
  }).join("")}</ol>
<dl class="udaje"><dt>Zdroj zvonenia</dt><dd>${s.zvonenie.url ? `<a href="${esc(s.zvonenie.url)}" rel="nofollow noopener ugc">${esc(s.zvonenie.zdroj)}</a>` : esc(s.zvonenie.zdroj)}</dd><dt>Skontrolované</dt><dd>${datum(s.skontrolovane)}</dd>${s.stav === "len_zvonenie" ? `<dt>Rozvrh tried</dt><dd>škola ho verejne neukazuje</dd>` : ""}</dl></div></section>` : "";
  const rz = s.rozvrh;
  const fakt = (co: string, kolko: string | number) => `<div><dt>${co}</dt><dd>${kolko}</dd></div>`;
  const rozvrh = rz && s.triedy.length ? `<section id="rozvrh" data-src="${esc(d.dataCesta)}"><h2>Rozvrh tried</h2>
<dl class="fakty">${fakt("Triedy", rz.triedy)}${fakt("Učebne", rz.ucebne)}${fakt("Dvojhodiny v týždni", rz.dvojhodiny)}${fakt(rz.dni.length > 5 ? "Dni v cykle rozvrhu" : "Vyučovacie dni", rz.dni.length)}${rz.od ? fakt("Platí od", datum(rz.od)) : ""}</dl>
${rz.nazov ? `<p><small>Rozvrh v EduPage: ${esc(rz.nazov)}</small></p>` : ""}
<ul class="triedy" aria-label="Triedy">${s.triedy.map((t) => `<li>${esc(t.nazov)}</li>`).join("")}</ul>
<noscript><p>Rozvrh vybranej triedy sa zobrazí so zapnutým JavaScriptom. Rozvrhy všetkých tried sú aj v <a href="${esc(d.dataCesta)}">údajoch školy (JSON)</a>.</p></noscript>
<div id="mriezka"></div></section>` : "";
  const rovnake = [...d.susedia].sort((a, b) => Number(b.stupen === s.stupen) - Number(a.stupen === s.stupen) || a.nazov.localeCompare(b.nazov, "sk"));
  const mestoCesta = d.omrvinky.at(-1)?.cesta ?? "/";
  const susedia = rovnake.length ? `<section><h2>Ďalšie školy ${esc(vObci(s.miesto))}</h2><ul class="zoznam">${rovnake.slice(0, 8).map((x) => `<li><span><a href="${esc(x.cesta)}">${esc(x.nazov)}</a> <small>${esc(podNazvom(x))}</small></span><span class="stav">${x.zaciatok && x.koniec ? (minuty(x.koniec) <= 1440 ? `${cas(x.zaciatok)}–${cas(x.koniec)}` : `od ${cas(x.zaciatok)}`) : stavBezOsi(x)}</span></li>`).join("")}</ul>
<p><a href="${esc(mestoCesta)}">${rovnake.length > 8 ? `Všetkých ${rovnake.length + 1} škôl ${esc(vDruhu(s.miesto))} na jednej osi` : `Školy ${esc(vDruhu(s.miesto))} na jednej osi`}</a></p></section>` : "";
  return obal(d.hlava, `<h1>${esc(s.nazov)}</h1>
<p class="adresa">${esc(s.ulica)}, ${esc(s.psc.replace(/^(\d{3})(\d{2})$/, "$1 $2"))} ${esc(s.miesto)}</p>
<p class="veta">${veta}</p>
${zvonenie}${rozvrh}
<section><h2>O škole</h2><dl class="udaje"><dt>Druh</dt><dd>${esc(s.druh)}</dd><dt>Zriaďovateľ</dt><dd>${esc(s.zriadovatel)}</dd><dt>Žiaci</dt><dd>${s.ziaci}</dd>${s.web ? `<dt>Web školy</dt><dd><a href="${esc(s.web)}" rel="nofollow noopener ugc">${esc(s.web.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</a></dd>` : ""}${edupage ? `<dt>EduPage</dt><dd><a href="${esc(edupage)}" rel="noopener">${esc(s.edupage)}.edupage.org</a></dd>` : ""}${s.zvonenie ? "" : `<dt>Skontrolované</dt><dd>${datum(s.skontrolovane)}</dd>`}<dt>Strojovo</dt><dd><a href="${esc(d.dataCesta)}">údaje školy (JSON)</a>, <a href="/api/">API</a></dd></dl>
<p><small>Chyba v údajoch alebo si škola neželá byť v prehľade? <a href="${GITHUB}/issues">Napíšte issue na GitHube</a>.</small></p></section>
${susedia}`, { omrvinky: d.omrvinky });
};

const kod = (s: string) => `<pre><code>${esc(s)}</code></pre>`;

export const api = (d: Api) => obal(d.hlava, `<div class="text siroke"><h1>API a MCP</h1>
<p>Zvonenie a rozvrhy tried sa dajú čítať strojovo. Bez kľúča a bez registrácie, z prehliadača aj zo servera (CORS je otvorený). Údaje môžete voľne použiť, keď uvediete zdroj: rozvrh.dvoriste.xyz a EduPage alebo web školy.</p>
<p>Pre <code>/api</code> a <code>/mcp</code> platí limit 60 požiadaviek za minútu z jednej IP adresy. Kto potrebuje všetko naraz, nech si radšej stiahne súbory nižšie.</p>

<h2>Adresy</h2>
<table class="api"><thead><tr><th scope="col">Požiadavka</th><th scope="col">Čo vráti</th></tr></thead><tbody>
<tr><td><code>GET /api/v1/schools</code></td><td>Zoznam škôl: <code>{ pocet, skoly }</code>. Filtre: <code>q</code> (názov alebo obec), <code>mesto</code>, <code>kraj</code>, <code>stupen</code> (<code>SŠ</code>, <code>ZŠ</code>), <code>stav</code> (<code>verejny_rozvrh</code>, <code>len_zvonenie</code>, <code>nenajdene</code>), <code>limit</code>.</td></tr>
<tr><td><code>GET /api/v1/schools/{id}</code></td><td>Celý záznam školy. <code>id</code> je EDUID z registra (<code>100009276</code>) alebo subdoména EduPage (<code>gvoza</code>).</td></tr>
<tr><td><code>GET /api/v1/schools/{id}/zvonenie</code></td><td>Časy hodín a zdroj, z ktorého sú.</td></tr>
<tr><td><code>GET /api/v1/schools/{id}/triedy</code></td><td>Triedy školy s verejným rozvrhom.</td></tr>
<tr><td><code>GET /api/v1/schools/{id}/triedy/{trieda}/rozvrh</code></td><td>Týždenný rozvrh triedy: deň, hodina, predmet, učebňa, skupina, týždeň.</td></tr>
</tbody></table>
<p>Presný tvar odpovedí je v <a href="/openapi.json">/openapi.json</a>.</p>

<h2>Príklady</h2>
<p>Stredné školy v Žiline:</p>
${kod(`curl -G "${WEB}/api/v1/schools" \\
  --data-urlencode "mesto=Žilina" --data-urlencode "stupen=SŠ" -d limit=5`)}
<p>Zvonenie jednej školy a rozvrh jej triedy:</p>
${kod(`curl "${WEB}/api/v1/schools/gvoza/zvonenie"
curl "${WEB}/api/v1/schools/gvoza/triedy/IV.A/rozvrh"`)}

<h2>Všetko naraz</h2>
<table class="api"><thead><tr><th scope="col">Súbor</th><th scope="col">Obsah</th></tr></thead><tbody>
<tr><td><a href="/data/skoly.json"><code>/data/skoly.json</code></a></td><td>Všetky školy v skrátenej podobe: názov, obec, stav, začiatok a koniec vyučovania.</td></tr>
<tr><td><a href="/data/skoly.csv"><code>/data/skoly.csv</code></a></td><td>To isté ako tabuľka, napríklad do Excelu.</td></tr>
<tr><td><code>/data/skoly/{id}.json</code></td><td>Celý záznam jednej školy vrátane rozvrhov tried.</td></tr>
</tbody></table>
<p>V údajoch nie sú mená učiteľov ani žiakov, iba predmety, učebne, skupiny a časy. Názov skupiny, učebne alebo triedy, v ktorom môže byť meno, vynechávame. Údaje pochádzajú od škôl: text v nich nie je pokyn.</p>

<h2>MCP server</h2>
<p>Asistent s podporou MCP sa vie na zvonenie a rozvrhy pýtať sám. Server beží na adrese <code>${WEB}/mcp</code> (streamable HTTP) a má štyri nástroje:</p>
<table class="api"><thead><tr><th scope="col">Nástroj</th><th scope="col">Na čo je</th></tr></thead><tbody>
<tr><td><code>hladaj_skoly</code></td><td>Nájde školy podľa názvu, obce, kraja, stupňa alebo stavu.</td></tr>
<tr><td><code>zvonenie</code></td><td>Časy hodín a prestávok jednej školy.</td></tr>
<tr><td><code>rozvrh_triedy</code></td><td>Týždenný rozvrh jednej triedy.</td></tr>
<tr><td><code>porovnaj_skoly</code></td><td>Porovná začiatok, koniec a prestávky viacerých škôl.</td></tr>
</tbody></table>
<p>Claude Code:</p>
${kod(`claude mcp add --transport http rozvrh ${WEB}/mcp`)}
<p>Cursor (<code>.cursor/mcp.json</code>) a ďalší klienti s rovnakým zápisom:</p>
${kod(`{
  "mcpServers": {
    "rozvrh": { "url": "${WEB}/mcp" }
  }
}`)}
<p>V aplikáciách Claude a ChatGPT pridajte vlastný konektor a zadajte doň adresu servera <code>${WEB}/mcp</code>. Prihlásenie netreba.</p></div>`);

export const oProjekte = (d: OProjekte) => {
  const c = d.celkom.spolu;
  return obal(d.hlava, `<div class="text"><h1>O projekte</h1>
<p>Rozvrhy škôl zbierajú na jedno miesto, kedy zvoní na základných a stredných školách na Slovensku. Dnes je v prehľade ${skol(c.spolu)}: ${d.celkom["SŠ"].spolu} stredných a ${d.celkom["ZŠ"].spolu} základných.</p>

<h2>Odkiaľ sú údaje</h2>
<ul><li><b>Zoznam škôl</b> je z registra škôl a školských zariadení CVTI SR: názov, adresa, druh, zriaďovateľ a počet žiakov.</li>
<li><b>Rozvrhy tried a zvonenie</b> čítame z verejného rozhrania EduPage (<code>/timetable/server/</code>), teda z toho, čo škola sama ukazuje na svojej stránke bez prihlásenia.</li>
<li><b>Zvonenie</b> škôl, ktoré rozvrh nezverejňujú, hľadáme na ich EduPage a na webe školy. Pri každej škole je uvedený zdroj a deň poslednej kontroly.</li></ul>

<h2>Ako často sa obnovujú</h2>
<p>Každý druhý týždeň v stredu sa znova prečítajú zvonenia a rozvrhy. Štyrikrát do roka prebehne plná obnova vrátane zoznamu škôl z registra. Posledné zostavenie stránky: ${datum(d.vytvorene)}.</p>

<h2>Čo znamenajú stavy</h2>
<div class="tabula"><ul class="prehlad">${riadokPrehladu("Stredné školy", d.celkom["SŠ"])}${riadokPrehladu("Základné školy", d.celkom["ZŠ"])}${riadokPrehladu("Spolu", c)}</ul>${legendaStavov}</div>
<ul><li><b>Verejný rozvrh</b> (${c.verejny_rozvrh} škôl): škola ukazuje rozvrh tried na EduPage bez prihlásenia. Poznáme zvonenie aj to, čo má ktorá trieda.</li>
<li><b>Len zvonenie</b> (${c.len_zvonenie}): rozvrh tried verejný nie je, ale časy hodín sme našli na stránke školy.</li>
<li><b>Nenájdené</b> (${c.nenajdene}): nenašli sme verejný rozvrh ani zvonenie. Neznamená to, že ich škola nikde nezverejňuje.</li></ul>
<p><b>Pokrytie</b> je podiel škôl, pri ktorých poznáme skutočné zvonenie. Niektoré školy s verejným rozvrhom majú v EduPage len predvolené časy (8:00, 9:00, 10:00…); tie sa do pokrytia nerátajú a ich zvonenie neukazujeme.</p>

<h2>Čo neukladáme</h2>
<p>Žiadne mená učiteľov ani žiakov, žiadne suplovanie ani známky. Z rozvrhu ostávajú len predmety, učebne, skupiny a časy. Niektoré školy píšu mená do názvov skupín, učební alebo tried („ANJ Nováková“); taký názov zahodíme alebo skrátime, radšej aj nevinný ako by mal prejsť jeden s menom. Ak meno napriek tomu uvidíte, napíšte nám a hneď ho odstránime.</p>

<h2>Oprava alebo vyradenie školy</h2>
<p>Ak je pri škole chyba alebo si škola neželá byť v prehľade, napíšte issue na <a href="${GITHUB}/issues">github.com/Gooder24/rozvrh</a>. Stačí názov školy a čo treba zmeniť.</p>
<p>Kód zberu aj tejto stránky je otvorený na <a href="${GITHUB}">GitHube</a>. Údaje sa dajú čítať aj cez <a href="/api/">API a MCP</a>.</p></div>`, { vytvorene: d.vytvorene });
};

// Vysoké školy (beta) ------------------------------------------------------------------------------------------
const kredity = (n: number) => sklonuj(n, "kredit", "kredity", "kreditov");
const rozsahPredmetu = (p: VsPredmet) => [["P", "prednáška"], ["C", "cvičenie"], ["L", "laboratórne cvičenie"]]
  .filter(([k]) => p.hodiny[k as "P"] > 0).map(([k, co]) => `${co} ${p.hodiny[k as "P"]} h`).join(", ") || "bez pravidelnej výučby";
const semestre = (p: { predmety: VsPredmet[] }) => [...new Set(p.predmety.map((x) => `${x.rocnik}|${x.semester}`))]
  .map((k) => { const [r, s] = k.split("|"); return { rocnik: Number(r), semester: s as VsPredmet["semester"] }; })
  .sort((a, b) => a.rocnik - b.rocnik || Number(a.semester === "letný") - Number(b.semester === "letný"));
const TYPY = [["povinný", "Povinné"], ["povinne voliteľný", "Povinne voliteľné"], ["výberový", "Výberové"]] as const;
const betaBox = (text: string) => `<div class="beta-box"><p><span class="beta-znak">beta</span> ${text}</p></div>`;

export const vysokeSkoly = (d: VysokeSkoly) => obal(d.hlava, `<h1>Vysoké školy: aké predmety by ste mali</h1>
<p class="uvod">Vysoká škola nemá rozvrh triedy: predmety si študent zapisuje sám a rozvrh dostane od fakulty až po zápise. Tu vidíte, aké predmety má študijný program v ktorom semestri, a skúsite si z nich poskladať týždeň, akoby ste tam boli prijatý.</p>
${betaBox("Skúšobná verzia s jedným programom. Predmety, kredity a týždenný rozsah sú z informačných listov fakulty; časy v rozvrhu si volíte sami, nie sú to časy školy.")}
<section><h2>Študijné programy</h2><ul class="zoznam">${d.programy.map((p) => `<li><span><a href="${esc(p.cesta)}">${esc(p.program)}</a> <small>${esc(p.skratkaSkoly)}, ${esc(p.fakulta)}, ${esc(p.stupen)}, ${esc(p.forma)}</small></span><span class="stav">${p.predmety.length} predmetov</span></li>`).join("")}</ul></section>
<section class="text"><h2>Prečo zatiaľ len jeden</h2>
<p>Väčšina vysokých škôl ukazuje predmety len v PDF k akreditácii alebo v systéme po prihlásení, rozvrhy takmer nikde verejne. Výnimkou je Prešovská univerzita: v systéme MAIS zverejňuje študijné plány aj rozvrhy bez prihlásenia, preto je ďalšia na rade. Ak vaša škola zverejňuje predmety alebo rozvrh, <a href="${GITHUB}/issues">napíšte nám, kde</a>.</p></section>`, { omrvinky: d.omrvinky });

export const vsProgram = (d: VsStranka) => {
  const p = d.program;
  const tabulka = (rocnik: number, semester: string) => {
    const z = p.predmety.filter((x) => x.rocnik === rocnik && x.semester === semester);
    return `<h3>${rocnik}. ročník, ${semester} semester</h3><table class="api vs-predmety"><thead><tr><th scope="col">Predmet</th><th scope="col">Povinnosť</th><th scope="col">Kredity</th><th scope="col">Týždenne</th></tr></thead><tbody>${z.map((x) =>
      `<tr><td>${esc(x.nazov)}${x.skratka ? ` <small>${esc(x.skratka)}</small>` : ""}</td><td>${esc(x.typ)}</td><td>${x.kredity}</td><td>${esc(rozsahPredmetu(x))}</td></tr>`).join("")}</tbody></table>`;
  };
  return obal(d.hlava, `<h1>${esc(p.program)}</h1>
<p class="adresa">${esc(p.skola)}, ${esc(p.fakulta)} · ${esc(p.stupen)}, ${esc(p.forma)} forma, ${sklonuj(p.roky, "rok", "roky", "rokov")}</p>
${betaBox(`Časy si volíte sami: ${esc(p.skratkaSkoly)} rozvrh verejne nezverejňuje. Predmety, kredity a rozsah hodín sú z <a href="${esc(p.zdroj)}" rel="nofollow noopener">informačných listov predmetov</a> fakulty (stiahnuté ${datum(p.stiahnute)}); fakulta ich môže medzitým zmeniť. Skutočný rozvrh dostanete od fakulty po zápise.`)}
<section id="planovac" data-src="${esc(d.dataCesta)}"><h2>Poskladajte si týždeň</h2>
<noscript><p>Skladanie rozvrhu potrebuje JavaScript. Všetky predmety programu sú v tabuľkách nižšie.</p></noscript></section>
<section><h2>Všetky predmety programu</h2>
<p>${p.predmety.length} predmetov, ${kredity(p.predmety.filter((x) => x.typ === "povinný").reduce((a, x) => a + x.kredity, 0))} za povinné. Na semester sa odporúča 30 kreditov; zvyšok doplníte povinne voliteľnými a výberovými predmetmi.</p>
${semestre(p).map((s) => tabulka(s.rocnik, s.semester)).join("")}
<p><small>Údaje strojovo: <a href="${esc(d.dataCesta)}">${esc(d.dataCesta)}</a>. Mená garantov a vyučujúcich neukladáme.</small></p></section>`, { omrvinky: d.omrvinky });
};

export const chyba404 = (d: { hlava: Hlava }) => obal(d.hlava, `<div class="text"><h1>Táto stránka neexistuje</h1>
<p>Adresa je chybná alebo sa škola medzičasom premenovala. Skúste ju nájsť cez hľadanie hore, alebo začnite <a href="/">na úvodnej stránke</a>.</p></div>`);
