/** The palette's own blocks: grapesjs-mjml's, with the content its defaults get wrong. */

import type { EditorLabels } from "../../labels.js";
import { tileAttributes } from "./insert-block.js";

// Social and navigation children are only valid inside their parent; hero and wrapper are
// banned from editable templates by agent-core (a hero gets no `sec-*` id, so the agent cannot
// address it); raw HTML is out of place for the people this editor serves.
export const BUILTIN_BLOCKS = [
  "mj-1-column",
  "mj-2-columns",
  "mj-3-columns",
  "mj-text",
  "mj-image",
  "mj-button",
  "mj-divider",
  "mj-spacer",
  "mj-social-group",
  "mj-navbar",
];
const LAYOUT_BLOCKS = new Set(["mj-1-column", "mj-2-columns", "mj-3-columns"]);

const CONTENT: Record<string, string> = {
  // The plugin's version links Google+ and shares the page: a bare network name makes the
  // icon open a "share this link" dialog, while `-noshare` links to the profile a footer
  // means. Without `alt` each link is an unnamed image to a screen reader.
  "mj-social-group": `<mj-social icon-size="24px" mode="horizontal">
  <mj-social-element name="facebook-noshare" href="https://facebook.com/" alt="Facebook"></mj-social-element>
  <mj-social-element name="instagram-noshare" href="https://instagram.com/" alt="Instagram"></mj-social-element>
  <mj-social-element name="x-noshare" href="https://x.com/" alt="X"></mj-social-element>
</mj-social>`,
  // The plugin's sample is a via.placeholder.com picture, stored in the email and loaded by
  // every reader's mail client. Dropping one opens the image picker instead.
  "mj-image": "<mj-image></mj-image>",
};

/** What grapesjs-mjml's `block` option returns for a built-in block. */
export function builtinBlock(labels: EditorLabels) {
  return (id: string) => ({
    label: labels.blockLabels[id] ?? id,
    // By id: a regex on the label broke as soon as a host translated it.
    category: LAYOUT_BLOCKS.has(id) ? labels.blockCategoryLayout : labels.blockCategoryContent,
    ...(id in CONTENT && { content: CONTENT[id] }),
    attributes: tileAttributes(id),
  });
}

/** Shows an image without a picture yet as a box to click, in the canvas only. */
export const CANVAS_CSS =
  'img:not([src]), img[src=""] { min-height: 120px; background: #f4f4f5; outline: 1px dashed #a1a1aa; outline-offset: -1px; }';
