// Letecký výrez okolo budovy školy pre jej stránku: Ortofotomozaika SR (GKÚ Bratislava, CC BY 4.0, bez poplatkov),
// cez verejnú službu WMS, jeden dopyt naraz s pauzou.
//   bun prieskum/letecky.ts      stiahne výrezy, ktoré v data/letecky/ ešte nie sú (dá sa prerušiť a pustiť znova)
// Výrez dostane len škola, ktorej bod v data/mapa/adresy-gps.json je budova („a“), nie len ulica.
// data/letecky/<id>.jpg nie je v gite (vyše 200 MB); web/build.ts ho skopíruje k stránke školy, ak existuje.
import { mkdir } from "node:fs/promises";

const DIR = "data/letecky";
export const SIRKA = 800, VYSKA = 450;
/** Šírka výrezu v metroch v teréne (0,25 m na pixel). */
const METROV = 200;
const WMS = "https://zbgisws.skgeodesy.sk/zbgis_ortofoto_wms/service.svc/get";

/** Hranice výrezu [západ, juh, východ, sever] v stupňoch, aby pixel mal v teréne rovnakú šírku aj výšku. */
export const hranice = (lon: number, lat: number) => {
  const pol = METROV / 2, polV = (pol * VYSKA) / SIRKA;
  const dLon = pol / (111_320 * Math.cos((lat * Math.PI) / 180)), dLat = polV / 110_574;
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat] as const;
};

if (import.meta.main) {
  const body = (await Bun.file("data/mapa/adresy-gps.json").json()) as Record<string, [number, number, string]>;
  await mkdir(DIR, { recursive: true });
  let nove = 0, chyby = 0;
  for (const [id, [lon, lat, presnost]] of Object.entries(body)) {
    if (presnost !== "a" || (await Bun.file(`${DIR}/${id}.jpg`).exists())) continue;
    const u = new URL(WMS);
    for (const [k, v] of Object.entries({ SERVICE: "WMS", VERSION: "1.3.0", REQUEST: "GetMap", LAYERS: "1", STYLES: "", CRS: "CRS:84",
      BBOX: hranice(lon, lat).map((x) => x.toFixed(6)).join(","), WIDTH: String(SIRKA), HEIGHT: String(VYSKA), FORMAT: "image/jpeg" })) u.searchParams.set(k, v);
    const r = await fetch(u, { headers: { "user-agent": "rozvrh-letecky/1.0" } }).catch(() => null);
    const typ = r?.headers.get("content-type") ?? "";
    // Služba pri chybe vracia XML s HTTP 200; berie sa len skutočný JPEG.
    if (r?.ok && typ.startsWith("image/jpeg")) { await Bun.write(`${DIR}/${id}.jpg`, await r.arrayBuffer()); nove++; } else chyby++;
    if ((nove + chyby) % 100 === 0) console.log(`${nove} nových, ${chyby} chýb`);
    await Bun.sleep(500);
  }
  console.log(`hotovo: ${nove} nových, ${chyby} chýb`);
}
