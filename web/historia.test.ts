import { expect, test } from "bun:test";
import { koniecZTextu } from "./historia";

test("koniec platnosti verzie z textu EduPage", () => {
  expect(koniecZTextu("1_9_25 (02. 09. - 10. 09. 2025)")).toBe("2025-09-10");
  expect(koniecZTextu("2018/2019 (03. 09. 2018 - 28. 06. 2019)")).toBe("2019-06-28");
  expect(koniecZTextu("2021/2022 od 11.10 (11. 10. 2021-?)")).toBeNull();
  expect(koniecZTextu("Rozvrh 2012/2013")).toBeNull();
});

test("bezMien čistí aj názvy dní, hodín a týždňov (vymyslené mená)", async () => {
  const { bezMien } = await import("./data");
  const blok: import("./typy").Blok = { den: 0, hodina: "Ing. Hraško", trvanie: 1, predmet: "MAT", skratka: "MAT", ucebna: null, skupina: null, tyzden: "Mgr. Vzorná" };
  const s: import("./typy").Skola = {
    id: "1", slug: "x", nazov: "Gymnázium", stupen: "SŠ", typ: "", druh: "Gymnázium", kraj: "", okres: "", miesto: "", ulica: "", mestoSlug: "",
    zriadovatel: "", ziaci: 0, stav: "verejny_rozvrh", edupage: null, zaciatok: null, koniec: null, pocetHodin: null, psc: "", web: null,
    zvonenie: { hodiny: [{ n: "Ing. Hraško", od: "08:00", do: "08:45" }, { n: "2", od: "08:55", do: "09:40" }], zdroj: "EduPage", url: "", predvolene: false },
    rozvrh: { nazov: null, od: null, dni: ["Pondelok", "Mgr. Jana Vzorná", "JH", "Štvrtok PT"], triedy: 1, ucebne: 0, lekcie: 0, karty: 0, dvojhodiny: 0 },
    triedy: [{ nazov: "I.A", bloky: [blok, { ...blok, tyzden: "A" }] }], skontrolovane: "",
  };
  bezMien(s, { ucitelia: new Set(["jh", "pt"]), vyskyt: new Map(), nazvy: new Map() });
  expect(s.rozvrh?.dni).toEqual(["Pondelok", "Deň 2", "Deň 3", "Štvrtok PT"]);
  expect(s.triedy[0]!.bloky.map((b) => b.hodina)).toEqual(["1", "1"]);
  expect(s.zvonenie?.hodiny.map((h) => h.n)).toEqual(["1", "2"]);
  expect(s.triedy[0]!.bloky.map((b) => b.tyzden)).toEqual([null, "A"]);
});
