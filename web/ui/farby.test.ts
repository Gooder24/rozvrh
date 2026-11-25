import { expect, test } from "bun:test";
import type { Trieda } from "../typy";
import { FARBY, farbyPredmetov } from "./farby";

const trieda = (nazov: string, skratky: string[]): Trieda =>
  ({ nazov, bloky: skratky.map((skratka, i) => ({ skratka, predmet: skratka, den: i % 5, hodina: String(i % 7), trvanie: 1, ucebna: null, skupina: null, tyzden: null })) });

test("v jednej triede má každý predmet inú farbu a v celej škole rovnakú", () => {
  const triedy = [trieda("1.A", ["MAT", "SJL", "ANJ", "FYZ", "MAT", "INF"]), trieda("1.B", ["MAT", "SJL", "NEJ", "CHE", "BIO"]), trieda("2.A", ["ANJ", "NEJ", "DEJ"])];
  const f = farbyPredmetov(triedy);
  for (const t of triedy) {
    const v = [...new Set(t.bloky.map((b) => b.skratka))].map((s) => f.get(s));
    expect(new Set(v).size).toBe(v.length);
  }
  expect(f.get("MAT")).toBe(0); // najčastejší predmet dostane prvú farbu
  expect(farbyPredmetov(triedy)).toBe(f);
});

test("aj pri 22 predmetoch v jednej triede sa farby neopakujú", () => {
  const skratky = Array.from({ length: FARBY.length }, (_, i) => `P${i}`);
  const f = farbyPredmetov([trieda("3.C", skratky)]);
  expect(new Set(skratky.map((s) => f.get(s))).size).toBe(FARBY.length);
});
