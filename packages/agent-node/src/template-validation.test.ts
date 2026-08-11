import { describe, expect, it } from "vitest";

import {
  validateTemplateCatalogWithCompiler,
  validateTemplateMjmlWithCompiler,
} from "./template-validation.js";

const VALID = `<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text>Hello</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

describe("template validation with the Node MJML compiler", () => {
  it("accepts a valid editable template", async () => {
    await expect(validateTemplateMjmlWithCompiler(VALID)).resolves.toEqual({
      ok: true,
      issues: [],
    });
  });

  it("reports compiler errors", async () => {
    const result = await validateTemplateMjmlWithCompiler(
      `<mjml><mj-body><mj-bogus /></mj-body></mjml>`,
    );
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "invalid-mjml" }));
  });

  it("reports package-level template invariants", async () => {
    const result = await validateTemplateMjmlWithCompiler(
      `<mjml><mj-body><mj-hero><mj-text>Hero</mj-text></mj-hero></mj-body></mjml>`,
      { validationLevel: "skip" },
    );
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "banned-tag" }));
  });

  it("validates a catalog", async () => {
    await expect(
      validateTemplateCatalogWithCompiler([
        {
          id: "welcome",
          name: "Welcome",
          category: "Onboarding",
          blurb: "A short hello.",
          mjml: VALID,
        },
      ]),
    ).resolves.toEqual({ ok: true, issues: [] });
  });
});
