import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import {
  ALLOWED_ATTRIBUTES,
  illegalAttributes,
  NAMED_COLORS,
  withoutEditorProps,
} from "./mjml-attributes.js";

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

describe("NAMED_COLORS", () => {
  it("matches the installed mjml", () => {
    const helper = require("mjml-core/lib/types/helpers/colors") as
      string[] | { default: string[] };
    const installed = Array.isArray(helper) ? helper : helper.default;
    expect([...NAMED_COLORS].sort()).toEqual([...installed].sort());
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

describe("withoutEditorProps", () => {
  it("leaves text and attribute values that only mention one", () => {
    const source = `<mj-text css-class="a"><p title='x > data-gjs-name="y"'>Use data-gjs-name="z" here</p></mj-text><mj-image alt="data-gjs-icon docs" src="https://a.com/x.png"></mj-image>`;
    expect(withoutEditorProps(source)).toBe(source);
  });

  it("drops GrapesJS's property attributes in every quoting, and nothing else", () => {
    expect(
      withoutEditorProps(
        `<mj-text data-gjs-icon="<img src=x onerror=alert(1)>" css-class="obj-a"><p data-gjs-custom-name='x' DATA-GJS-name=y>data-gjs-x stays</p></mj-text>`,
      ),
    ).toBe('<mj-text css-class="obj-a"><p>data-gjs-x stays</p></mj-text>');
  });
});
