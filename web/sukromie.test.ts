import { expect, test } from "bun:test";
import { meno, nazovTriedy, SPECIALNE, type Kontext } from "./sukromie";

// Vymyslené mená v tvaroch, ako ich školy píšu do EduPage. Počty škôl pre bežné slová skupín a učební.
const vyskyt = new Map(["skupina", "chlapci", "dievcata", "rocnik", "ucebna", "informatiky", "telocvicna", "anglicky", "jazyk", "sportova", "priprava", "csoport", "telesna", "vychova", "ib"].map((w) => [w, 50]));
const k: Kontext = { ucitelia: new Set(["vzor", "kul", "pa", "xy", "sk"]), vyskyt };

test("mená detí a učiteľov v názvoch skupín a učební sa zahodia", () => {
  for (const t of ["Janko Hraško", "ANJ Vzorová", "6.roč.-VZOROVÁ", "STR, Ing. Hraško", "Ema Vzorová", "2.ročník Vzorová", "Mrkvička Hraško",
    "ANJ Vzor", "INF KUL", "Ján Hraško", "Novák", "J.M.Hraško", "J.H.", "J. Hraško", "Hraško J.", "Vzorova sk.", "Vzorová sk.",
    "ANJ Hra", "Hra skupina", "QZ", "SEB vzor", "I.K.", "V. S.", "XY.PA", "Nováková ANJ", "Réka"])
    expect(meno(t, k, true, true), t).not.toBeNull();
});

test("bežné názvy skupín a učební ostanú", () => {
  for (const t of ["1. Skupina", "Chlapci", "Dievčatá", "ANJ1", "2.sk", "Športová príprava", "Učebňa informatiky", "4. ročník", "1. Csoport", "EMA", "ETV", "1.sk", "2. sk", "II.A", "I.B",
    "U.V.A", "TELESNÁ A ŠPORTOVÁ VÝCHOVA"])
    expect(meno(t, k, true, true), t).toBeNull();
  // Predmety (nie prísne): jazyk, ktorý je zároveň priezviskom.
  expect(meno("IB Slovak", k, false)).toBeNull();
});

test("trieda s menom triedneho sa skráti, inak dostane náhradný názov", () => {
  expect(nazovTriedy("I.A - Mgr. Jana Vzorná - PIT", k, "Trieda 1")).toBe("I.A");
  expect(nazovTriedy("III.B", k, "Trieda 2")).toBe("III.B");
  expect(nazovTriedy("Mgr. Hraško", k, "Trieda 3")).toBe("Trieda 3");
  expect(nazovTriedy("I.GA", k, "Trieda 4")).toBe("I.GA");
  expect(nazovTriedy("PA.IB", k, "Trieda 5")).toBe("Trieda 5");
  expect(nazovTriedy("NG.PA", k, "Trieda 6")).toBe("Trieda 6");
  expect(nazovTriedy("II.SZ", k, "Trieda 7")).toBe("II.SZ");
});

test("predmety a triedy žiakov so špeciálnymi potrebami sa spoznajú", () => {
  for (const t of ["Rozvíjanie komunikačnej schopnosti", "Individuálna logopedická intervencia", "2.D aut", "VII. C ŠT", "ŠPEC VII."]) expect(SPECIALNE.test(t), t).toBe(true);
  for (const t of ["Matematika", "Anglický jazyk", "2.D", "Stavebníctvo", "1.STR", "II.ST", "Špecifické technológie"]) expect(SPECIALNE.test(t), t).toBe(false);
});
