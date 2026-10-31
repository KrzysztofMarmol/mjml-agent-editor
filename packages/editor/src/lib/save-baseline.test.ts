import { describe, expect, it } from "vitest";

import { createSaveBaseline } from "./save-baseline.js";

describe("createSaveBaseline", () => {
  it("does not save what a load turned the stored MJML into", () => {
    const baseline = createSaveBaseline();
    baseline.load("<mj-image />", "<mj-image></mj-image>");
    expect(baseline.changed("<mj-image></mj-image>")).toBe(false);
    expect(baseline.changed('<mj-image alt="a"></mj-image>')).toBe(true);
  });

  it("saves a repaired load", () => {
    const baseline = createSaveBaseline();
    baseline.load('<mj-text title="x">A</mj-text>', null);
    expect(baseline.changed("<mj-text>A</mj-text>")).toBe(true);
  });

  it("saves an undo back to the loaded state once an edit was saved", () => {
    const baseline = createSaveBaseline();
    baseline.load("<a/>", "<a></a>");
    baseline.saved("<b></b>");
    expect(baseline.changed("<a></a>")).toBe(true);
  });
});
