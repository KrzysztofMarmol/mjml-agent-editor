import { describe, expect, it } from "vitest";

import {
  findTemplate,
  isTemplateId,
  starterBody,
  templateBodies,
  validateTemplateCatalog,
  validateTemplateMjml,
  type EmailTemplate,
} from "./templates.js";
import { STARTER_MJML } from "./starter.js";

const VALID = `<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text>Hello</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

const CATALOG = [
  {
    id: "blank",
    name: "Blank",
    category: "Starter",
    blurb: "Start empty.",
    mjml: STARTER_MJML,
  },
  {
    id: "newsletter",
    name: "Newsletter",
    category: "Recurring",
    blurb: "A small update.",
    mjml: VALID,
  },
] as const satisfies readonly EmailTemplate[];

describe("template catalog helpers", () => {
  it("narrows ids against a catalog", () => {
    const value: unknown = "newsletter";
    expect(isTemplateId(CATALOG, value)).toBe(true);
    expect(isTemplateId(CATALOG, "missing")).toBe(false);
  });

  it("finds bodies and falls back to STARTER_MJML", () => {
    expect(findTemplate(CATALOG, "newsletter")?.name).toBe("Newsletter");
    expect(starterBody(CATALOG, "newsletter")).toBe(VALID);
    expect(starterBody(CATALOG)).toBe(STARTER_MJML);
  });

  it("returns a body map keyed by template id", () => {
    expect(templateBodies(CATALOG)).toMatchObject({
      blank: STARTER_MJML,
      newsletter: VALID,
    });
  });
});

describe("template validation", () => {
  it("accepts flat section templates", async () => {
    await expect(validateTemplateMjml(VALID)).resolves.toEqual({ ok: true, issues: [] });
  });

  it.each(["mj-hero", "mj-wrapper", "mj-table", "mj-head"])("rejects <%s>", async (tag) => {
    const result = await validateTemplateMjml(`<mjml><mj-body><${tag}></${tag}></mj-body></mjml>`);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "banned-tag", message: expect.stringContaining(tag) }),
    );
  });

  it("rejects handwritten section and object ids", async () => {
    const result = await validateTemplateMjml(
      `<mjml><mj-body><mj-section css-class="hero sec-ab12cd34"><mj-column><mj-text css-class="obj-ff00aa11">Hi</mj-text></mj-column></mj-section></mj-body></mjml>`,
    );
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "handwritten-id" }));
  });

  it("rejects malformed section structure that the scanner cannot fully see", async () => {
    const result = await validateTemplateMjml(`<mjml><mj-body><mj-section></mj-body></mjml>`);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "section-scan-mismatch" }),
    );
  });

  it("runs compiler validation when supplied", async () => {
    const result = await validateTemplateMjml("not mjml", {
      compiler: { compile: () => ({ ok: false, errors: "bad document" }) },
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "invalid-mjml" }));
  });

  it("rejects duplicate ids in a catalog", async () => {
    const result = await validateTemplateCatalog([CATALOG[0], CATALOG[0]]);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "duplicate-id" }));
  });
});
