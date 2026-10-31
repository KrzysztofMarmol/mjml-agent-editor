/** Corrections to how grapesjs-mjml's types read and write MJML. */

import type { Component, Editor } from "grapesjs";

import { addTableType } from "./table-type.js";

type AttrToHTML = (this: Component) => Record<string, unknown>;

// What MJML accepts inside an mj-column. The plugin lets a column take anything, so a <p>
// dragged out of a text landed in the column as an element no validator accepts.
const COLUMN_CHILDREN = new Set([
  "mj-accordion",
  "mj-button",
  "mj-carousel",
  "mj-divider",
  "mj-image",
  "mj-navbar",
  "mj-raw",
  "mj-social",
  "mj-spacer",
  "mj-table",
  "mj-text",
]);

/**
 * Applied to every mj-* type before a document loads.
 *
 * - No `style-default`s: the plugin's differ from MJML's in places. It stripped any attribute
 *   equal to one on save (a navigation link's 25px padding came back as MJML's 15px) and
 *   seeded each element with them, so every element looked as if it set them.
 * - Attribute values are escaped: the plugin writes them between double quotes as they are,
 *   so a `"` in a tooltip, or a font name the agent quoted, broke the tag and the document.
 * - GrapesJS's `__p`, which the plugin leaves on the attributes while a colour is dragged, is
 *   never written: a save falling due mid-drag stored it.
 * - A column takes only what MJML allows in one, and moves into and within a column group.
 * - An mj-table keeps its rows.
 * - An image without a picture is saved without one.
 */
export function fixPluginTypes(editor: Editor) {
  addTableType(editor);
  for (const type of editor.Components.getTypes()) {
    // mj-table is ours and serialises through GrapesJS's own escaping; this would add a second.
    if (!type.id.startsWith("mj-") || type.id === "mj-table") continue;
    const base = (type.model.prototype as { getAttrToHTML: AttrToHTML }).getAttrToHTML;
    editor.Components.addType(type.id, {
      model: {
        defaults: {
          "style-default": {},
          ...(type.id === "mj-column" && {
            droppable: (source: Component) => COLUMN_CHILDREN.has(String(source.get("tagName"))),
            // The plugin moves a column only within sections, so a group's could not even swap.
            draggable: '[data-gjs-type="mj-section"], [data-gjs-type="mj-group"]',
          }),
          // GrapesJS's own is an SVG's markup, which the canvas wrote into `src` and saved.
          ...(type.id === "mj-image" && { src: "" }),
        },
        getAttrToHTML(this: Component) {
          const attributes = base.call(this);
          delete attributes.__p;
          for (const [name, value] of Object.entries(attributes)) {
            if (typeof value === "string") attributes[name] = value.replace(/"/g, "&quot;");
          }
          return attributes;
        },
      },
    } as never);
  }
}
