import { describe, expect, it } from "vitest";

import { opensBlockSearch } from "./shortcuts.js";

const press = (overrides: Partial<Parameters<typeof opensBlockSearch>[0]> = {}) =>
  opensBlockSearch({
    key: "/",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    isComposing: false,
    target: { tagName: "BODY", isContentEditable: false } as unknown as EventTarget,
    ...overrides,
  });

describe("opensBlockSearch", () => {
  it("opens on a bare slash outside any field", () => {
    expect(press()).toBe(true);
  });

  it("leaves a slash typed into a field or into text on the canvas alone", () => {
    expect(press({ target: { tagName: "INPUT" } as unknown as EventTarget })).toBe(false);
    expect(press({ target: { tagName: "TEXTAREA" } as unknown as EventTarget })).toBe(false);
    expect(
      press({ target: { tagName: "DIV", isContentEditable: true } as unknown as EventTarget }),
    ).toBe(false);
  });

  it("leaves the copy GrapesJS re-dispatches on the canvas iframe to the canvas's own listener", () => {
    expect(press({ target: { tagName: "IFRAME" } as unknown as EventTarget })).toBe(false);
  });

  it("ignores modified presses, other keys and IME composition", () => {
    expect(press({ ctrlKey: true })).toBe(false);
    expect(press({ metaKey: true })).toBe(false);
    expect(press({ key: "k", metaKey: true })).toBe(false);
    expect(press({ isComposing: true })).toBe(false);
  });
});
