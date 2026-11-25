import { expect, test } from "bun:test";
import { SIRKA, VYSKA, hranice } from "./letecky";

test("výrez má bod v strede a v teréne rovnaký pomer strán ako obrázok", () => {
  const [z, j, v, s] = hranice(19.5, 48.7);
  expect((z + v) / 2).toBeCloseTo(19.5, 9);
  expect((j + s) / 2).toBeCloseTo(48.7, 9);
  const sirkaM = (v - z) * 111_320 * Math.cos((48.7 * Math.PI) / 180), vyskaM = (s - j) * 110_574;
  expect(sirkaM).toBeCloseTo(200, 6);
  expect(sirkaM / vyskaM).toBeCloseTo(SIRKA / VYSKA, 6);
});
