import { describe, expect, it } from "vitest";

import {
  MjmlDocumentError,
  ensureSectionIds,
  getSection,
  insertSection,
  listSections,
  removeSection,
  replaceSection,
  scanSections,
} from "./mjml-document.js";

const DOC = `<mjml>
  <mj-body>
    <mj-section css-class="sec-aaa" background-color="#ffffff">
      <mj-column><mj-text>Welcome aboard</mj-text></mj-column>
    </mj-section>
    <mj-section css-class='hero sec-bbb'>
      <mj-column><mj-button>Buy now</mj-button></mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

/** Deterministic id generator for assertions. */
function sequence(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `overflow-${index}`;
}

describe("scanSections", () => {
  it("finds every section and reads ids from both quote styles", () => {
    const spans = scanSections(DOC);
    expect(spans.map((span) => span.id)).toEqual(["aaa", "bbb"]);
  });

  it("reports a null id for a section without one", () => {
    const spans = scanSections(
      `<mjml><mj-body><mj-section><mj-column /></mj-section></mj-body></mjml>`,
    );
    expect(spans).toHaveLength(1);
    expect(spans[0]!.id).toBeNull();
  });

  it("does not end the opening tag at a `>` inside an attribute value", () => {
    const mjml = `<mjml><mj-body><mj-section css-class="sec-aaa"><mj-column><mj-image alt="Save > 50%" src="x.png" /></mj-column></mj-section></mj-body></mjml>`;
    const spans = scanSections(mjml);
    expect(spans).toHaveLength(1);
    expect(mjml.slice(spans[0]!.start, spans[0]!.end)).toContain("</mj-section>");
    // The stray `50%" src=...` would leak into the preview under naive `<[^>]+>` stripping.
    expect(listSections(mjml)[0]!.preview).toBe("");
  });

  it("folds a nested section into its parent instead of producing overlapping spans", () => {
    const mjml = `<mjml><mj-body><mj-section css-class="sec-outer"><mj-section css-class="sec-inner"></mj-section></mj-section></mj-body></mjml>`;
    const spans = scanSections(mjml);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.id).toBe("outer");
    expect(getSection(mjml, "outer")).toContain("sec-inner");
  });

  it("does not treat a longer tag name as a section", () => {
    expect(scanSections(`<mj-sectionx css-class="sec-aaa"></mj-sectionx>`)).toHaveLength(0);
  });

  it("ignores an unterminated section rather than throwing", () => {
    expect(scanSections(`<mjml><mj-body><mj-section css-class="sec-aaa">`)).toHaveLength(0);
  });
});

describe("listSections", () => {
  it("summarises id and text excerpt", () => {
    expect(listSections(DOC)).toEqual([
      { sectionId: "aaa", preview: "Welcome aboard" },
      { sectionId: "bbb", preview: "Buy now" },
    ]);
  });

  it("truncates the preview to 120 characters", () => {
    const long = "x".repeat(500);
    const mjml = `<mjml><mj-body><mj-section css-class="sec-aaa"><mj-column><mj-text>${long}</mj-text></mj-column></mj-section></mj-body></mjml>`;
    expect(listSections(mjml)[0]!.preview).toHaveLength(120);
  });
});

describe("ensureSectionIds", () => {
  it("assigns ids only to sections that lack them", () => {
    const mjml = `<mjml><mj-body><mj-section css-class="sec-keep"></mj-section><mj-section></mj-section></mj-body></mjml>`;
    const result = ensureSectionIds(mjml, sequence("new1"));
    expect(result).toContain(`css-class="sec-keep"`);
    expect(result).toContain(`css-class="sec-new1"`);
    expect(scanSections(result).map((span) => span.id)).toEqual(["keep", "new1"]);
  });

  it("appends to an existing class list without clobbering it", () => {
    const mjml = `<mjml><mj-body><mj-section css-class="hero dark"></mj-section></mj-body></mjml>`;
    expect(ensureSectionIds(mjml, sequence("new1"))).toContain(`css-class="hero dark sec-new1"`);
  });

  it("does not emit a leading space when the section had no class list", () => {
    const mjml = `<mjml><mj-body><mj-section></mj-section></mj-body></mjml>`;
    const result = ensureSectionIds(mjml, sequence("new1"));
    expect(result).toContain(`css-class="sec-new1"`);
    expect(result).not.toContain(`css-class=" sec-new1"`);
  });

  it("preserves other attributes on the opening tag", () => {
    const mjml = `<mjml><mj-body><mj-section background-color="#fff" padding="8px"></mj-section></mj-body></mjml>`;
    const result = ensureSectionIds(mjml, sequence("new1"));
    expect(result).toContain(`background-color="#fff"`);
    expect(result).toContain(`padding="8px"`);
  });

  it("is a no-op when every section is already identified", () => {
    expect(ensureSectionIds(DOC, sequence("unused"))).toBe(DOC);
  });
});

