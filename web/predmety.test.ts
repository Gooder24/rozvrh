import { expect, test } from "bun:test";
import { doplnFarby, farba, predmetySkoly, slovnik } from "./predmety";

type B = { predmet: string; skratka: string };
const blok = (b: B) => ({ den: 0, hodina: "1", trvanie: 1, ucebna: null, skupina: null, tyzden: null, ...b });
const skola = (id: string, stupen: "SŠ" | "ZŠ", bloky: B[]) => ({ id, stupen, triedy: [{ nazov: "1.A", bloky: bloky.map(blok) }] });
const s = (n: number, stupen: "SŠ" | "ZŠ", b: B[], od = 0) => Array.from({ length: n }, (_, i) => skola(`${stupen}${od + i}`, stupen, b));

test("skratku bez názvu doplní, keď ju väčšina škôl rovnakého stupňa píše jedným názvom", () => {
  const skoly = [...s(9, "SŠ", [{ predmet: "Seminár z matematiky", skratka: "SEM" }]), ...s(1, "SŠ", [{ predmet: "Seminár z fyziky", skratka: "SEM" }], 9)];
  const sl = slovnik(skoly);
  expect(sl.odhad("SŠ", "SEM")).toMatchObject({ nazov: "Seminár z matematiky", skol: 9, podiel: 0.9 });
  const p = predmetySkoly(skola("x", "SŠ", [{ predmet: "SEM", skratka: "SEM" }]), sl, new Map());
  expect(p.SEM).toEqual({ nazov: "Seminár z matematiky", odhad: true });
});

test("nejasnú skratku nedoplní: málo škôl, rozdelené názvy alebo jedno písmeno", () => {
  const malo = slovnik(s(4, "ZŠ", [{ predmet: "Dejepis", skratka: "DEJ" }]));
  expect(malo.odhad("ZŠ", "DEJ")).toBeNull();
  const rozdelene = slovnik([...s(6, "SŠ", [{ predmet: "Seminár z nemčiny", skratka: "SEN" }]), ...s(4, "SŠ", [{ predmet: "Seminár z informatiky", skratka: "SEN" }], 6)]);
  expect(rozdelene.odhad("SŠ", "SEN")).toBeNull();
  expect(slovnik(s(9, "ZŠ", [{ predmet: "Matematika", skratka: "M" }])).odhad("ZŠ", "M")).toBeNull();
});

test("stupeň má prednosť: v ZŠ a SŠ môže tá istá skratka znamenať iný predmet", () => {
  const sl = slovnik([...s(6, "ZŠ", [{ predmet: "Prvouka", skratka: "PRV" }]), ...s(20, "SŠ", [{ predmet: "Právo", skratka: "PRV" }], 6)]);
  expect(sl.odhad("ZŠ", "PRV")?.nazov).toBe("Prvouka");
  expect(sl.odhad("SŠ", "PRV")?.nazov).toBe("Právo");
});

test("rovnaký názov má rovnakú farbu bez ohľadu na veľké písmená a diakritiku; poradie farieb sa len dopĺňa", () => {
  const sl = slovnik([...s(6, "ZŠ", [{ predmet: "Anglický jazyk", skratka: "ANJ" }]), ...s(5, "SŠ", [{ predmet: "anglicky jazyk", skratka: "AJ" }, { predmet: "Biológia", skratka: "BIO" }], 6)]);
  const poradie = doplnFarby(["biologia"], sl);
  expect(poradie).toEqual(["biologia", "anglicky jazyk"]);
  const farby = new Map(poradie.map((k, i) => [k, i]));
  const a = predmetySkoly(skola("a", "ZŠ", [{ predmet: "Anglický jazyk", skratka: "ANJ" }]), sl, farby);
  const b = predmetySkoly(skola("b", "SŠ", [{ predmet: "ANGLICKÝ JAZYK", skratka: "AJ" }]), sl, farby);
  expect(a["Anglický jazyk"]).toMatchObject(farba(1));
  expect(b["ANGLICKÝ JAZYK"]).toMatchObject(farba(1));
  const vlastny = predmetySkoly(skola("c", "SŠ", [{ predmet: "Kurz záhradníctva", skratka: "KZZ" }]), sl, farby);
  expect(vlastny["Kurz záhradníctva"]).toBeUndefined();
});

test("24 najčastejších predmetov má rôzne farby a blízke odtiene sa líšia svetlosťou", () => {
  const f = Array.from({ length: 24 }, (_, i) => farba(i));
  expect(new Set(f.map((x) => x.h)).size).toBe(24);
  for (const x of f) for (const y of f) if (Math.abs(x.h - y.h) === 15 || Math.abs(x.h - y.h) === 345) expect(x.t).not.toBe(y.t);
});
