import { describe, expect, it } from "vitest";

import { ensureSectionIds, listSections } from "./mjml-document.js";
import { STARTER_MJML } from "./starter.js";

/**
 * The starter document is the first MJML the agent ever sees, and nothing else asserts it
 * is well formed. A typo here does not fail a build — it fails at the moment a user creates
 * their first document.
 */
describe("STARTER_MJML", () => {
  it("is a document the addressing layer can work with", () => {
    const sections = listSections(ensureSectionIds(STARTER_MJML));

    expect(sections).toHaveLength(1);
    expect(sections[0]?.sectionId).toEqual(expect.any(String));
    expect(sections[0]?.preview).toContain("New email");
  });

  it("lives in this package so a server can import it", () => {
    // `editor` is bundled with a `"use client"` banner, so importing the constant from
    // there in a route handler yields a client reference rather than a string — which the
    // demo found by storing the text of a thrown error as a document's MJML.
    expect(typeof STARTER_MJML).toBe("string");
  });
});
