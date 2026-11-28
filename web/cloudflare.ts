// Ochrana pred Workerom (na okraji Cloudflare, nemíňa denný limit 100 000 behov Workera):
//   1. obmedzenie rýchlosti pre /api/v1/ a /mcp: 10 požiadaviek za 10 s z jednej IP, potom 10 s blok (Free plán nedovolí
//      dlhšie okno; jedna IP tak spustí Worker najviac asi 86 000-krát za deň),
//   2. blok metód: mimo /mcp len GET, HEAD a OPTIONS (POST na ľubovoľnú cestu by inak spúšťal Worker), na /mcp len GET
//      (klienti MCP ním skúšajú SSE a čakajú 405 od Workera), POST a OPTIONS; PUT či DELETE by spustili Worker zbytočne.
// Pravidlá pridá do zóny dvoriste.xyz, ak tam ešte nie sú (podľa ref), iné pravidlá zóny nemení.
//   bun web/cloudflare.ts            nastaví pravidlá
//   bun web/cloudflare.ts --ukaz     len vypíše, čo v zóne je
// Token: ~/.config/rozvrh/cloudflare.env (Zone WAF: Edit, Zone: Read pre dvoriste.xyz).
import { stat } from "node:fs/promises";
import { ADRESA } from "./stranky";

const ZONA = "dvoriste.xyz";
const HOST = new URL(ADRESA).host;

type Pravidlo = { id?: string; ref: string; description: string; expression: string; action: string; ratelimit?: Record<string, unknown> };
const PRAVIDLA: Record<string, Pravidlo> = {
  http_ratelimit: {
    ref: "rozvrh-api-limit", description: "rozvrh: API a MCP najviac 10 požiadaviek za 10 s z jednej IP",
    expression: `(http.host eq "${HOST}" and (starts_with(http.request.uri.path, "/api/v1/") or http.request.uri.path eq "/mcp"))`,
    action: "block",
    ratelimit: { characteristics: ["ip.src", "cf.colo.id"], period: 10, requests_per_period: 10, mitigation_timeout: 10 },
  },
  http_request_firewall_custom: {
    ref: "rozvrh-len-citanie", description: "rozvrh: mimo /mcp len GET, HEAD a OPTIONS, na /mcp len GET, POST a OPTIONS",
    expression: `(http.host eq "${HOST}" and ((http.request.uri.path ne "/mcp" and not http.request.method in {"GET" "HEAD" "OPTIONS"}) or (http.request.uri.path eq "/mcp" and not http.request.method in {"GET" "POST" "OPTIONS"})))`,
    action: "block",
  },
};

const tajne = `${process.env.HOME}/.config/rozvrh/cloudflare.env`;
if (((await stat(tajne).catch(() => null))?.mode ?? 0o600) & 0o077) throw new Error(`${tajne} musí mať práva 600 (chmod 600).`);
const env = Object.fromEntries(((await Bun.file(tajne).text().catch(() => "")).split("\n"))
  .map((r) => r.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/)).filter((m) => m !== null).map((m) => [m[1]!, m[2]!]));
if (!env.CLOUDFLARE_API_TOKEN) throw new Error("Chýba CLOUDFLARE_API_TOKEN v ~/.config/rozvrh/cloudflare.env.");

type Odpoved<T> = { success: boolean; result: T; errors: { code: number; message: string }[] };
async function cf<T>(cesta: string, init: RequestInit = {}): Promise<Odpoved<T> & { status: number }> {
  const r = await fetch(`https://api.cloudflare.com/client/v4${cesta}`, {
    ...init, headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, "content-type": "application/json" },
  });
  return { ...((await r.json()) as Odpoved<T>), status: r.status };
}

const zony = await cf<{ id: string }[]>(`/zones?name=${ZONA}`);
const zona = zony.result?.[0]?.id;
if (!zona) throw new Error(`Zóna ${ZONA} sa nenašla: ${JSON.stringify(zony.errors)}`);

let chyby = 0;
for (const [faza, pravidlo] of Object.entries(PRAVIDLA)) {
  const vstup = await cf<{ id: string; rules?: Pravidlo[] }>(`/zones/${zona}/rulesets/phases/${faza}/entrypoint`);
  const existuje = vstup.result?.rules?.find((p) => p.ref === pravidlo.ref);
  if (process.argv.includes("--ukaz")) {
    console.log(faza, (vstup.result?.rules ?? []).map((p) => `${p.ref ?? "-"}: ${p.description}`));
    continue;
  }
  const r = vstup.status === 404
    ? await cf(`/zones/${zona}/rulesets/phases/${faza}/entrypoint`, { method: "PUT", body: JSON.stringify({ rules: [pravidlo] }) })
    : existuje
      ? await cf(`/zones/${zona}/rulesets/${vstup.result.id}/rules/${existuje.id}`, { method: "PATCH", body: JSON.stringify(pravidlo) })
      : await cf(`/zones/${zona}/rulesets/${vstup.result.id}/rules`, { method: "POST", body: JSON.stringify(pravidlo) });
  if (r.success) console.log(`${faza}: ${pravidlo.ref} ${existuje ? "aktualizované" : "pridané"}`);
  else { chyby++; console.error(`${faza}: ${pravidlo.ref} zlyhalo: ${JSON.stringify(r.errors)}`); }
}
if (chyby) process.exit(1);
