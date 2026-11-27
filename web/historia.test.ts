import { expect, test } from "bun:test";
import { koniecZTextu } from "./historia";

test("koniec platnosti verzie z textu EduPage", () => {
  expect(koniecZTextu("1_9_25 (02. 09. - 10. 09. 2025)")).toBe("2025-09-10");
  expect(koniecZTextu("2018/2019 (03. 09. 2018 - 28. 06. 2019)")).toBe("2019-06-28");
  expect(koniecZTextu("2021/2022 od 11.10 (11. 10. 2021-?)")).toBeNull();
  expect(koniecZTextu("Rozvrh 2012/2013")).toBeNull();
});
