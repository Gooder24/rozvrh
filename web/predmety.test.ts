import { expect, test } from "bun:test";
import { predmetySkoly, slovnik } from "./predmety";

type B = { predmet: string; skratka: string };
const blok = (b: B) => ({ den: 0, hodina: "1", trvanie: 1, ucebna: null, skupina: null, tyzden: null, ...b });
const skola = (id: string, stupen: "SŠ" | "ZŠ", bloky: B[]) => ({ id, stupen, triedy: [{ nazov: "1.A", bloky: bloky.map(blok) }] });
const s = (n: number, stupen: "SŠ" | "ZŠ", b: B[], od = 0) => Array.from({ length: n }, (_, i) => skola(`${stupen}${od + i}`, stupen, b));

test("skratku bez názvu doplní, keď ju väčšina škôl rovnakého stupňa píše jedným názvom", () => {
  const skoly = [...s(9, "SŠ", [{ predmet: "Seminár z matematiky", skratka: "SEM" }]), ...s(1, "SŠ", [{ predmet: "Seminár z fyziky", skratka: "SEM" }], 9)];
  const sl = slovnik(skoly);
  expect(sl.odhad("SŠ", "SEM")).toMatchObject({ nazov: "Seminár z matematiky", skol: 9, podiel: 0.9 });
  const p = predmetySkoly(skola("x", "SŠ", [{ predmet: "SEM", skratka: "SEM" }]), sl);
  expect(p.SEM).toEqual({ nazov: "Seminár z matematiky", odhad: true });
});

test("nejasnú skratku nedoplní: málo škôl, rozdelené názvy alebo jedno písmeno", () => {
  const malo = slovnik(s(4, "ZŠ", [{ predmet: "Dejepis", skratka: "DEJ" }]));
  expect(malo.odhad("ZŠ", "DEJ")).toBeNull();
  const rozdelene = slovnik([...s(6, "SŠ", [{ predmet: "Seminár z nemčiny", skratka: "SEN" }]), ...s(4, "SŠ", [{ predmet: "Seminár z informatiky", skratka: "SEN" }], 6)]);
  expect(rozdelene.odhad("SŠ", "SEN")).toBeNull();
  expect(slovnik(s(9, "ZŠ", [{ predmet: "Matematika", skratka: "M" }])).odhad("ZŠ", "M")).toBeNull();
});

test("stupeň má prednosť, ale keď ZŠ a SŠ čítajú skratku inak, odhad nedá (spojená škola má triedy oboch)", () => {
  const sl = slovnik([...s(6, "ZŠ", [{ predmet: "Prvouka", skratka: "PRV" }]), ...s(20, "SŠ", [{ predmet: "Právo", skratka: "PRV" }], 6),
    ...s(5, "ZŠ", [{ predmet: "Dejepis", skratka: "DEJ" }], 30), ...s(3, "SŠ", [{ predmet: "Dejepis", skratka: "DEJ" }], 40)]);
  expect(sl.odhad("ZŠ", "PRV")).toBeNull();
  expect(sl.odhad("SŠ", "PRV")).toBeNull();
  expect(sl.odhad("SŠ", "DEJ")?.nazov).toBe("Dejepis");
});

test("názov, ktorý škola píše sama, ostane bez odhadu", () => {
  const sl = slovnik(s(9, "SŠ", [{ predmet: "Anglický jazyk", skratka: "ANJ" }]));
  const p = predmetySkoly(skola("c", "SŠ", [{ predmet: "Kurz záhradníctva", skratka: "KZZ" }, { predmet: "ANJ", skratka: "ANJ" }]), sl);
  expect(p).toEqual({ ANJ: { nazov: "Anglický jazyk", odhad: true } });
});
