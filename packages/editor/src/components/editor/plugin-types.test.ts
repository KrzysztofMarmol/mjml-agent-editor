// @vitest-environment jsdom
import { createRequire } from "node:module";
import grapesjs, { type Component, type Editor } from "grapesjs";
import grapesjsMJML from "grapesjs-mjml";
import { beforeEach, describe, expect, it } from "vitest";

import { createWriter } from "./inspector/write.js";
import { fixPluginTypes } from "./plugin-types.js";

const require = createRequire(import.meta.url);
const mjml = require("mjml") as (
  xml: string,
  options: { validationLevel: "strict" },
) => { errors: unknown[] };

let editor: Editor;

beforeEach(() => {
  // Headless: jsdom has no layout for the canvas frame to wait on.
  editor = grapesjs.init({
    headless: true,
    storageManager: false,
    telemetry: false,
    plugins: [grapesjsMJML],
  });
  fixPluginTypes(editor);
});

const load = (body: string) =>
  editor.setComponents(
    `<mjml><mj-body><mj-section><mj-column>${body}</mj-column></mj-section></mj-body></mjml>`,
  );

function first(tag: string): Component {
  let found: Component | undefined;
  editor.getWrapper()!.onAll((c) => {
    if (!found && c.get("type") === tag) found = c;
  });
  return found!;
}

const strictErrors = () => mjml(editor.getHtml(), { validationLevel: "strict" }).errors;

describe("fixPluginTypes", () => {
  it("writes a quote inside an attribute value so the document still parses", async () => {
    load('<mj-button href="https://a.com">Go</mj-button>');
    await createWriter(editor, first("mj-button"))("title", 'Shop "summer"');
    expect(editor.getHtml()).toContain('title="Shop &quot;summer&quot;"');
    expect(strictErrors()).toEqual([]);
  });

  it("keeps quotes the document already had through a load and a save", () => {
    const button = `<mj-button href="https://a.com" font-family="&quot;Helvetica Neue&quot;, Arial">Go</mj-button>`;
    load(button);
    const saved = editor.getHtml();
    expect(saved).toContain(button);
    editor.setComponents(saved);
    expect(editor.getHtml()).toBe(saved);
  });

  it("never writes GrapesJS's marker, even in the middle of a drag", async () => {
    load("<mj-text>Hi</mj-text>");
    await createWriter(editor, first("mj-text"))("color", "#111111", { partial: true });
    expect(editor.getHtml()).toContain('<mj-text color="#111111">');
    expect(strictErrors()).toEqual([]);
  });

  it("keeps a value that equals the plugin's own default", () => {
    load('<mj-navbar><mj-navbar-link padding="25px">Home</mj-navbar-link></mj-navbar>');
    expect(editor.getHtml()).toContain('<mj-navbar-link padding="25px">');
  });
});
