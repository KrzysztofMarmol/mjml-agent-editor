// @vitest-environment jsdom
import grapesjs, { type Component } from "grapesjs";
import grapesjsMJML from "grapesjs-mjml";
import { describe, expect, it } from "vitest";

import { addIdClass, freshenCopiedIds, sectionIdOf } from "./ids.js";

describe("freshenCopiedIds", () => {
  it("renames the ids a copied section brings, inside it too, and keeps the original's", () => {
    // Headless: jsdom has no layout for the canvas frame to wait on.
    const editor = grapesjs.init({
      headless: true,
      storageManager: false,
      telemetry: false,
      plugins: [grapesjsMJML],
    });
    editor.setComponents(
      '<mjml><mj-body><mj-section css-class="sec-a1"><mj-column><mj-text css-class="hero obj-t1">Hi</mj-text></mj-column></mj-section></mj-body></mjml>',
    );
    let body: Component | undefined;
    editor.getWrapper()!.onAll((c) => {
      if (c.get("type") === "mj-body") body = c;
    });
    const [copy] = body!.append(body!.components().at(0)!.clone());

    freshenCopiedIds(editor.getWrapper(), copy!);

    const html = editor.getHtml();
    expect(html.match(/sec-a1/g)).toHaveLength(1);
    expect(html.match(/obj-t1/g)).toHaveLength(1);
    expect(html).toMatch(/css-class="sec-(?!a1)[a-z0-9]+"/);
    expect(html).toMatch(/css-class="hero obj-(?!t1)[a-z0-9]+"/);
  });
});

describe("ids", () => {
  it("reads an id only from a whole class token, as the agent does", () => {
    const editor = grapesjs.init({
      headless: true,
      storageManager: false,
      telemetry: false,
      plugins: [grapesjsMJML],
    });
    editor.setComponents(
      '<mjml><mj-body><mj-section css-class="promo-sec-a"><mj-column></mj-column></mj-section></mj-body></mjml>',
    );
    let section: Component | undefined;
    editor.getWrapper()!.onAll((c) => {
      if (c.get("type") === "mj-section") section = c;
    });
    expect(sectionIdOf(section!)).toBeNull();
    const id = addIdClass(section!, "sec");
    expect(section!.getAttributes()["css-class"]).toBe(`promo-sec-a sec-${id}`);
  });
});
