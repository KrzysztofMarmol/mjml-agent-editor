import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { addedItems, describeItems, isSafeLink, unsafeMarkup } from "./links.js";

// Shared with the Python backend's tests, so both refuse exactly the same writes.
const CASES = JSON.parse(
  readFileSync(new URL("../contract/unsafe-markup-cases.json", import.meta.url), "utf8"),
) as { name: string; html: string; expected: string[] }[];

describe("isSafeLink", () => {
  it("takes web, mail and phone links, relative ones and merge tags", () => {
    for (const link of [
      "https://a.com",
      "mailto:a@b.c",
      "tel:+48123",
      "/x",
      "{{url}}",
      "#top",
      "",
    ]) {
      expect(isSafeLink(link), link).toBe(true);
    }
  });

  it("refuses a script however a browser would still read it as one", () => {
    for (const link of [
      "javascript:alert(1)",
      " java\tscript:x",
      "&#106;avascript:x",
      "vbscript:x",
    ]) {
      expect(isSafeLink(link), link).toBe(false);
    }
  });
});

describe("unsafeMarkup", () => {
  it.each(CASES)("$name", ({ html, expected }) => {
    expect(unsafeMarkup(html)).toEqual(expected);
  });

  it("reads a large document in linear time", () => {
    const html = '<a href=x "'.repeat(25_000) + "<mj-navbar".repeat(25_000);
    const start = performance.now();
    unsafeMarkup(html);
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe("addedItems", () => {
  it("counts what the write adds, not what was there", () => {
    expect(addedItems(["a", "b", "a"], ["a"])).toEqual(["b", "a"]);
    expect(addedItems(["a"], ["a", "a"])).toEqual([]);
  });
});

describe("describeItems", () => {
  it("names each item once, at most five, cut short", () => {
    const items = ["x".repeat(100), ...Array.from({ length: 8 }, (_, i) => `l${i % 6}`)];
    expect(describeItems(items)).toBe(`"${"x".repeat(60)}…", "l0", "l1", "l2", "l3" and 2 more`);
  });
});
