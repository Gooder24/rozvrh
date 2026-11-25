// Zostaví web a nasadí ho na Cloudflare (Worker + statické súbory na rozvrh.dvoriste.xyz), potom pošle
// zmenené stránky vyhľadávačom cez IndexNow (Bing, Yandex, Seznam…; Google číta sitemap).
//   bun web/nasad.ts            zostavenie + nasadenie + IndexNow
//   bun web/nasad.ts --skus     len zostavenie a wrangler deploy --dry-run
//   bun web/nasad.ts --indexnow len znova pošle IndexNow (keď predtým zlyhal)
// Token: ~/.config/rozvrh/cloudflare.env (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID), mimo repa, práva 600.
import { rename, stat } from "node:fs/promises";
import { ADRESA } from "./stranky";

const skus = process.argv.includes("--skus");
const lenIndexnow = process.argv.includes("--indexnow");
const spusti = (prikaz: string[], cwd = ".", env: Record<string, string> = {}) => {
  const r = Bun.spawnSync(prikaz, { cwd, env: { ...process.env, ...env, WRANGLER_SEND_METRICS: "false" }, stdout: "inherit", stderr: "inherit" });
  if (r.exitCode !== 0) throw new Error(`${prikaz.join(" ")} skončil s kódom ${r.exitCode}`);
};

const tajne = `${process.env.HOME}/.config/rozvrh/cloudflare.env`;
// Token čítajú len súbory s právami 600 (iný účet na stroji ho nesmie vidieť).
const prava = await stat(tajne).then((s) => s.mode & 0o777).catch(() => null);
if (prava !== null && prava !== 0o600) throw new Error(`${tajne} má práva ${prava.toString(8)}, treba chmod 600.`);
const env = Object.fromEntries(((await Bun.file(tajne).text().catch(() => "")).split("\n"))
  .map((r) => r.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/)).filter((m) => m !== null).map((m) => [m[1]!, m[2]!]));
if (!skus && !lenIndexnow && (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID)) throw new Error(`Chýba ${tajne} s CLOUDFLARE_API_TOKEN a CLOUDFLARE_ACCOUNT_ID.`);

if (!lenIndexnow) {
  spusti(["bun", "web/build.ts"]);
  spusti(["../node_modules/.bin/wrangler", "deploy", ...(skus ? ["--dry-run"] : [])], "site", skus ? {} : env);
  if (skus) process.exit(0);
}

// Až po úspešnom nasadení: zmenené stránky do IndexNow a odtlačky ako nový základ.
const { kluc, cesty } = (await Bun.file("site/indexnow.json").json()) as { kluc: string; cesty: string[] };
const host = new URL(ADRESA).host;
// IndexNow odmietne (403), kým si neoverí súbor s kľúčom; po prvom nasadení to trvá aj hodiny. Neúspech nasadenie
// nezhodí: odtlačky ostanú staré, takže ďalšie nasadenie (alebo --indexnow) pošle tie isté stránky znova.
let zlyhalo = (await fetch(`${ADRESA}/${kluc}.txt`).then((r) => r.text()).catch(() => "")).trim() !== kluc;
// Vyhľadávače si prijaté adresy medzi sebou zdieľajú. Bing (api.indexnow.org) vracia 403 „UserForbiddedToAccessSite“,
// kým web nie je overený v Bing Webmaster Tools; vtedy adresy prijme Yandex.
const KAM = ["https://api.indexnow.org/indexnow", "https://yandex.com/indexnow"];
for (let i = 0; !zlyhalo && i < cesty.length; i += 10_000) {
  const body = JSON.stringify({ host, key: kluc, keyLocation: `${ADRESA}/${kluc}.txt`, urlList: cesty.slice(i, i + 10_000).map((c) => ADRESA + c) });
  let prijal = false;
  for (const kam of KAM) {
    const r = await fetch(kam, { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body })
      .catch((e: unknown) => (console.warn(`IndexNow ${kam}: ${e}`), null));
    console.log(`IndexNow ${new URL(kam).host}: ${Math.min(10_000, cesty.length - i)} adries, HTTP ${r?.status ?? "bez odpovede"}`);
    if (r?.ok) { prijal = true; break; }
  }
  if (!prijal) zlyhalo = true;
}
if (zlyhalo) console.warn("IndexNow adresy neprijal; pošlú sa pri ďalšom nasadení alebo: bun web/nasad.ts --indexnow");
else if (await Bun.file("site/zmeny.novy.json").exists()) await rename("site/zmeny.novy.json", "site/zmeny.json");
console.log(`nasadené: ${ADRESA}, zmenených stránok ${cesty.length}`);
