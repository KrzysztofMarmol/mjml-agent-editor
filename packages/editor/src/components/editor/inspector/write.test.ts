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

  it("leaves no marker when a drag ends on the value it started from", async () => {
    text.addAttributes({ color: "#000000" });
    editor.UndoManager.clear();
    const write = createWriter(editor, text);
    await write("color", "#111111", { partial: true });
    await write("color", "#000000", { partial: true });
    await write("color", "#000000");

    expect(textTag()).toBe('<mj-text css-class="obj-t" color="#000000">');
    expect(editor.UndoManager.hasUndo()).toBe(false);
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

  it("ends a drag on a box as one change that also drops the longhands", async () => {
    text.addAttributes({ "padding-top": "4px" });
    editor.UndoManager.clear();
    const write = createWriter(editor, text);
    const longhands = ["padding-top", "padding-right", "padding-bottom", "padding-left"];
    await write("padding", "5px 25px 10px", { partial: true, remove: longhands });
    await write("padding", "8px 25px 10px", { partial: true, remove: longhands });
    await write("padding", "8px 25px 10px", { remove: longhands });

    expect(textTag()).toBe('<mj-text css-class="obj-t" padding="8px 25px 10px">');
    editor.UndoManager.undo();
    expect(textTag()).toBe('<mj-text css-class="obj-t" padding-top="4px">');
  });

  it("ends a drag back at the default by removing the attribute", async () => {
    text.addAttributes({ padding: "11px 25px" });
    editor.UndoManager.clear();
    const write = createWriter(editor, text);
    await write("padding", "", { partial: true });
    await write("padding", "");

    expect(textTag()).toBe('<mj-text css-class="obj-t">');
    editor.UndoManager.undo();
    expect(textTag()).toBe('<mj-text css-class="obj-t" padding="11px 25px">');
  });

  it("ends a drag when another attribute is written, with no undo step left that does nothing", async () => {
    const write = createWriter(editor, text);
    const tick = () => new Promise((r) => setTimeout(r, 10));
    await write("font-size", "15px", { partial: true });
    await tick();
    await write("color", "#111111");
    await tick();
    await write("font-size", "15px");
    await tick();

    expect(textTag()).toBe('<mj-text css-class="obj-t" font-size="15px" color="#111111">');
    // The drag is recorded as the other write lands, in the same step GrapesJS makes of one call.
    editor.UndoManager.undo();
    expect(textTag()).toBe('<mj-text css-class="obj-t">');
    expect(editor.UndoManager.hasUndo()).toBe(false);
  });

  it("writes nothing once blocked, asked as the write lands", async () => {
    let locked = false;
    const write = createWriter(editor, text, () => locked);
    locked = true;
    await write("color", "#111111");
    expect(textTag()).toBe('<mj-text css-class="obj-t">');
  });
});
