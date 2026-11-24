// Popis API (OpenAPI 3.1), zapisuje ho web/build.ts do /openapi.json.
import { ADRESA } from "./stranky";

const id = { name: "id", in: "path", required: true, description: "EDUID z registra CVTI, subdoména EduPage (napr. gvoza) alebo adresa stránky školy", schema: { type: "string", pattern: "^[a-z0-9-]{1,100}$" } };
const chyba = { description: "Chyba", content: { "application/json": { schema: { type: "object", properties: { chyba: { type: "string" } } } } } };
const ok = (popis: string) => ({ description: popis, content: { "application/json": { schema: { type: "object" } } } });
const limit = { ...chyba, description: "Príliš veľa požiadaviek (60 za minútu na IP)" };

export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "Rozvrhy škôl SR", version: "1.0.0",
    description: "Zvonenie a rozvrhy tried základných a stredných škôl na Slovensku. Bez kľúča, CORS otvorený, 60 požiadaviek za minútu na IP. Celé dáta naraz: /data/skoly.json, /data/skoly.csv, /data/skoly/{eduid}.json. Voľne na použitie s uvedením zdroja.",
  },
  servers: [{ url: ADRESA }],
  paths: {
    "/api/v1/schools": { get: {
      summary: "Hľadanie škôl", parameters: [
        { name: "q", in: "query", schema: { type: "string", maxLength: 100 }, description: "Slová z názvu, obce alebo okresu" },
        { name: "mesto", in: "query", schema: { type: "string", maxLength: 100 } },
        { name: "kraj", in: "query", schema: { type: "string", maxLength: 100 } },
        { name: "stupen", in: "query", schema: { type: "string", enum: ["SŠ", "ZŠ"] } },
        { name: "stav", in: "query", schema: { type: "string", enum: ["verejny_rozvrh", "len_zvonenie", "nenajdene"] } },
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 500, default: 50 } },
      ], responses: { 200: ok("{ pocet, vytvorene, skoly[] }"), 400: chyba, 429: limit } } },
    "/api/v1/schools/{id}": { get: { summary: "Celý záznam školy vrátane rozvrhov tried", parameters: [id], responses: { 200: ok("Škola"), 404: chyba, 429: limit } } },
    "/api/v1/schools/{id}/zvonenie": { get: { summary: "Zvonenie školy", parameters: [id], responses: { 200: ok("Zvonenie a jeho zdroj"), 404: chyba, 429: limit } } },
    "/api/v1/schools/{id}/triedy": { get: { summary: "Zoznam tried s verejným rozvrhom", parameters: [id], responses: { 200: ok("Triedy"), 404: chyba, 429: limit } } },
    "/api/v1/schools/{id}/triedy/{trieda}/rozvrh": { get: {
      summary: "Týždenný rozvrh triedy", parameters: [id, { name: "trieda", in: "path", required: true, schema: { type: "string", maxLength: 50 }, description: "Názov triedy, napr. I.A" }],
      responses: { 200: ok("Bloky rozvrhu s časmi"), 404: chyba, 429: limit } } },
  },
};
