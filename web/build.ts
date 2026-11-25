// Zostaví celý web do site/public: HTML každej školy, mesta a kraja, dáta pre API, sitemap a hlavičky.
// bun web/build.ts   (beží po každej obnove dát; nasadenie: web/nasad.ts)
import { cp, mkdir, rm } from "node:fs/promises";
import { kratko, nacitajSkoly, slug, type Skola } from "./data";
import { ADRESA, type Hlava, type Pocty, type Render, type VsProgram } from "./stranky";
import * as ui from "./ui/render";
import { vObci } from "./obce";
import { predmetySkoly, slovnik } from "./predmety";
import { openapi } from "./openapi";
import { meno } from "./sukromie";

const render: Render = ui;
const VON = "site/public";
const vytvorene = new Date().toISOString();
const INDEXNOW_KLUC = "3f6c1e0b9a7d4c2e8b5a1f0d6e9c7b24";
/** Mapa škôl pri hľadaní (ukážka): len `MAPA=1 bun web/build.ts`, ostrý web ju zatiaľ nemá. */
const MAPA = process.env.MAPA === "1";
/** Dlaždice mapy: OpenFreeMap (zadarmo, bez kľúča, údaje OpenStreetMap). */
const DLAZDICE = "https://tiles.openfreemap.org";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const jsonLd = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;
function hlava(title: string, description: string, cesta: string, ld?: unknown): Hlava {
  const url = ADRESA + cesta;
  const html = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="website"><meta property="og:locale" content="sk_SK">`,
    `<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(url)}"><meta property="og:site_name" content="Rozvrhy škôl">`,
    ld ? jsonLd(ld) : "",
  ].join("\n");
  return { title, description, cesta, html };
}
const pocty = (z: { stav: Skola["stav"]; zaciatok: string | null }[]): Pocty => ({
  spolu: z.length,
  verejny_rozvrh: z.filter((s) => s.stav === "verejny_rozvrh").length,
  len_zvonenie: z.filter((s) => s.stav === "len_zvonenie").length,
  nenajdene: z.filter((s) => s.stav === "nenajdene").length,
  zvonenie: z.filter((s) => s.zaciatok !== null).length,
});
const skupiny = <T, K>(z: T[], k: (x: T) => K) => z.reduce((m, x) => m.set(k(x), [...(m.get(k(x)) ?? []), x]), new Map<K, T[]>());

const skoly = await nacitajSkoly();
// Poistka: žiadny text z rozvrhu nesmie mať titul ani „Krstné Priezvisko“ (filter je v web/sukromie.ts).
{
  const prazdny = { ucitelia: new Set<string>(), vyskyt: new Map<string, number>() };
  const nalezy = skoly.flatMap((s) => [s.rozvrh?.nazov ?? "", ...s.triedy.flatMap((t) => [t.nazov, ...t.bloky.flatMap((b) => [b.predmet, b.skratka, b.ucebna ?? "", b.skupina ?? ""])])]
    .filter((x) => x && meno(x, prazdny, false)).map((x) => `${s.id}: ${x}`));
  if (nalezy.length) throw new Error(`mená v údajoch (${nalezy.length}):\n${[...new Set(nalezy)].slice(0, 30).join("\n")}`);
}
// Predmety: odhad názvu pri školách, ktoré píšu len skratku.
{
  const sl = slovnik(skoly);
  for (const s of skoly) if (s.triedy.length) s.predmety = predmetySkoly(s, sl);
}
const cestaSkoly = (s: { slug: string }) => `/skola/${s.slug}/`;
const cestaMesta = (s: { mestoSlug: string }) => `/mesto/${s.mestoSlug}/`;
const cestaKraja = (kraj: string) => `/kraj/${slug(kraj)}/`;

await rm(VON, { recursive: true, force: true });
await mkdir(`${VON}/data/skoly`, { recursive: true });
const zapis = async (cesta: string, obsah: string) => {
  const subor = cesta.endsWith("/") ? `${VON}${cesta}index.html` : `${VON}${cesta}`;
  await Bun.write(subor, obsah);
};

