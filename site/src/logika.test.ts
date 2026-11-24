import { expect, test } from "bun:test";
import { kluc } from "./logika";

test("limit IPv6 platí na celú /64 aj pri skrátenom zápise", () => {
  expect(kluc("2001:db8::1")).toBe(kluc("2001:db8::65"));
  expect(kluc("2001:db8::1")).toBe(kluc("2001:0db8:0:0:ffff:1:2:3"));
  expect(kluc("2a02:ab8:1234:5678::9")).not.toBe(kluc("2a02:ab8:1234:5679::9"));
  expect(kluc("::1")).toBe("0:0:0:0::/64");
  expect(kluc("203.0.113.7")).toBe("203.0.113.7");
});
