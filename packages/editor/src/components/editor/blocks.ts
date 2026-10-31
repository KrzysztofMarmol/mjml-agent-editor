/**
 * Sections a host adds to the palette.
 *
 * A dropped block is ordinary MJML from then on, so it has to be MJML the agent's strict
 * compile accepts and the editor writes back unchanged: one bad block in the palette would
 * put an error into every email it is dropped in, and block every agent write to it.
 */

import grapesjs, { type Editor } from "grapesjs";
import grapesjsMJML from "grapesjs-mjml";

import { ID_RE } from "./ids.js";
import { tileAttributes } from "./insert-block.js";
import { isSafeLink, isSafeNavbarLink } from "./inspector/values.js";
import { withClosedTags } from "./mjml-attributes.js";

export type SectionBlock = {
  /** Unique, and not the id of a built-in block. */
  readonly id: string;
  /** Plain text. */
  readonly label: string;
  /** Exactly one `<mj-section>`, without `sec-*`/`obj-*` ids: those are added on drop. */
  readonly mjml: string;
  /** SVG markup for the tile, rendered as is. The palette paints it with `fill`, as it does
   *  the built-in tiles, so draw with filled shapes. */
  readonly media?: string;
};

// Tags a dropped section may hold: what the editor keeps on a load and edits in Settings. Not
// mj-table (its rows are kept, never edited), mj-hero (its content sits outside any
// section, where the agent and comments cannot address it), accordion and carousel (the
// editor can neither render nor edit them), mj-wrapper (it holds sections, and a block is
// one) or mj-raw (HTML nobody edits here).
const EDITABLE_TAGS = new Set([
  "mj-section",
  "mj-group",
  "mj-column",
  "mj-text",
  "mj-image",
  "mj-button",
  "mj-divider",
  "mj-spacer",
  "mj-social",
  "mj-social-element",
  "mj-navbar",
  "mj-navbar-link",
]);

// The tags whose content is markup. Text anywhere else is dropped by MJML without an error.
const CONTENT_TAGS = new Set(["mj-text", "mj-button", "mj-social-element", "mj-navbar-link"]);

// GrapesJS reads `data-gjs-*` as properties, which reach the page unescaped, and serialises
// `__p` and `custom-name` from markup as they are.
const EDITOR_INTERNALS = /data-gjs-|__p\b|custom-name/i;

// Markup in a text that GrapesJS drops on a drop, so what was offered is not what lands.
const DROPPED_MARKUP = /<(?:script|style|link|meta|iframe|object|embed|form)\b/i;

// Mail clients block inline images, and the editor never inlines a file.
const INLINE_IMAGE =
  /\b(?:src|srcset|background-url|icon)\s*=\s*(?:"[^"]*data:|'[^']*data:|data:)/i;

// `<a/href=…>` is an href to a browser too.
const LINK_IN_MARKUP =
  /[\s/"'](?:xlink:)?(?:href|action|formaction)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

type MjmlNode = {
  tagName: string;
  attributes?: Record<string, string>;
  content?: string;
  children?: MjmlNode[];
};

type MjmlError = { formattedMessage?: string; message?: string };

let validator: Editor | undefined;

/** Why a block cannot be offered; empty when it can. */
export function blockProblems(
  mjml: string,
  editor: Editor = (validator ??= grapesjs.init({
    headless: true,
    storageManager: false,
    telemetry: false,
    plugins: [grapesjsMJML],
  })),
): string[] {
  if (EDITOR_INTERNALS.test(mjml)) return ["it contains GrapesJS's own attributes"];
  if (INLINE_IMAGE.test(mjml)) return ["it inlines an image as a data: URL"];

  let tree: MjmlNode;
  try {
    tree = (
      editor.runCommand("mjml-code-to-html", {
        mjml: `<mjml><mj-body>${withClosedTags(mjml)}</mj-body></mjml>`,
        validationLevel: "strict",
      }) as { json: MjmlNode }
    ).json;
  } catch (e) {
    const errors = (e as { errors?: MjmlError[] }).errors;
    if (!errors) throw e;
    return errors.map((error) => error.formattedMessage ?? error.message ?? String(error));
  }

  const problems: string[] = [];
  const top = tree.children?.find((c) => c.tagName === "mj-body")?.children ?? [];
  if (top.length !== 1 || top[0]!.tagName !== "mj-section") {
    problems.push("it is not exactly one mj-section");
  }
  const visit = (node: MjmlNode, parent?: MjmlNode) => {
    const tag = node.tagName;
    const attributes = node.attributes ?? {};
    const content = node.content ?? "";
    if (!EDITABLE_TAGS.has(tag)) problems.push(`${tag} is not editable here`);
    const cssClass = attributes["css-class"] ?? "";
    if (ID_RE.sec.test(cssClass) || ID_RE.obj.test(cssClass)) {
      problems.push(`${tag} carries a sec-* or obj-* id`);
    }
    // Defined in mj-head, which a block cannot bring.
    if ("mj-class" in attributes) problems.push(`${tag} uses mj-class`);
    const links = [attributes.href ?? ""];
    for (const match of content.matchAll(LINK_IN_MARKUP)) {
      links.push(match[1] ?? match[2] ?? match[3] ?? "");
    }
    const linked =
      tag === "mj-navbar-link"
        ? isSafeNavbarLink(parent?.attributes?.["base-url"] ?? "", attributes.href ?? "")
        : true;
    if (!linked || !links.every(isSafeLink)) {
      problems.push(`${tag} has a link scheme mail must not carry`);
    }
    if (
      CONTENT_TAGS.has(tag) ? /<mj-/i.test(content) || DROPPED_MARKUP.test(content) : content.trim()
    ) {
      problems.push(`${tag} holds content the editor does not keep`);
    }
    node.children?.forEach((child) => visit(child, node));
  };
  top.forEach((node) => visit(node));
  return problems;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Adds the blocks that can be offered, and reports the rest to the developer. */
export function registerBlocks(
  editor: Editor,
  blocks: readonly SectionBlock[],
  category: string,
  media: string,
) {
  for (const block of blocks) {
    const problems = editor.Blocks.get(block.id)
      ? [`the id is already taken`]
      : blockProblems(block.mjml, editor);
    if (problems.length > 0) {
      console.error(`Block "${block.id}" is left out of the palette: ${problems.join("; ")}`);
      continue;
    }
    editor.Blocks.add(block.id, {
      // GrapesJS writes the label into the tile as markup.
      label: escapeHtml(block.label),
      category,
      media: block.media ?? media,
      content: withClosedTags(block.mjml),
      attributes: tileAttributes(block.id),
    });
  }
}
