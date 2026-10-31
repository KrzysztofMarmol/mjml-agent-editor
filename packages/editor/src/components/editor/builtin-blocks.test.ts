// @vitest-environment jsdom
import { createRequire } from "node:module";
import grapesjs, { type Editor } from "grapesjs";
import grapesjsMJML from "grapesjs-mjml";
import { beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_LABELS } from "../../labels.js";
import { BUILTIN_BLOCKS, builtinBlock } from "./builtin-blocks.js";
import { withClosedTags } from "./mjml-attributes.js";
import { fixPluginTypes } from "./plugin-types.js";

const mjml = createRequire(import.meta.url)("mjml") as (
  xml: string,
  options: { validationLevel: "strict" },
) => { errors: unknown[]; html: string };

let editor: Editor;
beforeAll(() => {
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
});

/** The email a block makes when dropped into an empty one, as the editor writes it. */
function dropped(id: string): string {
  const content = String(editor.Blocks.get(id)!.get("content"));
  const section = content.trimStart().startsWith("<mj-section")
    ? content
    : `<mj-section><mj-column>${content}</mj-column></mj-section>`;
  editor.setComponents(withClosedTags(`<mjml><mj-body>${section}</mj-body></mjml>`));
  return editor.getHtml();
}

describe("built-in blocks", () => {
  it.each(BUILTIN_BLOCKS)("%s compiles strictly and loads nothing from elsewhere", (id) => {
    const email = dropped(id);
    expect(mjml(email, { validationLevel: "strict" }).errors).toEqual([]);
    expect(email).not.toMatch(/\bsrc="https?:/);
  });

  it("names each social link for a screen reader", () => {
    const html = mjml(dropped("mj-social-group"), { validationLevel: "strict" }).html;
    const images = html.match(/<img\b[^>]*>/g) ?? [];
    expect(images).toHaveLength(3);
    for (const img of images) expect(img).toMatch(/\balt="[^"]+"/);
  });
});
