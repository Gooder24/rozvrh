import { describe, expect, test } from "bun:test";
import type { Blok } from "../typy";
import { menoTyzdna, tyzdne } from "./tyzdne";

const b = (den: number, skratka: string, tyzden: string | null = null): Blok =>
  ({ den, hodina: "1", trvanie: 1, predmet: skratka, skratka, ucebna: null, skupina: null, tyzden });
const PRACOVNE = ["Pondelok", "Utorok", "Streda", "Štvrtok", "Piatok"];
const obsah = (t: ReturnType<typeof tyzdne>) =>
  t.map((x) => ({ nazov: x.nazov, dni: x.dni.map((d) => `${d.nazov}:${d.bloky.map((y) => y.skratka).join(",")}`) }));

describe("tyzdne", () => {
  test("týždenný rozvrh ostane jedna tabuľka", () => {
    const t = tyzdne(PRACOVNE, [b(0, "MAT"), b(4, "FYZ")]);
    expect(obsah(t)).toEqual([{ nazov: null, dni: ["Pondelok:MAT", "Utorok:", "Streda:", "Štvrtok:", "Piatok:FYZ"] }]);
  });

  test("cyklus 10 dní sú dva týždne s menom podľa dní", () => {
    const dni = ["P/Po", "P/Ut", "P/Str", "P/Štv", "P/Pia", "N/Po", "N/Ut", "N/Str", "N/Štv", "N/Pia"];
    const t = tyzdne(dni, [b(0, "MAT"), b(5, "ANJ"), b(9, "FYZ")]);
    expect(obsah(t)).toEqual([
      { nazov: "Párny týždeň", dni: ["Pondelok:MAT", "Utorok:", "Streda:", "Štvrtok:", "Piatok:"] },
      { nazov: "Nepárny týždeň", dni: ["Pondelok:ANJ", "Utorok:", "Streda:", "Štvrtok:", "Piatok:FYZ"] },
    ]);
  });

  test("rôzne zápisy názvov dní v cykle", () => {
    const mena = (dni: string[]) => tyzdne(dni, []).map((x) => [x.nazov, x.dni[2]!.nazov, x.dni[3]!.nazov]);
    expect(mena(["Párny Pondelok", "Párny utorok", "Párna streda", "Párny štvrtok", "Párny piatok",
      "Nepárny pondelok", "Nepárny utorok", "Nepárna streda", "Nepárny štvtok", "Nepárny piatok"]))
      .toEqual([["Párny týždeň", "Streda", "Štvrtok"], ["Nepárny týždeň", "Streda", "Štvrtok"]]);
    expect(mena(["PONDELOK -- PÁRNY", "UTOROK -- PÁRNY", "STREDA -- PÁRNY", "ŠTVRTOK-- PÁRNY", "PIATOK -- PÁRNY",
      "PONDELOK -- NEPÁRNY", "UTOROK -- NEPÁRNY", "STREDA -- NEPÁRNY", "ŠTVRTOK -- NEPÁRNY", "PIATOK -- NEPÁRNY"]))
      .toEqual([["Párny týždeň", "Streda", "Štvrtok"], ["Nepárny týždeň", "Streda", "Štvrtok"]]);
    expect(mena(["Pondelok1", "Utorok1", "Streda1", "Štvrtok1", "Piatok1", "Pondelok2", "Utorok2", "Streda2", "Štvrtok2", "Piatok2"]))
      .toEqual([["1. týždeň", "Streda", "Štvrtok"], ["2. týždeň", "Streda", "Štvrtok"]]);
    expect(mena([...PRACOVNE, ...PRACOVNE])).toEqual([["1. týždeň", "Streda", "Štvrtok"], ["2. týždeň", "Streda", "Štvrtok"]]);
    expect(mena(Array.from({ length: 10 }, (_, i) => `Deň ${i + 1}`)))
      .toEqual([["1. týždeň", "Deň 3", "Deň 4"], ["2. týždeň", "Deň 8", "Deň 9"]]);
  });

  test("hodiny označené týždňom sa rozdelia, neoznačené sú v oboch", () => {
    const t = tyzdne(PRACOVNE, [b(0, "MAT"), b(1, "ANJ", "B"), b(1, "NEJ", "A"), b(2, "FYZ", "A+C"), b(3, "CHE", "C")]);
    expect(obsah(t)).toEqual([
      { nazov: "Týždeň A", dni: ["Pondelok:MAT", "Utorok:NEJ", "Streda:FYZ", "Štvrtok:", "Piatok:"] },
      { nazov: "Týždeň B", dni: ["Pondelok:MAT", "Utorok:ANJ", "Streda:", "Štvrtok:", "Piatok:"] },
      { nazov: "Týždeň C", dni: ["Pondelok:MAT", "Utorok:", "Streda:FYZ", "Štvrtok:CHE", "Piatok:"] },
    ]);
    // V tabuľke týždňa už hodina „týždeň A“ nepíše.
    expect(t.flatMap((x) => x.dni.flatMap((d) => d.bloky)).every((x) => x.tyzden === null)).toBe(true);
  });

  test("párny týždeň je pred nepárnym, jeden označený týždeň tabuľku nedelí", () => {
    expect(tyzdne(PRACOVNE, [b(0, "MAT", "N"), b(0, "ANJ", "P")]).map((x) => x.nazov)).toEqual(["Párny týždeň", "Nepárny týždeň"]);
    const jeden = tyzdne(PRACOVNE, [b(0, "MAT"), b(1, "ANJ", "A")]);
    expect(jeden.map((x) => x.nazov)).toEqual([null]);
    expect(jeden[0]!.dni[1]!.bloky[0]!.tyzden).toBe("A");
  });

  test("názvy týždňov", () => {
    expect(["PT", "NT", "Pár", "Nep", "parny", "NEPÁR", "nepárny týždeň", "párny týzdeň"].map(menoTyzdna)).toEqual(
      ["Párny týždeň", "Nepárny týždeň", "Párny týždeň", "Nepárny týždeň", "Párny týždeň", "Nepárny týždeň", "Nepárny týždeň", "Párny týždeň"]);
    expect(["2", "1.t", "2. cyk.", "1 roz.", "2.Týždeň", "T1", "II.", "tB"].map(menoTyzdna)).toEqual(
      ["2. týždeň", "1. týždeň", "2. týždeň", "1. týždeň", "2. týždeň", "1. týždeň", "2. týždeň", "Týždeň B"]);
    expect(["A", "NP", "1.sk", "sk.A"].map(menoTyzdna)).toEqual(["Týždeň A", "Týždeň NP", "Týždeň 1.sk", "Týždeň sk.A"]);
  });
});
