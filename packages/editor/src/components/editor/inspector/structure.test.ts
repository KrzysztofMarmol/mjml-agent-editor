// @vitest-environment jsdom
import { createRequire } from "node:module";
import grapesjs, { type Component, type Editor } from "grapesjs";
import grapesjsMJML from "grapesjs-mjml";
import { describe, expect, it } from "vitest";

import {
  addNavbarLink,
  addNetwork,
  COLUMN_RATIOS,
  columnsOf,
  currentRatio,
  ratioWidths,
  setRatio,
} from "./structure.js";

const require = createRequire(import.meta.url);
const mjml = require("mjml") as (
  xml: string,
  options: { validationLevel: "strict" },
) => { errors: unknown[] };

function load(mjmlSource: string): Editor {
  // Headless: jsdom has no layout for the canvas frame to wait on.
  const editor = grapesjs.init({
    headless: true,
    storageManager: false,
    telemetry: false,
    plugins: [grapesjsMJML],
  });
  editor.setComponents(mjmlSource);
  editor.UndoManager.clear();
  return editor;
}

function find(editor: Editor, tag: string): Component {
  let found: Component | undefined;
  editor.getWrapper()!.onAll((c) => {
    if (!found && c.get("type") === tag) found = c;
  });
  return found!;
}

const strictErrors = (editor: Editor) =>
  mjml(editor.getHtml(), { validationLevel: "strict" }).errors;

describe("column ratios", () => {
  const twoColumns =
    "<mjml><mj-body><mj-section><mj-column><mj-text>a</mj-text></mj-column><mj-column><mj-text>b</mj-text></mj-column></mj-section></mj-body></mjml>";

  it("writes widths MJML accepts, and recognises them afterwards", () => {
    for (const [count, ratios] of Object.entries(COLUMN_RATIOS)) {
      for (const ratio of ratios) {
        const columns = Array.from(
          { length: Number(count) },
          () => "<mj-column><mj-text>x</mj-text></mj-column>",
        );
        const editor = load(
          `<mjml><mj-body><mj-section>${columns.join("")}</mj-section></mj-body></mjml>`,
        );
        const cols = columnsOf(find(editor, "mj-section"))!;
        setRatio(cols, ratio);
        expect(strictErrors(editor)).toEqual([]);
        expect(currentRatio(cols)).toEqual(ratio);
      }
    }
  });

  it("goes back to MJML's equal split by removing the widths, in one undo step", async () => {
    const editor = load(twoColumns);
    const cols = columnsOf(find(editor, "mj-section"))!;
    expect(currentRatio(cols)).toEqual([1, 1]);
    setRatio(cols, [1, 2]);
    // GrapesJS makes one undo step of everything changed in one call stack, as a click is.
    await new Promise((r) => setTimeout(r, 10));
    expect(editor.getHtml()).toContain('<mj-column width="33.33%">');
    expect(editor.getHtml()).toContain('<mj-column width="66.67%">');
    setRatio(cols, [1, 1]);
    expect(editor.getHtml()).not.toContain("width=");
    editor.UndoManager.undo();
    expect(currentRatio(cols)).toEqual([1, 2]);
  });

  it("leaves widths it did not write unmatched, and a section with a column group alone", () => {
    const editor = load(twoColumns.replace("<mj-column>", '<mj-column width="200px">'));
    expect(currentRatio(columnsOf(find(editor, "mj-section"))!)).toBeNull();
    const grouped = load(
      "<mjml><mj-body><mj-section><mj-group><mj-column><mj-text>a</mj-text></mj-column></mj-group></mj-section></mj-body></mjml>",
    );
    expect(columnsOf(find(grouped, "mj-section"))).toBeNull();
    expect(ratioWidths([1, 1, 1])).toBeNull();
  });
});

describe("adding children", () => {
  const column = (inner: string) =>
    `<mjml><mj-body><mj-section><mj-column>${inner}</mj-column></mj-section></mj-body></mjml>`;

  it("adds the next common network as a profile link", () => {
    const editor = load(
      column(
        '<mj-social><mj-social-element name="facebook-noshare" href="https://facebook.com/"></mj-social-element></mj-social>',
      ),
    );
    addNetwork(find(editor, "mj-social"));
    expect(editor.getHtml()).toContain(
      '<mj-social-element name="instagram-noshare" href="https://instagram.com/">',
    );
    expect(strictErrors(editor)).toEqual([]);
  });

  it("adds a navigation link with its text, and the text is not markup", () => {
    const editor = load(column("<mj-navbar><mj-navbar-link>Home</mj-navbar-link></mj-navbar>"));
    addNavbarLink(find(editor, "mj-navbar"), "A <b>link</b>");
    expect(editor.getHtml()).toMatch(
      /<mj-navbar-link>A &lt;b&gt;link&lt;\/b&gt;<\/mj-navbar-link>/,
    );
    expect(strictErrors(editor)).toEqual([]);
  });
});
