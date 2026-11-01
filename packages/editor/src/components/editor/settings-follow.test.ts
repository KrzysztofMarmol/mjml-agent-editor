// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { clickShowsSettings, dropShowsSettings } from "./settings-follow.js";

describe("clickShowsSettings", () => {
  const selected = document.createElement("div");
  const inside = selected.appendChild(document.createElement("span"));
  const elsewhere = document.createElement("div");

  it("shows Settings for a click on what is selected, already selected or not", () => {
    expect(clickShowsSettings(selected, inside)).toBe(true);
    expect(clickShowsSettings(selected, selected)).toBe(true);
  });

  it("stays put for a click outside the selection, or with nothing selected", () => {
    expect(clickShowsSettings(selected, elsewhere)).toBe(false);
    expect(clickShowsSettings(undefined, inside)).toBe(false);
    expect(clickShowsSettings(selected, null)).toBe(false);
  });
});

describe("dropShowsSettings", () => {
  const added = {};

  it("shows Settings for a dropped block that was selected", () => {
    expect(dropShowsSettings(added, added)).toBe(true);
    expect(dropShowsSettings([added, {}], added)).toBe(true);
  });

  it("stays put for a block left unselected, or a drop that added nothing", () => {
    expect(dropShowsSettings(added, {})).toBe(false);
    expect(dropShowsSettings(added, undefined)).toBe(false);
    expect(dropShowsSettings(undefined, undefined)).toBe(false);
  });
});
