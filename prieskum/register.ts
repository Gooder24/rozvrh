// Načíta zoznamy škôl CVTI (data/register/*.xls).
// bun prieskum/register.ts      stredné školy -> data/skoly-register.json
// bun prieskum/register.ts zs   základné školy -> data/zs/skoly-register.json
import * as XLSX from "xlsx";

const ZS = process.argv[2] === "zs";
const SUBORY: Record<string, string> = ZS
  ? { "zoznam_zakladne-skoly": "základná" }
  : { GYM_Z: "gymnázium / športová", KON_Z: "konzervatórium", SOS_Z: "odborná", SPECSS_Z: "špeciálna" };
const KRAJE = ["", "Bratislavský", "Trnavský", "Trenčiansky", "Nitriansky", "Žilinský", "Banskobystrický", "Prešovský", "Košický"];
const ZRIADOVATEL: Record<string, string> = { "1": "štátna", "2": "obecná", "3": "krajská", "5": "súkromná", "6": "cirkevná", "9": "iná" };

const skoly = [];
for (const [subor, typ] of Object.entries(SUBORY)) {
  const wb = XLSX.read(await Bun.file(`data/register/${subor}.xls`).arrayBuffer());
  const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(wb.Sheets[wb.SheetNames[0]!]!, { range: 1, raw: false });
  for (const r of rows) {
    if (!/^\d{6,12}$/.test(String(r.eduid ?? "").trim())) continue; // EDUID ide do ciest súborov
    const web = String(r.adrwww ?? "").trim();
    skoly.push({
      eduid: String(r.eduid).trim(), kodsko: String(r.kodsko), typ, druh: String(r.druh),
      kraj: KRAJE[Number(r.kraj)] ?? String(r.kraj), okres: String(r.okres),
      zriadovatel: ZRIADOVATEL[String(r.zriadz)] ?? String(r.zriadz),
      nazov: String(r.nazov).trim(), ulica: String(r.ulica ?? "").trim(), miesto: String(r.miesto ?? "").trim(),
      psc: String(r.psc ?? "").trim(), web: web || null, ziaci: Number(r.ziaci) || 0,
    });
  }
}
await Bun.write(ZS ? "data/zs/skoly-register.json" : "data/skoly-register.json", JSON.stringify(skoly, null, 1));
console.log(skoly.length, "škôl");
