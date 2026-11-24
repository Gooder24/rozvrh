// Spoločná logika API a MCP: údaje sa čítajú zo statických súborov webu (/data/…) cez väzbu ASSETS.
import type { Skola, SkolaKratko, Stav, Stupen } from "../../web/typy";

export type Env = {
  ASSETS: Fetcher;
  LIMIT: { limit(o: { key: string }): Promise<{ success: boolean }> };
};
type Index = { vytvorene: string; skoly: (SkolaKratko & { cesta: string })[] };
/** Index s textami na hľadanie pripravenými raz za život izolátu (normalize na tisíckach škôl stojí CPU). */
type Pripraveny = Index & { hladanie: { text: string; miesto: string; kraj: string }[] };

const ZAKLAD = "https://assets.local";
let index: Promise<Pripraveny> | null = null;

async function nacitaj<T>(env: Env, cesta: string): Promise<T | null> {
  const r = await env.ASSETS.fetch(new Request(ZAKLAD + cesta));
  return r.ok ? ((await r.json()) as T) : null;
}
export function nacitajIndex(env: Env) {
  index ??= nacitaj<Index>(env, "/data/skoly.json").then((i) => {
    if (!i) throw new Error("index chýba");
    return { ...i, hladanie: i.skoly.map((s) => ({
      text: bezDiakritiky(`${s.nazov} ${s.miesto} ${s.okres} ${s.edupage ?? ""}`), miesto: bezDiakritiky(s.miesto), kraj: bezDiakritiky(s.kraj),
    })) };
  }).catch((e: unknown) => { index = null; throw e; });
  return index;
}

const bezDiakritiky = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export const ID = /^[a-z0-9-]{1,100}$/i;

// IPv6: jeden pripojený počítač má celú /64, limit sa počíta na ňu (aj pri skrátenom zápise 2001:db8::1).
export function kluc(ip: string) {
  if (!ip.includes(":")) return ip;
  const [l, p = ""] = ip.toLowerCase().split("::");
  const lave = l ? l.split(":") : [], prave = ip.includes("::") && p ? p.split(":") : [];
  const plne = ip.includes("::") ? [...lave, ...Array(Math.max(0, 8 - lave.length - prave.length)).fill("0"), ...prave] : lave;
  return plne.slice(0, 4).map((x) => x.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}


/** Škola podľa EDUID, subdomény EduPage alebo slugu stránky. Bez `triedy` sa číta malý súbor bez rozvrhov tried. */
export async function najdi(env: Env, id: string, triedy = true): Promise<Skola | null> {
  if (!ID.test(id)) return null;
  const i = await nacitajIndex(env);
  const k = id.toLowerCase();
  const s = i.skoly.find((x) => x.id === k) ?? i.skoly.find((x) => x.edupage === k) ?? i.skoly.find((x) => x.slug === k);
  if (!s) return null;
  if (triedy) return nacitaj<Skola>(env, `/data/skoly/${s.id}.json`);
  const z = await nacitaj<Omit<Skola, "triedy">>(env, `/data/bez-tried/${s.id}.json`);
  return z ? { ...z, triedy: [] } : null;
}

export type Filter = { q?: string; mesto?: string; kraj?: string; stupen?: Stupen; stav?: Stav; limit?: number };
export async function hladaj(env: Env, f: Filter) {
  const i = await nacitajIndex(env);
  const q = f.q ? bezDiakritiky(f.q).split(/\s+/).filter(Boolean) : [];
  const mesto = f.mesto ? bezDiakritiky(f.mesto) : null;
  const kraj = f.kraj ? bezDiakritiky(f.kraj).replace(/ kraj$/, "") : null;
  const vysledok = i.skoly.filter((s, n) => {
    const h = i.hladanie[n]!;
    if (f.stupen && s.stupen !== f.stupen) return false;
    if (f.stav && s.stav !== f.stav) return false;
    if (mesto && h.miesto !== mesto && s.mestoSlug !== mesto) return false;
    if (kraj && !h.kraj.startsWith(kraj)) return false;
    if (q.length && !q.every((w) => h.text.includes(w))) return false;
    return true;
  });
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 500);
  return { pocet: vysledok.length, vytvorene: i.vytvorene, skoly: vysledok.slice(0, limit) };
}

export const zvonenie = (s: Skola) => ({
  id: s.id, nazov: s.nazov, miesto: s.miesto, stav: s.stav,
  zvonenie: s.zvonenie?.hodiny ?? null, zdroj: s.zvonenie ? { popis: s.zvonenie.zdroj, url: s.zvonenie.url } : null,
  skontrolovane: s.skontrolovane,
});

export function rozvrhTriedy(s: Skola, trieda: string) {
  const t = s.triedy.find((x) => x.nazov === trieda) ?? s.triedy.find((x) => bezDiakritiky(x.nazov).replace(/[\s.]/g, "") === bezDiakritiky(trieda).replace(/[\s.]/g, ""));
  if (!t) return null;
  const dni = s.rozvrh?.dni ?? [];
  const hodiny = new Map((s.zvonenie?.hodiny ?? []).map((h) => [h.n, h]));
  return {
    skola: { id: s.id, nazov: s.nazov, miesto: s.miesto }, trieda: t.nazov, platiOd: s.rozvrh?.od ?? null,
    bloky: t.bloky.map((b) => ({ ...b, denNazov: dni[b.den] ?? String(b.den), od: hodiny.get(b.hodina)?.od ?? null, do: hodiny.get(b.hodina)?.do ?? null })),
    skontrolovane: s.skontrolovane,
  };
}

export const porovnanie = (z: Skola[]) => z.map((s) => ({
  id: s.id, nazov: s.nazov, miesto: s.miesto, stav: s.stav, zaciatok: s.zaciatok, koniec: s.koniec, pocetHodin: s.pocetHodin,
  prestavky: (s.zvonenie?.hodiny ?? []).filter((h) => h.pouzita !== false).slice(1).map((h, i, a) => {
    const pred = i === 0 ? s.zvonenie!.hodiny.filter((x) => x.pouzita !== false)[0]! : a[i - 1]!;
    const min = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    return min(h.od) - min(pred.do);
  }),
  triedy: s.rozvrh?.triedy ?? null, dvojhodiny: s.rozvrh?.dvojhodiny ?? null,
}));
