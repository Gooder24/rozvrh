import { expect, test } from "bun:test";
import { varianty, vObci } from "./geokoduj";

test("varianty adresy: celé číslo, potom jeho časti; mestská časť ako „časť, mesto“", () => {
  expect(varianty("Ul. Lipová 1234/5", "Horná Ves")).toEqual(["Lipová 1234/5, Horná Ves", "Lipová 5, Horná Ves", "Lipová 1234, Horná Ves"]);
  expect(varianty("Školská 7", "Bratislava-Dolné Pole")).toEqual(["Školská 7, Dolné Pole, Bratislava"]);
  expect(varianty("Horná Ves 468", "Horná Ves")).toEqual(["468, Horná Ves"]);
});

test("výsledok v inej obci sa neberie", () => {
  expect(vObci({ town: "Horná Ves", road: "Lipová" }, "Horná Ves")).toBe(true);
  expect(vObci({ town: "Dolná Ves", road: "Lipová" }, "Horná Ves")).toBe(false);
  expect(vObci({ city: "Bratislava", suburb: "Dolné Pole" }, "Bratislava-Dolné Pole")).toBe(true);
  expect(vObci({ village: "Nová  Lehota - Kút" }, "Nová Lehota-Kút")).toBe(true);
  expect(vObci({ administrative: "Horná Ves", district: "okres Dolná Ves" }, "Horná Ves")).toBe(true);
  expect(vObci(undefined, "Horná Ves")).toBe(false);
});
