import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// GrapesJS does not start in jsdom, so the options are checked where they are written.
const source = readFileSync(new URL("./EmailEditor.tsx", import.meta.url), "utf8");

describe("GrapesJS options", () => {
  it("leave the visitor's browser no request to a third party", () => {
    expect(source).toMatch(/^\s*telemetry: false,$/m);
    expect(source).toMatch(/^\s*cssIcons: "",$/m);
  });
});
