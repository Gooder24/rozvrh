import { expect, test } from "bun:test";
import type { Trieda } from "../typy";
import { FARBY, farba, farbyPredmetov } from "./farby";

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

test("predmety, ktoré sa stretnú v rôznych triedach, nezdieľajú farbu ani keď ich je viac ako v palete", () => {
  // 30 predmetov po 10 v triede, prekrývajú sa: celkovo treba viac než 22 farieb, v každej triede musia byť rôzne.
  const p = Array.from({ length: 30 }, (_, i) => `P${i}`);
  const triedy = Array.from({ length: 21 }, (_, k) => trieda(`T${k}`, p.slice(k, k + 10)));
  const f = farbyPredmetov(triedy);
  for (const t of triedy) {
    const v = [...new Set(t.bloky.map((b) => b.skratka))].map((s) => farba(f.get(s)!).bg);
    expect(new Set(v).size).toBe(v.length);
  }
});

test("vypočítané farby za paletou majú písmo s dosť veľkým kontrastom", () => {
  const svietivost = (hsl: string) => {
    const [h, s, l] = hsl.match(/[\d.]+/g)!.map(Number) as [number, number, number];
    const a = (s / 100) * Math.min(l / 100, 1 - l / 100), f = (n: number) => { const k = (n + h / 30) % 12; return l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(f(0)) + 0.7152 * lin(f(8)) + 0.0722 * lin(f(4));
  };
  const hex = (x: string) => { const c = [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!; };
  for (let i = FARBY.length; i < FARBY.length + 40; i++) {
    const { bg, fg } = farba(i);
    const a = svietivost(bg), b = fg === "#fff" ? 1 : hex(fg);
    expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
  }
});
