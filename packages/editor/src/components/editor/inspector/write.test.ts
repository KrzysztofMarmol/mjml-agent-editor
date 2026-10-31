// @vitest-environment jsdom
import grapesjs, { type Component, type Editor } from "grapesjs";
import grapesjsMJML from "grapesjs-mjml";
import { beforeEach, describe, expect, it } from "vitest";

import { createWriter } from "./write.js";

let editor: Editor;
let text: Component;

beforeEach(() => {
  // Headless: jsdom has no layout for the canvas frame to wait on.
  editor = grapesjs.init({
    headless: true,
    storageManager: false,
    telemetry: false,
    plugins: [grapesjsMJML],
  });
  editor.setComponents(
    '<mjml><mj-body><mj-section css-class="sec-a"><mj-column><mj-text css-class="obj-t">Hi</mj-text></mj-column></mj-section></mj-body></mjml>',
  );
  editor.getWrapper()!.onAll((c) => {
    if (c.get("type") === "mj-text") text = c;
  });
  editor.UndoManager.clear();
});

const textTag = () => editor.getHtml().match(/<mj-text[^>]*>/)![0];

describe("createWriter", () => {
  it("ends a drag as one undoable change with nothing GrapesJS-internal left in the MJML", async () => {
    const write = createWriter(editor, text);
    await write("color", "#222222", { partial: true });
    await write("color", "#111111", { partial: true });
    await write("color", "#111111");

    expect(textTag()).toBe('<mj-text css-class="obj-t" color="#111111">');
    editor.UndoManager.undo();
    expect(textTag()).toBe('<mj-text css-class="obj-t">');
  });

  it("drops longhands in the same change as the shorthand that replaces them", async () => {
    text.addAttributes({ "padding-top": "4px" });
    editor.UndoManager.clear();
    const write = createWriter(editor, text);
    await write("padding", "20px 0", { remove: ["padding-top", "padding-bottom"] });

    expect(textTag()).toBe('<mj-text css-class="obj-t" padding="20px 0">');
    editor.UndoManager.undo();
    expect(textTag()).toBe('<mj-text css-class="obj-t" padding-top="4px">');
  });
});
