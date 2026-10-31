// @vitest-environment jsdom
import { createRequire } from "node:module";
import grapesjs, { type Component, type Editor } from "grapesjs";
import grapesjsMJML from "grapesjs-mjml";
import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_LABELS } from "../../labels.js";
import { BUILTIN_BLOCKS, builtinBlock } from "./builtin-blocks.js";
import { addIdClass, freshenCopiedIds } from "./ids.js";
import { addsBlock, insertBlock } from "./insert-block.js";
import { fixPluginTypes } from "./plugin-types.js";

const mjml = createRequire(import.meta.url)("mjml") as (
  xml: string,
  options: { validationLevel: "strict" },
) => { errors: unknown[] };

let editor: Editor;
beforeEach(() => {
  editor = grapesjs.init({
    headless: true,
    storageManager: false,
    telemetry: false,
    plugins: [
      (e: Editor) =>
        grapesjsMJML(e, { blocks: BUILTIN_BLOCKS, block: builtinBlock(DEFAULT_LABELS) } as never),
    ],
  });
  fixPluginTypes(editor);
  // What EmailEditor does with everything added outside a load.
  editor.on("component:add", (c: Component) => {
    freshenCopiedIds(editor.getWrapper(), c);
    if (c.get("tagName") === "mj-section") addIdClass(c, "sec");
  });
  editor.setComponents(
    `<mjml><mj-body>` +
      `<mj-section css-class="sec-a"><mj-column><mj-text>A</mj-text><mj-text>B</mj-text></mj-column></mj-section>` +
      `<mj-section css-class="sec-z"><mj-column><mj-text>Z</mj-text></mj-column></mj-section>` +
      `</mj-body></mjml>`,
  );
  editor.UndoManager.clear();
});

function find(text: string): Component {
  let found: Component | undefined;
  editor.getWrapper()!.onAll((c) => {
    if (!found && c.get("tagName") === "mj-text" && c.getInnerHTML() === text) found = c;
  });
  return found!;
}

const insert = (id: string) => insertBlock(editor, editor.Blocks.get(id)!);
const body = () => editor.getHtml().replace(/ css-class="sec-[a-z0-9]+"/g, "");

describe("insertBlock", () => {
  it("puts a section after the selected one, with an id of its own", () => {
    editor.select(find("A"));
    insert("mj-1-column");
    expect(body()).toMatch(
      /<mj-text>B<\/mj-text><\/mj-column><\/mj-section><mj-section><mj-column><mj-text>Content 1/,
    );
    expect(editor.getHtml().match(/sec-[a-z0-9]+/g)).toHaveLength(3);
  });

  it("puts an element after the selected one, in its column", () => {
    editor.select(find("A"));
    const added = insert("mj-button");
    expect(body()).toContain(
      "<mj-text>A</mj-text><mj-button>Button</mj-button><mj-text>B</mj-text>",
    );
    expect(editor.getSelected()).toBe(added);
  });

  it("gives an element a section of its own when nothing is selected", () => {
    insert("mj-divider");
    expect(body()).toMatch(
      /<mj-text>Z<\/mj-text><\/mj-column><\/mj-section><mj-section><mj-column><mj-divider><\/mj-divider><\/mj-column><\/mj-section><\/mj-body>/,
    );
  });

  it("keeps a section inside the wrapper of the selected one", () => {
    editor.setComponents(
      `<mjml><mj-body><mj-wrapper><mj-section css-class="sec-w1"><mj-column><mj-text>W1</mj-text></mj-column></mj-section>` +
        `<mj-section css-class="sec-w2"><mj-column><mj-text>W2</mj-text></mj-column></mj-section></mj-wrapper></mj-body></mjml>`,
    );
    editor.select(find("W1"));
    insert("mj-1-column");
    expect(body()).toMatch(
      /<mj-wrapper><mj-section><mj-column><mj-text>W1<\/mj-text><\/mj-column><\/mj-section><mj-section><mj-column><mj-text>Content 1/,
    );
  });

  it("is strict MJML, undone in one step", () => {
    const before = editor.getHtml();
    editor.select(find("Z"));
    insert("mj-social-group");
    expect(mjml(editor.getHtml(), { validationLevel: "strict" }).errors).toEqual([]);
    editor.UndoManager.undo();
    expect(editor.getHtml()).toBe(before);
  });
});

describe("addsBlock", () => {
  const key = (key: string, more: Partial<KeyboardEvent> = {}) =>
    addsBlock({ key, repeat: false, ctrlKey: false, metaKey: false, altKey: false, ...more });

  it("takes Enter and Space once, not a held key or a shortcut", () => {
    expect([key("Enter"), key(" "), key("a")]).toEqual([true, true, false]);
    expect([key("Enter", { repeat: true }), key("Enter", { ctrlKey: true })]).toEqual([
      false,
      false,
    ]);
    expect([key(" ", { metaKey: true }), key("Enter", { altKey: true })]).toEqual([false, false]);
  });
});
