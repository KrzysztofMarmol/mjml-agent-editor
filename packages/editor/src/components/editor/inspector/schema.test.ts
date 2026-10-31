import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { DEFAULT_LABELS } from "../../../labels.js";
import { mjmlColor } from "../ColorField.js";
import { ALLOWED_ATTRIBUTES } from "../mjml-attributes.js";
import { normaliseLength } from "./controls.js";
import { SCHEMA } from "./schema.js";
import type { Field, Option } from "./types.js";

const require = createRequire(import.meta.url);
const mjml = require("mjml") as (
  xml: string,
  options: { validationLevel: "strict" },
) => { errors: unknown[] };
// mjml-core is mjml's dependency, not ours; resolve it from where mjml finds it.
const { components } = createRequire(require.resolve("mjml"))("mjml-core") as {
  components: Record<string, { defaultAttributes?: Record<string, string | null> }>;
};

const LABELS = DEFAULT_LABELS.inspectorLabels;
const FIELDS = Object.entries(SCHEMA).flatMap(([tag, fields]) =>
  fields.map((field) => [tag, field.attr, field] as const),
);

function field(tag: string, attr: string): Field {
  return SCHEMA[tag]!.find((f) => f.attr === attr)!;
}

const LINK = "https://example.com/page";
const IMAGE = "https://example.com/a.png";
const TEXT = "<mj-text>x</mj-text>";
const body = (inner: string) => `<mjml><mj-body>${inner}</mj-body></mjml>`;
const column = (inner: string) => body(`<mj-section><mj-column>${inner}</mj-column></mj-section>`);

/** The smallest valid document around each tag, with what it needs to render. */
const CONTEXTS: Record<
  string,
  { base?: Record<string, string>; inner: string; outer: (element: string) => string }
> = {
  "mj-body": {
    inner: `<mj-section><mj-column>${TEXT}</mj-column></mj-section>`,
    outer: (e) => `<mjml>${e}</mjml>`,
  },
  "mj-wrapper": { inner: `<mj-section><mj-column>${TEXT}</mj-column></mj-section>`, outer: body },
  "mj-section": { inner: `<mj-column>${TEXT}</mj-column>`, outer: body },
  "mj-column": { inner: TEXT, outer: (e) => body(`<mj-section>${e}</mj-section>`) },
  "mj-text": { inner: "x", outer: column },
  "mj-button": { base: { href: LINK }, inner: "x", outer: column },
  "mj-image": { base: { src: IMAGE }, inner: "", outer: column },
  "mj-divider": { inner: "", outer: column },
  "mj-spacer": { inner: "", outer: column },
  "mj-social": {
    inner: `<mj-social-element name="facebook-noshare" href="${LINK}">x</mj-social-element>`,
    outer: column,
  },
  "mj-social-element": {
    base: { name: "facebook", href: LINK },
    inner: "x",
    outer: (e) => column(`<mj-social>${e}</mj-social>`),
  },
  "mj-hero": { inner: TEXT, outer: body },
  "mj-navbar": { inner: `<mj-navbar-link href="${LINK}">A</mj-navbar-link>`, outer: column },
  "mj-navbar-link": {
    base: { href: LINK },
    inner: "A",
    outer: (e) => column(`<mj-navbar>${e}</mj-navbar>`),
  },
};

/** What a strict compile reports for `tag` with `attributes`; empty when it is valid. */
function strictErrors(tag: string, attributes: Record<string, string>): string[] {
  const context = CONTEXTS[tag]!;
  const attrs = Object.entries({ ...context.base, ...attributes })
    .map(([name, value]) => ` ${name}="${value}"`)
    .join("");
  try {
    mjml(context.outer(`<${tag}${attrs}>${context.inner}</${tag}>`), {
      validationLevel: "strict",
    });
    return [];
  } catch (error) {
    const errors = (error as { errors?: { formattedMessage: string }[] }).errors;
    return errors?.map((e) => e.formattedMessage) ?? [String(error)];
  }
}

/** Every value the field's control can write. */
function samples({ control, default: fallback }: Field): string[] {
  const values = ((): string[] => {
    switch (control.type) {
      case "text":
        return [control.placeholder ?? "Sample"];
      case "link":
        return [LINK];
      case "color":
        // What the field makes of typed text, the pickers and the swatches.
        return [
          "#1a2b3c",
          "#ABC",
          "#00000080",
          "rgba(0, 0, 0, .5)",
          "rgb(1 2 3)",
          "Red",
          "transparent",
        ].map((c) => mjmlColor(c)!);
      case "image":
        return [IMAGE];
      case "length":
        return control.units.flatMap((u) => [`12${u}`, ...(control.negative ? [`-2${u}`] : [])]);
      case "box":
        return control.units.flatMap((u) => [
          `1${u}`,
          `1${u} 2${u}`,
          `1${u} 2${u} 3${u}`,
          `1${u} 2${u} 3${u} 4${u}`,
        ]);
      case "segmented":
      case "select":
        return control.options.map((o) => o.value);
      case "toggle":
        return [control.on];
      case "network":
        return control.networks.flatMap((n) => [n.value, `${n.value}-noshare`]);
    }
  })();
  return fallback === undefined ? values : [...values, fallback];
}

