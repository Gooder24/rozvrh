// Súhrn prieskumu stredných (SŠ) a základných (ZŠ) škôl, zvlášť aj spolu.
// bun prieskum/suhrn.ts  ->  data/prieskum-suhrn.json, data/PRIESKUM.md
// Pokrytie = podiel škôl, pri ktorých poznáme aspoň skutočné zvonenie (verejný rozvrh alebo len zvonenie);
// verejný rozvrh s predvoleným zvonením EduPage (8:00, 9:00, …) sa do pokrytia neráta.
import { readdir } from "node:fs/promises";

type Hodina = { n: string; od: string; do: string };
type Vysledok = {
  eduid: string; nazov: string; kraj: string; typ: string; zriadovatel: string; miesto: string; web: string | null;
  web_stav?: number; edupage?: { sub: string; zdroj: string }; rozvrh_stav: string; rozvrh_detail?: string;
  zvonenie?: { hodiny: Hodina[]; zdroj: string; url: string; predvolene?: boolean }; iny_system?: string[]; zamietnute?: { sub: string; dovod: string }[];
  rozvrh?: { od: string | null }; rozvrh_od?: string; stupen: Stupen;
};
type Stupen = "SŠ" | "ZŠ";
type RegZaznam = { eduid: string; kraj: string; typ: string; zriadovatel: string };

const ZDROJE = { "SŠ": ["data/skoly-register.json", "data/prieskum"], "ZŠ": ["data/zs/skoly-register.json", "data/zs/prieskum"] } as const;

async function nacitaj(stupen: Stupen) {
  const [reg, dir] = ZDROJE[stupen];
  // Kraj, typ a zriaďovateľ vždy podľa aktuálneho registra.
  const register = (await Bun.file(reg).json()) as RegZaznam[];
  const podla = new Map(register.map((r) => [r.eduid, { kraj: r.kraj, typ: r.typ, zriadovatel: r.zriadovatel }]));
  const subory = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(".json"));
  const vysledky = (await Promise.all(subory.map(async (f) => (await Bun.file(`${dir}/${f}`).json()) as Vysledok)))
    .filter((v) => podla.has(v.eduid))
    .map((v) => ({ ...v, ...podla.get(v.eduid), stupen, rozvrh_od: v.rozvrh?.od ?? undefined }));
  return { register: register.length, vysledky };
}
const ss = await nacitaj("SŠ");
const zs = await nacitaj("ZŠ");
const vsetky = [...ss.vysledky, ...zs.vysledky];

const KAT = ["verejný rozvrh", "len zvonenie", "nenájdené"] as const;
type Kat = (typeof KAT)[number];
const kategoria = (v: Vysledok): Kat => v.rozvrh_stav === "verejny" ? "verejný rozvrh" : v.zvonenie ? "len zvonenie" : "nenájdené";
const pct = (a: number, b: number) => b ? `${Math.round((a / b) * 100)} %` : "–";

function pocty(zoznam: Vysledok[]) {
  const r = { spolu: zoznam.length, "verejný rozvrh": 0, "len zvonenie": 0, "nenájdené": 0 };
  for (const v of zoznam) r[kategoria(v)]++;
  const predvolene = zoznam.filter((v) => v.zvonenie?.predvolene).length;
  return { ...r, predvolene, pokrytie: r["verejný rozvrh"] + r["len zvonenie"] - predvolene };
}
type Pocty = ReturnType<typeof pocty>;
function tabulka(zoznam: Vysledok[], podla: (v: Vysledok) => string) {
  const m = new Map<string, Vysledok[]>();
  for (const v of zoznam) m.set(podla(v), [...(m.get(podla(v)) ?? []), v]);
  return [...m.entries()].map(([k, z]) => [k, pocty(z)] as const).sort((a, b) => b[1].spolu - a[1].spolu);
}
const riadok = (k: string, r: Pocty) =>
  `| ${k} | ${r.spolu} | ${r["verejný rozvrh"]} (${pct(r["verejný rozvrh"], r.spolu)}) | ${r["len zvonenie"]} | ${r["nenájdené"]} | ${pct(r.pokrytie, r.spolu)} |`;
