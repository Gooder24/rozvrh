import { expect, test } from "bun:test";
import { porovnaj } from "./zmeny";
import type { Blok } from "../typy";

const b = (den: number, hodina: string, skratka: string, ucebna: string | null = null, skupina: string | null = null): Blok =>
  ({ den, hodina, trvanie: 1, predmet: skratka, skratka, ucebna, skupina, tyzden: null });

test("rovnaký rozvrh nemá zmeny, aj keď sú bloky v inom poradí", () => {
  const r = porovnaj([b(0, "1", "MAT"), b(0, "2", "SJL")], [b(0, "2", "SJL"), b(0, "1", "MAT")]);
  expect(r.pocet).toBe(0);
});

test("iný predmet, iná učebňa a nová hodina sú zmeny; prázdne miesto je zrušená hodina", () => {
  const stare = [b(0, "1", "MAT", "1.01"), b(0, "2", "SJL"), b(1, "3", "FYZ")];
  const nove = [b(0, "1", "MAT", "2.04"), b(0, "2", "ANJ"), b(2, "1", "CHE")];
  const r = porovnaj(nove, stare);
  expect([...r.zmenene].sort()).toEqual(["0|1|1|", "0|2|1|", "2|1|1|"]);
  expect(r.zrusene.map((x) => x.skratka)).toEqual(["FYZ"]);
  expect(r.pocet).toBe(4);
});

test("skupiny v jednej hodine: zmena jednej skupiny je jedna zmena miesta", () => {
  const stare = [b(0, "1", "ANJ", null, "1. skupina"), b(0, "1", "NEJ", null, "2. skupina")];
  const nove = [b(0, "1", "ANJ", null, "1. skupina"), b(0, "1", "FRJ", null, "2. skupina")];
  expect(porovnaj(nove, stare).pocet).toBe(1);
});
