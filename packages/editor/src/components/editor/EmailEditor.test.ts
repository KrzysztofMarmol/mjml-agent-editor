import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// GrapesJS does not start in jsdom, so the options are checked where they are written.
const source = readFileSync(new URL("./EmailEditor.tsx", import.meta.url), "utf8");

describe("GrapesJS options", () => {
  it("send nothing to app.grapesjs.com or cdnjs.cloudflare.com", () => {
    expect(source).toMatch(/^\s*telemetry: false,$/m);
    expect(source).toMatch(/^\s*cssIcons: "",$/m);
  });
});
