// Poloha škôl na mapu: adresa z registra → súradnice z Nominatim (OpenStreetMap), najviac 1 požiadavka za sekundu.
//   bun prieskum/geokoduj.ts      doplní školy, ktoré v data/mapa/adresy-gps.json ešte nie sú (dá sa prerušiť a pustiť znova)
// Výsledok: { id: [lon, lat, presnosť] }, presnosť „a“ = budova na adrese, „u“ = len ulica. Bod, ktorý OpenStreetMap
// nemá v obci školy (rovnaká ulica v susednom meste) alebo je ďalej ako MAX_KM od stredu obce (data/mapa/obce-gps.json),
// sa zahodí; taká škola ostane na mape v strede obce.
import { nacitajSkoly } from "../web/data";

const VON = "data/mapa/adresy-gps.json";
const MAX_KM = 15;
type Bod = [number, number, "a" | "u"];
type Vysledok = { lat: string; lon: string; category: string; addresstype: string; address?: Record<string, string> };

const zjednot = (s: string) => s.normalize("NFC").toLowerCase().replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
/** Leží výsledok v obci školy? Pri „Bratislava-Ružinov“ stačí Bratislava, mestskú časť OpenStreetMap píše rôzne. */
export const vObci = (adresa: Record<string, string> | undefined, miesto: string) => {
  const obec = zjednot(/^(Bratislava|Košice)-/.test(miesto) ? miesto.split("-")[0]! : miesto);
  return ["city", "town", "village", "municipality", "administrative"].some((k) => adresa?.[k] !== undefined && zjednot(adresa[k]!) === obec);
};

let posledna = 0;
const hladaj = async (q: string) => {
  await Bun.sleep(Math.max(0, posledna + 1100 - Date.now()));
  posledna = Date.now();
  const u = new URL("https://nominatim.openstreetmap.org/search");
  for (const [k, v] of Object.entries({ q, format: "jsonv2", addressdetails: "1", countrycodes: "sk", limit: "1" })) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { "user-agent": "rozvrh-geokoder/1.0", "accept-language": "sk" } });
  if (!r.ok) throw new Error(`Nominatim ${r.status}`);
  return ((await r.json()) as Vysledok[])[0] ?? null;
};
const km = (a: [number, number], b: [number, number]) => {
  const x = (a[0] - b[0]) * 111.32 * Math.cos((a[1] * Math.PI) / 180), y = (a[1] - b[1]) * 110.57;
  return Math.hypot(x, y);
};
const presna = (v: Vysledok) => ["amenity", "building", "place", "office"].includes(v.category) && v.addresstype !== "road";

/** Varianty adresy od najpresnejšej: celá, potom s každou časťou čísla „súpisné/orientačné“. */
export const varianty = (ulica: string, miesto: string) => {
  const u = ulica.replace(/^\s*ul(ica)?\.\s*/i, "").replace(/\s+/g, " ").trim();
  // „Bratislava-Dúbravka“ hľadá Nominatim ako „Dúbravka, Bratislava“.
  const obec = /^(Bratislava|Košice)-/.test(miesto) ? `${miesto.split("-").slice(1).join("-")}, ${miesto.split("-")[0]}` : miesto;
  const m = u.match(/^(.*?)[\s,]*(\d+[a-zA-Z]?(?:\/\d+[a-zA-Z]?)?)$/);
  if (!m) return [`${u}, ${obec}`];
  const [, ulicaBez = "", cislo = ""] = m;
  const sUlicou = ulicaBez && ulicaBez !== miesto ? `${ulicaBez} ` : "";
  const cisla = [cislo, ...cislo.split("/").reverse()].filter((c, i, z) => z.indexOf(c) === i);
  return cisla.map((c) => (sUlicou ? `${sUlicou}${c}, ${obec}` : `${c}, ${obec}`));
};

if (import.meta.main) {
  const skoly = await nacitajSkoly();
  const stredy = (await Bun.file("data/mapa/obce-gps.json").json()) as Record<string, [number, number]>;
  const hotove = (await Bun.file(VON).json().catch(() => ({}))) as Record<string, Bod>;
  let nove = 0, ulice = 0, zle = 0;
  const uloz = () => Bun.write(VON, JSON.stringify(Object.fromEntries(Object.entries(hotove).sort())));
  for (const s of skoly) {
    if (hotove[s.id]) continue;
    const stred = stredy[`${s.miesto}|${s.okres}`];
    let najlepsi: Bod | null = null;
    for (const q of varianty(s.ulica, s.miesto)) {
      const v = await hladaj(q);
      if (!v || !vObci(v.address, s.miesto)) continue;
      const b: [number, number] = [Math.round(Number(v.lon) * 1e5) / 1e5, Math.round(Number(v.lat) * 1e5) / 1e5];
      if (stred && km(b, stred) > MAX_KM) continue;
      if (presna(v)) { najlepsi = [...b, "a"]; break; }
      najlepsi ??= [...b, "u"];
    }
    if (najlepsi) { hotove[s.id] = najlepsi; nove++; if (najlepsi[2] === "u") ulice++; } else zle++;
    if ((nove + zle) % 20 === 0) { await uloz(); console.log(`${nove + zle}: ${nove} nových (${ulice} len ulica), ${zle} bez polohy`); }
  }
  await uloz();
  console.log(`hotovo: ${nove} nových (${ulice} len ulica), ${zle} bez polohy, spolu ${Object.keys(hotove).length} z ${skoly.length}`);
}