describe("what the controls make of typed values", () => {
  it("refuses a colour MJML rejects rather than writing it", () => {
    for (const text of ["blah", "#12", "hsl(0 0% 0%)", "url(x)"])
      expect(mjmlColor(text)).toBeNull();
    expect(mjmlColor("")).toBe("");
  });

  it("refuses a negative length where MJML's unit type does", () => {
    expect(normaliseLength("-5", ["px"])).toBeNull();
    expect(normaliseLength("-1px", ["px", "%"])).toBeNull();
    expect(normaliseLength("-1", ["px"], true)).toBe("-1px");
    expect(normaliseLength("24", ["px"])).toBe("24px");
  });
});

describe("SCHEMA", () => {
  it("has a compile context for every tag", () => {
    expect(Object.keys(CONTEXTS).sort()).toEqual(Object.keys(SCHEMA).sort());
  });

  it("is checked by a compile that rejects what MJML rejects", () => {
    expect(strictErrors("mj-button", { align: "justify" })).not.toEqual([]);
    expect(strictErrors("mj-section", { title: "x" })).not.toEqual([]);
    expect(strictErrors("mj-text", { "font-size": "1em" })).not.toEqual([]);
  });

  it.each(Object.entries(SCHEMA))("edits each attribute of %s once", (_tag, fields) => {
    const attrs = fields.map((f) => f.attr);
    expect(attrs).toEqual([...new Set(attrs)]);
  });

  it.each(FIELDS)("%s %s compiles strictly with every value it writes", (tag, _attr, f) => {
    expect(ALLOWED_ATTRIBUTES[tag]).toContain(f.attr);
    expect(["id", "css-class", "mj-class"]).not.toContain(f.attr);
    for (const value of samples(f)) {
      expect(strictErrors(tag, { [f.attr]: value }), `${f.attr}="${value}"`).toEqual([]);
    }
  });

  it.each(FIELDS)("%s %s declares MJML's own default", (tag, _attr, f) => {
    const mjmlDefault = components[tag]?.defaultAttributes?.[f.attr];
    // A toggle's default is its absence; an empty default (image alt) says nothing.
    const expected = f.control.type === "toggle" || !mjmlDefault ? undefined : mjmlDefault;
    expect(f.default).toBe(expected);
    if (f.default !== undefined && "options" in f.control) {
      expect(f.control.options.map((o) => o.value)).toContain(f.default);
    }
  });
});

describe("inspector labels", () => {
  // Font and brand names are the same in every language, so they are the label itself.
  const isLiteral = (f: Field) => f.attr === "font-family";
  const optionsOf = (f: Field): readonly Option[] =>
    "options" in f.control
      ? f.control.options
      : f.control.type === "network"
        ? f.control.networks.filter((n) => /^network[A-Z]/.test(n.label))
        : [];

  it.each(FIELDS)("%s %s has its field and option names", (_tag, _attr, f) => {
    expect(LABELS).toHaveProperty([f.label]);
    if (isLiteral(f)) return;
    for (const option of optionsOf(f)) expect(LABELS).toHaveProperty([option.label]);
  });

  it("holds no key the schema does not use", () => {
    const used = new Set(
      FIELDS.flatMap(([, , f]) => [f.label, ...optionsOf(f).map((o) => o.label)]),
    );
    const unused = Object.keys(LABELS).filter((key) => !used.has(key.replace(/\.help$/, "")));
    expect(unused).toEqual([]);
  });
});

describe("when", () => {
  it("shows the hero height only in fixed-height mode", () => {
    const height = field("mj-hero", "height");
    expect(height.when?.({})).toBe(true);
    expect(height.when?.({ mode: "fixed-height" })).toBe(true);
    expect(height.when?.({ mode: "fluid-height" })).toBe(false);
  });

  it("shows how a section background image is laid out only once there is one", () => {
    for (const attr of ["background-size", "background-repeat", "background-position"]) {
      expect(field("mj-section", attr).when?.({})).toBe(false);
      expect(field("mj-section", attr).when?.({ "background-url": IMAGE })).toBe(true);
    }
  });
});
