import { describe, expect, test } from "bun:test";
import { platne, predvolene, stiahni, sukromnaIp, zamkni, zvonenieZTextu, zvonenieZWidgetu } from "./sonda";

const cas = (h: { od: string; do: string }[]) => h.map((x) => `${x.od}-${x.do}`);

test("ranný kruh a obedová prestávka nie sú hodiny", () => {
  const t = "Ranné kruhy 6:30 - 7:30 1. hodina 7:45 - 8:30 2. hodina 8:40 - 9:25 3. hodina 9:45 - 10:30 4. hodina 10:40 - 11:25 Obedová prestávka 11:25 - 11:55 5. hodina 11:55 - 12:40 6. hodina 12:50 - 13:35";
  const h = platne(zvonenieZTextu(t))!;
  expect(cas(h)).toEqual(["07:45-08:30", "08:40-09:25", "09:45-10:30", "10:40-11:25", "11:55-12:40", "12:50-13:35"]);
  expect(h.map((x) => x.n)).toEqual(["1", "2", "3", "4", "5", "6"]);
});

test("widget s ranným kruhom a ŠKD neodmietne celé zvonenie", () => {
  const w = (n: string, od: string, d: string) => `"name":"${n}","short":"${n}","starttime":"${od}","endtime":"${d}"`;
  const html = [w("RK", "07:55", "08:10"), w("1", "08:15", "09:00"), w("2", "09:10", "09:55"), w("3", "10:15", "11:00"), w("4", "11:10", "11:55"), w("5", "12:05", "12:50"), w("ŠKD", "16:00", "16:40")].join(",");
  expect(cas(platne(zvonenieZWidgetu(html))!)).toEqual(["08:15-09:00", "09:10-09:55", "10:15-11:00", "11:10-11:55", "12:05-12:50"]);
});

test("predvolené zvonenie EduPage aj s nultou hodinou", () => {
  const z = (od: number) => ({ n: String(od - 7), od: `${String(od).padStart(2, "0")}:00`, do: `${String(od).padStart(2, "0")}:45` });
  expect(predvolene([{ n: "0", od: "07:10", do: "07:55" }, z(8), z(9), z(10), z(11)])).toBe(true);
  expect(predvolene([{ n: "1", od: "07:10", do: "07:55" }, z(8), z(9), z(10)])).toBe(false);
});

test("zberač nečíta súbory ani adresy tohto stroja a siete Tailscale", async () => {
  for (const url of ["file:///etc/hostname", "data:text/html,1. 8:00-8:45", "http://127.0.0.1:3773/", "http://100.110.180.15/", "http://[::1]/", "http://169.254.169.254/latest/", "http://localhost/", "https://skola.sk:8443/"]) {
    const r = await stiahni(url);
    expect(r.ok, url).toBe(false);
    expect(r.text, url).toBe("");
  }
});

test("súkromné adresy aj v nezvyčajnom zápise IPv6", () => {
  for (const ip of ["0:0:0:0:0:0:0:1", "::", "64:ff9b::127.0.0.1", "198.18.0.1", "::ffff:7f00:1", "2002:7f00:1::", "fd7a:115c:a1e0::1", "FE80::1"]) expect(sukromnaIp(ip), ip).toBe(true);
  for (const ip of ["8.8.8.8", "2a01:4f8::1", "::ffff:8.8.8.8", "64:ff9b::8.8.8.8"]) expect(sukromnaIp(ip), ip).toBe(false);
});

describe("zamkni", () => {
  test("druhý beh zámok nedostane, zámok po mŕtvom procese sa prevezme", async () => {
    const { mkdtempSync, writeFileSync, existsSync, readFileSync, readdirSync } = await import("node:fs");
    const dir = mkdtempSync(`${(await import("node:os")).tmpdir()}/zamok-`);
    const cesta = `${dir}/.zber.lock`;
    zamkni(cesta);
    expect(readFileSync(cesta, "utf8")).toBe(String(process.pid));
    expect(() => zamkni(cesta)).toThrow("Zber už beží");
    expect(readdirSync(dir)).toEqual([".zber.lock"]); // pomocný súbor s PID neostal
    writeFileSync(cesta, "99999999");
    zamkni(cesta);
    expect(existsSync(cesta) && readFileSync(cesta, "utf8")).toBe(String(process.pid));
  });
});