const HLAVICKA = "| Skupina | Škôl | Verejný rozvrh | Len zvonenie | Nenájdené | Pokrytie |\n|---|---|---|---|---|---|";
const tab = (t: ReturnType<typeof tabulka>) => `${HLAVICKA}\n${t.map(([k, r]) => riadok(k, r)).join("\n")}`;

const celkom = { "SŠ": pocty(ss.vysledky), "ZŠ": pocty(zs.vysledky), "spolu": pocty(vsetky) };
const zozbierane = { "SŠ": `${ss.vysledky.length} z ${ss.register}`, "ZŠ": `${zs.vysledky.length} z ${zs.register}` };

// Kraje: pokrytie SŠ, ZŠ a spolu vedľa seba.
const kraje = [...new Set(vsetky.map((v) => v.kraj))].sort();
const krajRiadky = kraje.map((k) => {
  const p = (z: Vysledok[]) => pocty(z.filter((v) => v.kraj === k));
  const [a, b, c] = [p(ss.vysledky), p(zs.vysledky), p(vsetky)];
  return { kraj: k, "SŠ": a, "ZŠ": b, spolu: c };
}).sort((x, y) => y.spolu.pokrytie / y.spolu.spolu - x.spolu.pokrytie / x.spolu.spolu);

const mesiace = (z: Vysledok[]) => Object.entries(z.filter((v) => v.rozvrh_od)
  .reduce<Record<string, number>>((a, v) => (a[v.rozvrh_od!.slice(0, 7)] = (a[v.rozvrh_od!.slice(0, 7)] ?? 0) + 1, a), {})).sort();
const iny = vsetky.flatMap((v) => v.iny_system ?? []).reduce<Record<string, number>>((a, s) => (a[s] = (a[s] ?? 0) + 1, a), {});
const nesparovane = vsetky.filter((v) => !v.edupage).sort((a, b) => a.stupen.localeCompare(b.stupen) || a.kraj.localeCompare(b.kraj) || a.miesto.localeCompare(b.miesto));
const bezZvonenia = vsetky.filter((v) => v.edupage && !v.zvonenie);

await Bun.write("data/prieskum-suhrn.json", JSON.stringify({
  vytvorene: new Date().toISOString(), zozbierane, celkom,
  poKrajoch: krajRiadky,
  poTypoch: Object.fromEntries(tabulka(vsetky, (v) => `${v.stupen} ${v.typ}`)),
  zriadovatel: Object.fromEntries(tabulka(vsetky, (v) => `${v.stupen} ${v.zriadovatel}`)),
  zdrojeZvonenia: Object.fromEntries(tabulka(vsetky, (v) => v.zvonenie?.zdroj ?? "nenájdené")),
  stavy: Object.fromEntries(tabulka(vsetky, (v) => v.rozvrh_stav)), inySystem: iny,
  nesparovane: nesparovane.map((v) => ({ stupen: v.stupen, eduid: v.eduid, nazov: v.nazov, miesto: v.miesto, kraj: v.kraj, web: v.web, web_stav: v.web_stav, zamietnute: v.zamietnute })),
  edupageBezZvonenia: bezZvonenia.map((v) => ({ stupen: v.stupen, eduid: v.eduid, nazov: v.nazov, miesto: v.miesto, sub: v.edupage!.sub, stav: v.rozvrh_stav })),
}, null, 1));

const veta = (n: string, r: Pocty) =>
  `- **${n}:** ${r.spolu} škôl, verejný rozvrh ${r["verejný rozvrh"]} (${pct(r["verejný rozvrh"], r.spolu)}), len zvonenie ${r["len zvonenie"]}, nenájdené ${r["nenájdené"]}. **Pokrytie ${pct(r.pokrytie, r.spolu)}** (${r.pokrytie} škôl; nerátajú sa verejné rozvrhy len s predvoleným zvonením EduPage: ${r.predvolene}).`;
