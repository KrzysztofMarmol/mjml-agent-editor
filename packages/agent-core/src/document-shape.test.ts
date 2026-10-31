import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { NotMjmlDocumentError, isMjmlDocument } from "./document-shape.js";
import { STARTER_MJML } from "./starter.js";

// Shared with the Python backend's tests, so both refuse exactly the same writes.
const CASES = JSON.parse(
  readFileSync(new URL("../contract/document-shape-cases.json", import.meta.url), "utf8"),
) as { name: string; mjml: string; expected: boolean }[];

describe("isMjmlDocument", () => {
  it("accepts the starter", () => {
    expect(isMjmlDocument(STARTER_MJML)).toBe(true);
  });

  it.each(CASES)("$name: $expected", ({ mjml, expected }) => {
    expect(isMjmlDocument(mjml)).toBe(expected);
  });
});

describe("NotMjmlDocumentError", () => {
  // Without a 4xx status the editor shows "Failed to save changes." instead of the reason.
  it("carries a status the editor shows the message for", () => {
    expect(new NotMjmlDocumentError()).toMatchObject({ status: 422 });
  });
});
