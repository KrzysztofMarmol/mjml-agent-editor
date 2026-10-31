import { describe, expect, it } from "vitest";

import { DEFAULT_LABELS, mergeLabels } from "./labels.js";

describe("mergeLabels", () => {
  it("merges the id-keyed maps key by key", () => {
    const labels = mergeLabels({
      blockLabels: { "mj-text": "Tekst" },
      elementNames: { "mj-section": "Sekcja" },
    });
    expect(labels.blockLabels["mj-text"]).toBe("Tekst");
    expect(labels.blockLabels["mj-button"]).toBe(DEFAULT_LABELS.blockLabels["mj-button"]);
    expect(labels.elementNames["mj-section"]).toBe("Sekcja");
    expect(labels.elementNames["mj-column"]).toBe(DEFAULT_LABELS.elementNames["mj-column"]);
  });
});
