import { expect, test } from "bun:test";
import { cezDen } from "./historia";

test("zber beží len od 7:00 do 21:00", () => {
  const o = (h: number, m = 0) => cezDen(new Date(2026, 10, 25, h, m));
  expect([o(6, 59), o(7), o(12), o(20, 59), o(21), o(23)]).toEqual([false, true, true, true, false, false]);
});
