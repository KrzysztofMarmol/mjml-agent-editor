/** Corrections to how grapesjs-mjml's types read and write MJML. */

import type { Component, Editor } from "grapesjs";

type AttrToHTML = (this: Component) => Record<string, unknown>;

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
 */
export function fixPluginTypes(editor: Editor) {
  for (const type of editor.Components.getTypes()) {
    if (!type.id.startsWith("mj-")) continue;
    const base = (type.model.prototype as { getAttrToHTML: AttrToHTML }).getAttrToHTML;
    editor.Components.addType(type.id, {
      model: {
        defaults: { "style-default": {} },
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