// Dáta: celý záznam školy, index a export.
await mkdir(`${VON}/data/bez-tried`, { recursive: true });
for (const s of skoly) {
  await zapis(`/data/skoly/${s.id}.json`, JSON.stringify(s));
  // Malý záznam bez rozvrhov tried: zvonenie a porovnanie v API a MCP nemusia čítať stovky KB.
  const { triedy: _, ...bez } = s;
  await zapis(`/data/bez-tried/${s.id}.json`, JSON.stringify(bez));
}
const index = skoly.map((s) => ({ ...kratko(s), cesta: cestaSkoly(s) }));
await zapis("/data/skoly.json", JSON.stringify({ vytvorene, zdroj: ADRESA, podmienky: "Voľne na použitie s uvedením zdroja: rozvrh.dvoriste.xyz a EduPage alebo web školy.", skoly: index }));
const stlpce = ["id", "nazov", "stupen", "typ", "druh", "kraj", "okres", "miesto", "zriadovatel", "ziaci", "stav", "edupage", "zaciatok", "koniec", "pocetHodin"] as const;
// Bunka, ktorá začína =, +, -, @, by sa v Exceli vykonala ako vzorec: predradí sa apostrof.
const csvBunka = (v: unknown) => { const t = (v == null ? "" : String(v)).replace(/^[=+\-@\t\r]/, "'$&"); return /[",\r\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
await zapis("/data/skoly.csv", "\ufeff" + [stlpce.join(","), ...index.map((s) => stlpce.map((k) => csvBunka(s[k])).join(","))].join("\n"));
// Malý index na hľadanie v prehliadači: [nazov, miesto, cesta, stav, ulica].
await zapis("/data/hladanie.json", JSON.stringify(index.map((s) => [s.nazov, s.miesto, s.cesta, s.stav === "verejny_rozvrh" ? 2 : s.stav === "len_zvonenie" ? 1 : 0, s.ulica])));
// Body na mape v poradí hladanie.json. Poloha je adresa školy z data/mapa/adresy-gps.json (prieskum/geokoduj.ts,
// OpenStreetMap); škola bez nej dostane stred obce (data/mapa/obce-gps.json, Wikidata, kľúč „obec|okres“, lebo rovnaké
// názvy obcí sú v rôznych okresoch). Viac škôl v jednom bode sa rozloží do malej špirály, aby sa dali rozkliknúť.
if (MAPA) {
  const adresy = await Bun.file("data/mapa/adresy-gps.json").json() as Record<string, [number, number, string]>;
  const stredy = await Bun.file("data/mapa/obce-gps.json").json() as Record<string, [number, number]>;
  const poradie = new Map<string, number>();
  await zapis("/data/mapa.json", JSON.stringify(index.map((s) => {
    const a = adresy[s.id];
    const c = a ? [a[0], a[1]] as const : stredy[`${s.miesto}|${s.okres}`];
    if (!c) return null;
    const kluc = c.join(","), k = poradie.get(kluc) ?? 0;
    poradie.set(kluc, k + 1);
    // Na adrese stačí pár metrov (spojené školy v jednej budove), v strede obce treba viac miesta.
    const r = (a ? 0.00025 : 0.0035) * Math.sqrt(k), u = k * 2.39996;
    return [Math.round((c[0] + (r * Math.cos(u)) / Math.cos((c[1] * Math.PI) / 180)) * 1e5) / 1e5, Math.round((c[1] + r * Math.sin(u)) * 1e5) / 1e5];
  })));
}

const celkom = {
  "SŠ": pocty(skoly.filter((s) => s.stupen === "SŠ")),
  "ZŠ": pocty(skoly.filter((s) => s.stupen === "ZŠ")),
  spolu: pocty(skoly),
};
// Stránka sa zapíše, pribudne do sitemap a jej odtlačok (údaje bez času zostavenia + verzia vzhľadu) určí,
// či sa zmenila: zmenené dostanú nový lastmod a pošlú sa cez IndexNow (web/nasad.ts).
const sitemap: string[] = [];
const ZMENY = "site/zmeny.json";
const zmeny = ((await Bun.file(ZMENY).json().catch(() => ({}))) as Record<string, { hash: string; datum: string }>);
const zmenene: string[] = [];
const vzhlad = new Bun.CryptoHasher("sha256");
for (const f of [...new Bun.Glob("web/ui/**/*").scanSync()].sort()) vzhlad.update(await Bun.file(f).arrayBuffer());
const verziaVzhladu = vzhlad.digest("hex");
async function stranka<T>(cesta: string, f: (d: T) => string, data: T) {
  await zapis(cesta, f(data));
  sitemap.push(cesta);
  const hash = new Bun.CryptoHasher("sha256").update(verziaVzhladu + JSON.stringify(data, (k, v) => k === "vytvorene" ? undefined : v)).digest("hex");
  if (zmeny[cesta]?.hash !== hash) { zmeny[cesta] = { hash, datum: vytvorene.slice(0, 10) }; zmenene.push(cesta); }
}

// Školy.
const podlaMesta = skupiny(skoly, (s) => s.mestoSlug);
for (const s of skoly) {
  const zv = s.zvonenie ? `Prvá hodina začína o ${s.zaciatok}, posledná končí o ${s.koniec}. ` : "";
  const desc = `${s.nazov}, ${s.miesto}: ${s.stav === "verejny_rozvrh" ? "rozvrh tried a zvonenie" : s.stav === "len_zvonenie" ? "zvonenie" : "rozvrh a zvonenie sme zatiaľ nenašli"}. ${zv}Údaje z EduPage a webu školy.`;
  const ld = {
    "@context": "https://schema.org", "@type": s.stupen === "ZŠ" ? "ElementarySchool" : "HighSchool",
    name: s.nazov, url: ADRESA + cestaSkoly(s), ...(s.web ? { sameAs: [s.web] } : {}),
    address: { "@type": "PostalAddress", streetAddress: s.ulica, postalCode: s.psc, addressLocality: s.miesto, addressRegion: `${s.kraj} kraj`, addressCountry: "SK" },
  };
  await stranka(cestaSkoly(s), render.skola, {
    hlava: hlava(`${s.nazov}, ${s.miesto}: rozvrh hodín a zvonenie`, desc, cestaSkoly(s), ld),
    omrvinky: [{ nazov: "Slovensko", cesta: "/" }, { nazov: `${s.kraj} kraj`, cesta: cestaKraja(s.kraj) }, { nazov: s.miesto, cesta: cestaMesta(s) }],
    skola: s, dataCesta: `/data/skoly/${s.id}.json`,
    susedia: (podlaMesta.get(s.mestoSlug) ?? []).filter((x) => x.id !== s.id).map((x) => ({ ...kratko(x), cesta: cestaSkoly(x) })),
  });
}

// Mestá.
for (const [, z] of podlaMesta) {
  const m = z[0]!;
  const p = pocty(z);
  await stranka(cestaMesta(m), render.mesto, {
    hlava: hlava(`Rozvrhy a zvonenie škôl: ${m.miesto}`, `Kedy zvoní na ${p.spolu} školách ${vObci(m.miesto)}: začiatok a koniec vyučovania, prestávky a rozvrhy tried základných a stredných škôl.`, cestaMesta(m), {
      "@context": "https://schema.org", "@type": "ItemList", name: `Školy: ${m.miesto}`,
      itemListElement: z.map((s, i) => ({ "@type": "ListItem", position: i + 1, url: ADRESA + cestaSkoly(s), name: s.nazov })),
    }),
    omrvinky: [{ nazov: "Slovensko", cesta: "/" }, { nazov: `${m.kraj} kraj`, cesta: cestaKraja(m.kraj) }],
    nazov: m.miesto, kraj: m.kraj, okres: m.okres, pocty: p,
    skoly: z.map((s) => ({ ...kratko(s), cesta: cestaSkoly(s), hodiny: (s.zvonenie?.hodiny ?? []).map((h) => ({ n: h.n, od: h.od, do: h.do, pouzita: h.pouzita !== false })) })),
  });
}

// Kraje.
const podlaKraja = skupiny(skoly, (s) => s.kraj);
const kraje = [...podlaKraja].sort((a, b) => a[0].localeCompare(b[0], "sk"));
for (const [kraj, z] of kraje) {
  const p = pocty(z);
  await stranka(cestaKraja(kraj), render.kraj, {
    hlava: hlava(`Rozvrhy a zvonenie škôl: ${kraj} kraj`, `${p.spolu} základných a stredných škôl v kraji ${kraj}: kedy zvoní, kedy sa začína a končí vyučovanie a kde je verejný rozvrh tried.`, cestaKraja(kraj)),
    omrvinky: [{ nazov: "Slovensko", cesta: "/" }], nazov: kraj, pocty: p,
    mesta: [...skupiny(z, (s) => s.mestoSlug)].map(([, zz]) => ({ nazov: zz[0]!.miesto, cesta: cestaMesta(zz[0]!), okres: zz[0]!.okres, pocty: pocty(zz) }))
      .sort((a, b) => a.nazov.localeCompare(b.nazov, "sk")),
  });
}

// Domov, API, o projekte, 404.
await stranka("/", render.domov, {
  hlava: hlava("Kedy zvoní na slovenských školách: rozvrhy hodín a zvonenie", `Zvonenie a rozvrhy hodín ${celkom.spolu.spolu} základných a stredných škôl na Slovensku na jednom mieste, s otvoreným API a MCP serverom.`, "/", {
    "@context": "https://schema.org", "@type": "WebSite", name: "Rozvrhy škôl", url: ADRESA + "/",
    potentialAction: { "@type": "SearchAction", target: `${ADRESA}/?q={q}`, "query-input": "required name=q" },
  }),
  vytvorene, celkom, mapa: MAPA,
  kraje: kraje.map(([kraj, z]) => ({ nazov: kraj, cesta: cestaKraja(kraj), pocty: pocty(z) })),
  mesta: [...podlaMesta].map(([, z]) => ({ nazov: z[0]!.miesto, cesta: cestaMesta(z[0]!), pocet: z.length })).sort((a, b) => b.pocet - a.pocet).slice(0, 24),
});
await stranka("/api/", render.api, { hlava: hlava("API a MCP: rozvrhy a zvonenie slovenských škôl", "Otvorené API bez kľúča a MCP server so zvonením a rozvrhmi tried základných a stredných škôl na Slovensku.", "/api/") });
await stranka("/o-projekte/", render.oProjekte, { hlava: hlava("O projekte: odkiaľ sú údaje o rozvrhoch škôl", "Ako zbierame zvonenie a rozvrhy škôl, ako často sa obnovujú a ako školu z prehľadu vyradiť.", "/o-projekte/"), vytvorene, celkom });
// Vysoké školy (beta): študijné programy z data/vs/*.json, plánovač rozvrhu je v klientovi.
const programy: VsProgram[] = [];
for (const f of [...new Bun.Glob("data/vs/*.json").scanSync()].sort()) programy.push((await Bun.file(f).json()) as VsProgram);
await mkdir(`${VON}/data/vs`, { recursive: true });
const omrVs = [{ nazov: "Slovensko", cesta: "/" }, { nazov: "Vysoké školy (beta)", cesta: "/vysoke-skoly/" }];
for (const p of programy) {
  await Bun.write(`${VON}/data/vs/${p.id}.json`, JSON.stringify(p));
  await stranka(`/vysoke-skoly/${p.id}/`, render.vsProgram, {
    hlava: hlava(`${p.program} (${p.skratkaSkoly}): predmety a skúšobný rozvrh`, `Predmety študijného programu ${p.program}, ${p.fakulta} ${p.skratkaSkoly}: kredity, semestre a týždenný rozsah. Skúšobne si z nich poskladajte rozvrh (beta).`, `/vysoke-skoly/${p.id}/`),
    omrvinky: omrVs, program: p, dataCesta: `/data/vs/${p.id}.json`,
  });
}
await stranka("/vysoke-skoly/", render.vysokeSkoly, {
  hlava: hlava("Vysoké školy (beta): predmety programu a skúšobný rozvrh", "Aké predmety má študijný program vysokej školy v ktorom semestri a ako by mohol vyzerať váš týždeň, keby vás prijali. Skúšobná verzia.", "/vysoke-skoly/"),
  omrvinky: [{ nazov: "Slovensko", cesta: "/" }], programy: programy.map((p) => ({ ...p, cesta: `/vysoke-skoly/${p.id}/` })),
});
await zapis("/404.html", render.chyba404({ hlava: hlava("Stránka sa nenašla", "Táto stránka neexistuje.", "/404") }));

// Vzhľad: statické súbory a klient.
await cp("web/ui/assets", `${VON}/assets`, { recursive: true }).catch(() => {});
if (await Bun.file("web/ui/klient.ts").exists()) {
  const b = await Bun.build({ entrypoints: ["web/ui/klient.ts"], outdir: `${VON}/assets`, minify: true, target: "browser", naming: "klient.js", external: ["/assets/*"] });
  if (!b.success) throw new AggregateError(b.logs, "klient.ts sa nedá zostaviť");
}
if (MAPA) {
  for (const f of ["maplibre-gl.mjs", "maplibre-gl-worker.mjs", "maplibre-gl.css"]) await cp(`node_modules/maplibre-gl/dist/${f}`, `${VON}/assets/${f}`);
  const b = await Bun.build({ entrypoints: ["web/ui/mapa.ts"], outdir: `${VON}/assets`, minify: true, target: "browser", format: "esm", naming: "mapa.js", external: ["/assets/*"] });
  if (!b.success) throw new AggregateError(b.logs, "mapa.ts sa nedá zostaviť");
}

// Vyhľadávače.
const dnes = vytvorene.slice(0, 10);
await zapis("/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap.map((c) => `<url><loc>${ADRESA}${c}</loc><lastmod>${zmeny[c]?.datum ?? dnes}</lastmod></url>`).join("\n")}\n</urlset>\n`);
// Vyhľadávače indexujú stránky; API, MCP a surové JSON nie (míňali by denný limit Workera a nemajú čo hľadať).
// AI agenti, ktorí čítajú web na pokyn človeka (nie hromadné prehľadávanie), smú aj na API a JSON: odpovedia mu bez hľadania.
const agenti = ["ChatGPT-User", "Claude-User", "Perplexity-User", "MistralAI-User", "DuckAssistBot"];
// Bez „Allow: /“: parsery, ktoré berú prvú zhodu (Python urllib.robotparser), by inak povolili aj zakázané cesty.
await zapis("/robots.txt", `User-agent: *\nDisallow: /mcp\nDisallow: /api/v1/\nDisallow: /data/\n\n${agenti.map((a) => `User-agent: ${a}\n`).join("")}Disallow: /mcp\n\nSitemap: ${ADRESA}/sitemap.xml\n`);
// llms.txt: vstup pre AI agentov (čo tu je a ako sa k údajom dostať bez prechádzania stránok).
await zapis("/llms.txt", `# Rozvrhy škôl (rozvrh.dvoriste.xyz)

> Zvonenie (časy vyučovacích hodín a prestávok) a rozvrhy tried ${celkom.spolu.spolu} základných a stredných škôl na Slovensku
> zo zoznamu škôl CVTI SR a z verejných rozvrhov škôl. Obnovuje sa každé dva týždne; posledné zostavenie ${vytvorene.slice(0, 10)}.
> Bell times and class timetables of Slovak primary and secondary schools. Open JSON API without a key, and an MCP server.

Mená učiteľov a žiakov tu nie sú. Časy sú v miestnom čase (Europe/Bratislava).

## Pre agentov

- [MCP server](${ADRESA}/mcp): Streamable HTTP (POST). Nástroje: hladaj_skoly, zvonenie, rozvrh_triedy, porovnaj_skoly.
- [OpenAPI](${ADRESA}/openapi.json): popis JSON API, bez kľúča, CORS povolený, najviac 60 požiadaviek za minútu z jednej IP.
- Hľadanie školy: ${ADRESA}/api/v1/schools?q=<názov alebo obec>&stupen=SŠ|ZŠ&kraj=<kraj>
- Zvonenie školy: ${ADRESA}/api/v1/schools/<id>/zvonenie (id z hľadania)
- Triedy a rozvrh triedy: ${ADRESA}/api/v1/schools/<id>/triedy, ${ADRESA}/api/v1/schools/<id>/triedy/<trieda>/rozvrh

## Stránky

- [Úvod a súhrn po krajoch](${ADRESA}/)
- Stránka školy: ${ADRESA}/skola/<slug>/ (zvonenie, začiatok a koniec vyučovania, rozvrhy tried); kraj: ${ADRESA}/kraj/<kraj>/
- [Vysoké školy (beta)](${ADRESA}/vysoke-skoly/): predmety študijného programu a skúšobný týždenný rozvrh
- [API a MCP](${ADRESA}/api/), [O projekte a zdroje údajov](${ADRESA}/o-projekte/)
- [Sitemap](${ADRESA}/sitemap.xml)
`);
await zapis(`/${INDEXNOW_KLUC}.txt`, INDEXNOW_KLUC);
await zapis("/openapi.json", JSON.stringify(openapi, null, 1));
// Hlavičky statických súborov (Cloudflare Workers static assets, súbor _headers).
await zapis("/_headers", `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; img-src 'self' data:${MAPA ? " blob:" : ""}; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'${MAPA ? ` ${DLAZDICE}` : ""};${MAPA ? " worker-src 'self' blob:;" : ""} object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'
  X-Frame-Options: DENY
  Strict-Transport-Security: max-age=31536000
/data/*
  Access-Control-Allow-Origin: *
  X-Robots-Tag: noindex
  Cache-Control: public, max-age=3600
/assets/*
  Cache-Control: public, max-age=86400
/openapi.json
  Access-Control-Allow-Origin: *
/llms.txt
  Content-Type: text/plain; charset=utf-8
`);
// Zmenené stránky čakajú na nasadenie; zmeny.json sa uloží až po úspešnom nasadení (web/nasad.ts).
await Bun.write("site/indexnow.json", JSON.stringify({ kluc: INDEXNOW_KLUC, cesty: zmenene }));
await Bun.write("site/zmeny.novy.json", JSON.stringify(zmeny));
console.log(`${skoly.length} škôl, ${sitemap.length} stránok v sitemap (zmenených ${zmenene.length}), ${podlaMesta.size} miest`);
