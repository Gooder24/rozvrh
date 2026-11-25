import { expect, test } from "bun:test";
import type { Trieda } from "../typy";
import { DALSIE, KELLYHO, farbyPredmetov, kontrast, rozdiel } from "./farby";

const trieda = (nazov: string, skratky: string[]): Trieda =>
  ({ nazov, bloky: skratky.map((skratka, i) => ({ skratka, predmet: skratka, den: i % 5, hodina: String(i % 7), trvanie: 1, ucebna: null, skupina: null, tyzden: null })) });
const farbyTriedy = (f: Map<string, { bg: string }>, t: Trieda) => [...new Set(t.bloky.map((b) => b.skratka))].map((s) => f.get(s)!.bg);

test("v jednej triede má každý predmet inú farbu a v celej škole rovnakú", () => {
  const triedy = [trieda("1.A", ["MAT", "SJL", "ANJ", "FYZ", "MAT", "INF"]), trieda("1.B", ["MAT", "SJL", "NEJ", "CHE", "BIO"]), trieda("2.A", ["ANJ", "NEJ", "DEJ"])];
  const f = farbyPredmetov(triedy);
  for (const t of triedy) { const v = farbyTriedy(f, t); expect(new Set(v).size).toBe(v.length); }
  expect(f.get("MAT")).toEqual(KELLYHO[0]!); // najčastejší predmet dostane prvú farbu
  expect(farbyPredmetov(triedy)).toBe(f);
});

test("trieda s 35 predmetmi: farby sa neopakujú a dajú sa rozoznať", () => {
  const skratky = Array.from({ length: 35 }, (_, i) => `P${i}`);
  const t = trieda("4.S", skratky);
  const v = farbyTriedy(farbyPredmetov([t]), t);
  expect(new Set(v).size).toBe(35);
  const najmensi = Math.min(...v.flatMap((a, i) => v.slice(i + 1).map((b) => rozdiel(a, b))));
  expect(najmensi).toBeGreaterThan(0.05);
});

test("na každej farbe je písmo s kontrastom aspoň 4,5 : 1", () => {
  for (const { bg, fg } of [...KELLYHO, ...DALSIE]) expect(kontrast(bg, fg)).toBeGreaterThanOrEqual(4.5);
});
