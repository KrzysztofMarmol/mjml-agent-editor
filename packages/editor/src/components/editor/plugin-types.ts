/** Corrections to how grapesjs-mjml's types read and write MJML. */

import type { Component, Editor } from "grapesjs";

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
 * - A column takes only what MJML allows in one.
 * - An mj-table keeps its rows.
 */
export function fixPluginTypes(editor: Editor) {
  // The plugin has no mj-table, so it was a plain element and lost its rows to the HTML
  // parser. Its markup is kept as it was given, through `withTableRowsKept`, and never edited.
  editor.Components.addType("mj-table", {
    isComponent: (el: HTMLElement) =>
      el.tagName?.toLowerCase() === "mj-table" && {
        type: "mj-table",
        content: el.querySelector(":scope > template")?.innerHTML ?? "",
        components: [],
      },
    model: { defaults: { tagName: "mj-table", droppable: false, editable: false } },
    view: {
      // A table around the rows, or the canvas would drop them as the parser did.
      updateContent(this: { el: HTMLElement; model: Component }) {
        this.el.innerHTML = `<table style="width:100%">${this.model.get("content") ?? ""}</table>`;
      },
    },
  } as never);
  for (const type of editor.Components.getTypes()) {
    if (!type.id.startsWith("mj-")) continue;
    const base = (type.model.prototype as { getAttrToHTML: AttrToHTML }).getAttrToHTML;
    editor.Components.addType(type.id, {
      model: {
        defaults: {
          "style-default": {},
          ...(type.id === "mj-column" && {
            droppable: (source: Component) => COLUMN_CHILDREN.has(String(source.get("tagName"))),
          }),
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