await Bun.write("data/PRIESKUM.md", `# Prieskum rozvrhov stredných a základných škôl SR

Zdroj zoznamov: register CVTI SR (stredné školy GYM_Z, KON_Z, SOS_Z, SPECSS_Z; základné školy zoznam_zakladne-skoly). Súhrn ${new Date().toLocaleString("sk-SK")}. Zozbierané SŠ ${zozbierane["SŠ"]}, ZŠ ${zozbierane["ZŠ"]}.

**Pokrytie** je podiel škôl, pri ktorých poznáme aspoň skutočné zvonenie (z verejného rozvrhu tried alebo samotné). Verejný rozvrh, ktorý má v EduPage len predvolené zvonenie (8:00, 9:00, 10:00…), sa do pokrytia neráta. „Nenájdené“ znamená, že zberač nenašiel verejný rozvrh ani zvonenie, nie že ich škola nikde nezverejňuje.

${veta("Stredné školy", celkom["SŠ"])}
${veta("Základné školy", celkom["ZŠ"])}
${veta("Spolu", celkom.spolu)}

## Po krajoch (pokrytie)
| Kraj | SŠ | ZŠ | Spolu | Verejný rozvrh spolu |
|---|---|---|---|---|
${krajRiadky.map((r) => `| ${r.kraj} | ${pct(r["SŠ"].pokrytie, r["SŠ"].spolu)} z ${r["SŠ"].spolu} | ${pct(r["ZŠ"].pokrytie, r["ZŠ"].spolu)} z ${r["ZŠ"].spolu} | ${pct(r.spolu.pokrytie, r.spolu.spolu)} z ${r.spolu.spolu} | ${pct(r.spolu["verejný rozvrh"], r.spolu.spolu)} |`).join("\n")}

## Podľa typu
${tab(tabulka(vsetky, (v) => `${v.stupen} ${v.typ}`))}

## Podľa zriaďovateľa
${tab(tabulka(vsetky, (v) => `${v.stupen} ${v.zriadovatel}`))}

## Od kedy platí aktuálny verejný rozvrh
| Mesiac | SŠ | ZŠ |
|---|---|---|
${[...new Set([...mesiace(ss.vysledky), ...mesiace(zs.vysledky)].map(([m]) => m))].sort().map((m) =>
  `| ${m} | ${Object.fromEntries(mesiace(ss.vysledky))[m] ?? 0} | ${Object.fromEntries(mesiace(zs.vysledky))[m] ?? 0} |`).join("\n")}

## Odkiaľ je zvonenie
${tabulka(vsetky, (v) => v.zvonenie?.zdroj ?? "nenájdené").map(([k, r]) => `- ${k}: ${r.spolu}`).join("\n")}

## Stav rozvrhu v EduPage
${tabulka(vsetky, (v) => v.rozvrh_stav).map(([k, r]) => `- ${k}: ${r.spolu}`).join("\n")}

## Iné systémy a formáty na weboch
${Object.entries(iny).map(([k, n]) => `- ${k}: ${n}`).join("\n") || "- žiadne"}

## Nespárované s EduPage (${nesparovane.length})
| Stupeň | Škola | Miesto | Kraj | Web | Zvonenie |
|---|---|---|---|---|---|
${nesparovane.map((v) => `| ${v.stupen} | ${v.nazov} | ${v.miesto} | ${v.kraj} | ${v.web ?? "–"}${v.web_stav === 0 ? " (nedostupný)" : ""} | ${v.zvonenie ? v.zvonenie.zdroj : "–"} |`).join("\n")}

## Na EduPage, ale zvonenie sa nenašlo (${bezZvonenia.length})
${bezZvonenia.map((v) => `- ${v.stupen} ${v.nazov}, ${v.miesto} (${v.edupage!.sub}, ${v.rozvrh_stav})`).join("\n")}
`);
console.log(zozbierane, Object.fromEntries(Object.entries(celkom).map(([k, r]) => [k, `${r.pokrytie}/${r.spolu} = ${pct(r.pokrytie, r.spolu)}`])));
