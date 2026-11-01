// @vitest-environment jsdom
import { createRequire } from "node:module";
import grapesjs, { type Block, type Component, type Editor } from "grapesjs";
import grapesjsMJML from "grapesjs-mjml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { blockProblems, registerBlocks } from "./blocks.js";
import { addIdClass, freshenCopiedIds } from "./ids.js";

const require = createRequire(import.meta.url);
const mjml = require("mjml") as (
  xml: string,
  options: { validationLevel: "strict" },
) => { errors: unknown[] };

const section = (inner: string, attributes = "") =>
  `<mj-section${attributes}><mj-column>${inner}</mj-column></mj-section>`;

const CARD = section(
  '<mj-image src="https://a.com/p.png" alt="Mug" /><mj-text>Mug <a href="https://a.com/mug">details</a></mj-text><mj-button href="https://a.com/buy">Buy</mj-button>',
  ' background-color="#ffffff"',
);

describe("blockProblems", () => {
  it("accepts one section of editable elements, self-closed ones included", () => {
    expect(blockProblems(CARD)).toEqual([]);
  });

  it.each([
    ["an attribute MJML rejects", section('<mj-text title="x">Hi</mj-text>'), /illegal/],
    [
      "two sections",
      section("<mj-text>A</mj-text>") + section("<mj-text>B</mj-text>"),
      /exactly one/,
    ],
    ["a wrapper", `<mj-wrapper>${section("<mj-text>A</mj-text>")}</mj-wrapper>`, /exactly one/],
    ["a table", section("<mj-table><tr><td>1</td></tr></mj-table>"), /mj-table is not/],
    ["a table hidden in a text", section("<mj-text>Hi<mj-table></mj-table></mj-text>"), /content/],
    ["text a column drops", section("lost<mj-text>Hi</mj-text>"), /content/],
    ["an accordion", section("<mj-accordion></mj-accordion>"), /mj-accordion is not/],
    ["a section id", section("<mj-text>A</mj-text>", ' css-class="hero sec-ab12"'), /sec-\*/],
    ["an element id", section('<mj-text css-class="obj-ab12">A</mj-text>'), /sec-\*/],
    ["an mj-class", section('<mj-text mj-class="lead">A</mj-text>'), /mj-class/],
    ["a script link", section('<mj-button href="javascript:alert(1)">Go</mj-button>'), /scheme/],
    [
      "a script link in text",
      section("<mj-text><a href='java&#115;cript:x'>Go</a></mj-text>"),
      /scheme/,
    ],
    ["an inline image", section('<mj-image src="data:image/png;base64,AAAA"></mj-image>'), /data:/],
    ["a GrapesJS property", section('<mj-text><p data-gjs-name="x">A</p></mj-text>'), /GrapesJS/],
    ["GrapesJS's drag marker", section('<mj-text><p __p="true">A</p></mj-text>'), /GrapesJS/],
    [
      "a script link split across a navigation bar",
      section(
        '<mj-navbar base-url="javascript"><mj-navbar-link href=":alert(1)">Go</mj-navbar-link></mj-navbar>',
      ),
      /scheme/,
    ],
    [
      "an inline image in a text",
      section('<mj-text><img src="data:image/png;base64,AA"></mj-text>'),
      /data:/,
    ],
    [
      "an inline image in a srcset",
      section(
        '<mj-image src="https://a.com/x.png" srcset="data:image/png;base64,AA 2x"></mj-image>',
      ),
      /data:/,
    ],
    [
      "a link written without a space",
      section('<mj-text><a/href="data:text/html,x">Go</a></mj-text>'),
      /scheme/,
    ],
    [
      "a stylesheet the editor drops",
      section("<mj-text><style>.a{color:red}</style>Hi</mj-text>"),
      /content/,
    ],
  ])("refuses %s", (_, block, problem) => {
    expect(blockProblems(block).join("\n")).toMatch(problem);
  });
});

describe("registerBlocks", () => {
  let editor: Editor;
  const error = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    editor = grapesjs.init({
      headless: true,
      storageManager: false,
      telemetry: false,
      plugins: [(e: Editor) => grapesjsMJML(e, { blocks: ["mj-text"] })],
    });
    editor.setComponents("<mjml><mj-body></mj-body></mjml>");
  });
  afterEach(() => error.mockClear());

  it("leaves out a block that is refused or whose id is taken, and says why", () => {
    registerBlocks(
      editor,
      [
        { id: "card", label: "Card", mjml: CARD },
        { id: "mj-text", label: "Shadow", mjml: CARD },
        { id: "card", label: "Again", mjml: CARD },
        { id: "table", label: "Table", mjml: section("<mj-table></mj-table>") },
      ],
      "Sections",
      "<svg></svg>",
    );
    expect(editor.Blocks.getAll().map((b: Block) => [b.getId(), b.getLabel()])).toEqual([
      ["mj-text", expect.any(String)],
      ["card", "Card"],
    ]);
    expect(error.mock.calls.map(([message]) => String(message))).toEqual([
      expect.stringMatching(/"mj-text".*taken/),
      expect.stringMatching(/"card".*taken/),
      expect.stringMatching(/"table".*mj-table/),
    ]);
  });

  it("can be reached and added from the keyboard", () => {
    registerBlocks(editor, [{ id: "card", label: "Card", mjml: CARD }], "Sections", "");
    expect(editor.Blocks.get("card")!.get("attributes")).toMatchObject({ "data-block": "card" });
  });

  it("is selected once dropped, like the built-in blocks", () => {
    registerBlocks(editor, [{ id: "card", label: "Card", mjml: CARD }], "Sections", "");
    expect(editor.Blocks.get("card")!.get("select")).toBe(true);
  });

  it("shows a label as text", () => {
    registerBlocks(editor, [{ id: "card", label: "<b>Card</b>", mjml: CARD }], "Sections", "");
    expect(editor.Blocks.get("card")!.getLabel()).toBe("&lt;b&gt;Card&lt;/b&gt;");
  });

  it("drops as strict MJML with a fresh section id, undone in one step", () => {
    registerBlocks(editor, [{ id: "card", label: "Card", mjml: CARD }], "Sections", "");
    // What EmailEditor does with everything added outside a load.
    editor.on("component:add", (c: Component) => {
      freshenCopiedIds(editor.getWrapper(), c);
      if (c.get("tagName") === "mj-section") addIdClass(c, "sec");
    });
    let body: Component = editor.getWrapper()!;
    editor.getWrapper()!.onAll((c) => {
      if (c.get("tagName") === "mj-body") body = c;
    });
    editor.UndoManager.clear();

    body.append(editor.Blocks.get("card")!.getContent() as string);

    const saved = editor.getHtml();
    expect(saved).toMatch(/<mj-section background-color="#ffffff" css-class="sec-[a-z0-9]+">/);
    expect(saved).toContain('alt="Mug"></mj-image><mj-text>');
    expect(mjml(saved, { validationLevel: "strict" }).errors).toEqual([]);
    editor.UndoManager.undo();
    expect(editor.getHtml()).toBe("<mjml><mj-body></mj-body></mjml>");
  });
});
