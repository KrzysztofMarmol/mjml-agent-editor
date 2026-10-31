import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { ALLOWED_ATTRIBUTES, illegalAttributes } from "./mjml-attributes.js";

// mjml-core is mjml's dependency, not ours; resolve it from where mjml finds it.
const require = createRequire(createRequire(import.meta.url).resolve("mjml"));
require("mjml");
const { components } = require("mjml-core") as {
  components: Record<string, { allowedAttributes?: Record<string, string> }>;
};

describe("ALLOWED_ATTRIBUTES", () => {
  it.each(Object.keys(ALLOWED_ATTRIBUTES))("matches the installed mjml for %s", (tag) => {
    const installed = Object.keys(components[tag]?.allowedAttributes ?? {}).sort();
    expect([...ALLOWED_ATTRIBUTES[tag]!].sort()).toEqual(installed);
  });
});

describe("illegalAttributes", () => {
  it("names what the sidebar used to write and MJML rejects", () => {
    expect(
      illegalAttributes("mj-section", {
        "css-class": "sec-a1",
        padding: "20px 0",
        title: "Hello",
        display: "none",
      }),
    ).toEqual(["title", "display"]);
  });

  it("keeps the ids, mj-class and what GrapesJS keeps but never serialises", () => {
    expect(
      illegalAttributes("mj-text", { "css-class": "obj-x", "mj-class": "a", id: "i1", style: "" }),
    ).toEqual([]);
  });

  it("leaves tags it has no table for alone", () => {
    expect(illegalAttributes("mj-raw", { anything: "x" })).toEqual([]);
  });
});
