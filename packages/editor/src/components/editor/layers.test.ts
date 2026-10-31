// @vitest-environment jsdom
import grapesjs, { type Component, type Editor } from "grapesjs";
import grapesjsMJML from "grapesjs-mjml";
import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_LABELS } from "../../labels.js";
import { layerName, setupLayerNames } from "./layers.js";

let editor: Editor;

beforeEach(() => {
  // Headless: jsdom has no layout for the canvas frame to wait on.
  editor = grapesjs.init({
    headless: true,
    storageManager: false,
    telemetry: false,
    plugins: [grapesjsMJML],
  });
  setupLayerNames(editor, DEFAULT_LABELS);
  editor.setComponents(`<mjml><mj-body>
    <mj-section>
      <mj-column><mj-image src="https://example.com/a.png" alt="Summer shoes"></mj-image></mj-column>
      <mj-column>
        <mj-text><h1>Summer &amp; <b>sale</b></h1><p>Up to 50% off</p></mj-text>
        <mj-button href="https://example.com">Shop now</mj-button>
      </mj-column>
    </mj-section>
    <mj-section><mj-column>
      <mj-social><mj-social-element name="instagram-noshare" href="https://instagram.com/"></mj-social-element></mj-social>
      <mj-navbar><mj-navbar-link>Home</mj-navbar-link></mj-navbar>
      <mj-text>&lt;img src=x onerror="alert(1)"&gt;</mj-text>
      <mj-divider></mj-divider>
    </mj-column></mj-section>
  </mj-body></mjml>`);
  editor.UndoManager.clear();
});

function all(tag: string): Component[] {
  const found: Component[] = [];
  editor.getWrapper()!.onAll((c) => {
    if (c.get("type") === tag) found.push(c);
  });
  return found;
}

const name = (tag: string, i = 0) => layerName(all(tag)[i]!, DEFAULT_LABELS);

describe("layerName", () => {
  it("names an element by its words, and a section by its first ones", () => {
    expect(name("mj-text")).toBe("Summer & sale");
    expect(name("mj-button")).toBe("Shop now");
    expect(name("mj-image")).toBe("Summer shoes");
    expect(name("mj-navbar-link")).toBe("Home");
    expect(name("mj-social-element")).toBe("Instagram");
    expect(name("mj-section")).toBe("Summer & sale");
  });

  it("falls back to the kind of element, numbering columns that share a section", () => {
    expect(name("mj-column", 0)).toBe("Column 1");
    expect(name("mj-column", 1)).toBe("Column 2");
    expect(name("mj-column", 2)).toBe("Column");
    expect(name("mj-divider")).toBe("Divider");
  });

  it("gives GrapesJS, which puts the name into markup, the document's text escaped", () => {
    const text = all("mj-text")[1]!;
    expect(layerName(text, DEFAULT_LABELS)).toBe('<img src=x onerror="alert(1)">');
    expect(text.getName()).toBe("&#60;img src=x onerror=&#34;alert(1)&#34;&#62;");
  });

  it("shows a text's paragraphs as its content, not as rows, also after it is edited", () => {
    const text = all("mj-text")[0]!;
    expect(editor.Layers.getComponents(text)).toHaveLength(0);
    expect(editor.Layers.getComponents(all("mj-button")[0]!)).toHaveLength(0);
    // What the rich-text editor does when editing ends.
    text.components("<p>New <b>words</b></p>");
    expect(editor.Layers.getComponents(text)).toHaveLength(0);
    expect(editor.Layers.getComponents(all("mj-column")[1]!)).toHaveLength(2);
  });

  it("opens rows without adding an undo step", () => {
    for (const s of all("mj-section")) editor.Layers.setOpen(s, true);
    expect(editor.UndoManager.hasUndo()).toBe(false);
  });
});