describe("getSection", () => {
  it("returns the whole element", () => {
    const section = getSection(DOC, "bbb");
    expect(section).toMatch(/^<mj-section/);
    expect(section).toMatch(/<\/mj-section>$/);
    expect(section).toContain("Buy now");
  });

  it("returns null for an unknown id", () => {
    expect(getSection(DOC, "nope")).toBeNull();
  });
});

describe("replaceSection", () => {
  it("keeps the target id when the replacement carries a different one", () => {
    const result = replaceSection(
      DOC,
      "aaa",
      `<mj-section css-class="sec-wrong"><mj-column /></mj-section>`,
    );
    expect(result).not.toBeNull();
    expect(result).toContain(`css-class="sec-aaa"`);
    expect(result).not.toContain("sec-wrong");
    expect(scanSections(result!).map((span) => span.id)).toEqual(["aaa", "bbb"]);
  });

  it("adds the target id when the replacement carries none", () => {
    const result = replaceSection(
      DOC,
      "aaa",
      `<mj-section background-color="#000"><mj-column /></mj-section>`,
    );
    expect(result).toContain(`css-class="sec-aaa"`);
    expect(result).toContain(`background-color="#000"`);
  });

  it("preserves unrelated classes on the replacement", () => {
    const result = replaceSection(
      DOC,
      "aaa",
      `<mj-section css-class="promo"><mj-column /></mj-section>`,
    );
    expect(result).toContain(`css-class="promo sec-aaa"`);
  });

  it("leaves sibling sections untouched", () => {
    const result = replaceSection(DOC, "aaa", `<mj-section><mj-column /></mj-section>`);
    expect(result).toContain("Buy now");
  });

  it("returns null for an unknown id", () => {
    expect(replaceSection(DOC, "nope", `<mj-section><mj-column /></mj-section>`)).toBeNull();
  });

  it("rejects a fragment that is not a section", () => {
    expect(() => replaceSection(DOC, "aaa", `<mj-column />`)).toThrow(MjmlDocumentError);
  });

  it("rejects two concatenated sections", () => {
    const two = `<mj-section><mj-column /></mj-section><mj-section><mj-column /></mj-section>`;
    expect(() => replaceSection(DOC, "aaa", two)).toThrow(MjmlDocumentError);
  });
});

describe("insertSection", () => {
  const NEW = `<mj-section css-class="promo"><mj-column /></mj-section>`;

  it("inserts after the anchor section", () => {
    const { mjml, sectionId } = insertSection(DOC, NEW, "aaa", sequence("new1"));
    expect(sectionId).toBe("new1");
    expect(scanSections(mjml).map((span) => span.id)).toEqual(["aaa", "new1", "bbb"]);
  });

  it("appends before </mj-body> when no anchor is given", () => {
    const { mjml } = insertSection(DOC, NEW, null, sequence("new1"));
    expect(scanSections(mjml).map((span) => span.id)).toEqual(["aaa", "bbb", "new1"]);
  });

  it("falls back to the end of the body when the anchor is unknown", () => {
    const { mjml } = insertSection(DOC, NEW, "nope", sequence("new1"));
    expect(scanSections(mjml).map((span) => span.id)).toEqual(["aaa", "bbb", "new1"]);
  });

  it("keeps an id the caller already supplied", () => {
    const withId = `<mj-section css-class="sec-mine"><mj-column /></mj-section>`;
    const { sectionId, mjml } = insertSection(DOC, withId, null, sequence("unused"));
    expect(sectionId).toBe("mine");
    expect(scanSections(mjml).map((span) => span.id)).toEqual(["aaa", "bbb", "mine"]);
  });

  it("throws when the document has no </mj-body>", () => {
    expect(() => insertSection(`<mjml></mjml>`, NEW, null, sequence("new1"))).toThrow(
      MjmlDocumentError,
    );
  });

  it("rejects a fragment that is not a section", () => {
    expect(() => insertSection(DOC, `<mj-column />`, null)).toThrow(MjmlDocumentError);
  });
});

describe("removeSection", () => {
  it("removes only the addressed section", () => {
    const result = removeSection(DOC, "aaa");
    expect(result).not.toBeNull();
    expect(scanSections(result!).map((span) => span.id)).toEqual(["bbb"]);
    expect(result).not.toContain("Welcome aboard");
  });

  it("returns null for an unknown id", () => {
    expect(removeSection(DOC, "nope")).toBeNull();
  });
});

describe("round trips", () => {
  it("survives insert → replace → remove", () => {
    const inserted = insertSection(
      DOC,
      `<mj-section><mj-column /></mj-section>`,
      "aaa",
      sequence("mid"),
    );
    const replaced = replaceSection(
      inserted.mjml,
      "mid",
      `<mj-section css-class="promo"><mj-column><mj-text>Mid</mj-text></mj-column></mj-section>`,
    );
    expect(replaced).toContain("Mid");
    const removed = removeSection(replaced!, "mid");
    expect(scanSections(removed!).map((span) => span.id)).toEqual(["aaa", "bbb"]);
  });
});
