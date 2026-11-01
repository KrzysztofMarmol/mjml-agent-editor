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
 * - A column in a group is drawn as MJML writes it there, side by side on a phone too: the
 *   plugin drew every column as a section's, which the Mobile view stacked.
 * - An mj-table keeps its rows.
 * - An image without a picture is saved without one.
 * - Stacked social icons are drawn stacked: the plugin drew them in a row whatever the mode.
 */
export function fixPluginTypes(editor: Editor) {
  addTableType(editor);
  for (const type of editor.Components.getTypes()) {
    // mj-table is ours and serialises through GrapesJS's own escaping; this would add a second.
    if (!type.id.startsWith("mj-") || type.id === "mj-table") continue;
    const base = (type.model.prototype as { getAttrToHTML: AttrToHTML }).getAttrToHTML;
    const view = type.view.prototype as PluginView;
    editor.Components.addType(type.id, {
      ...(type.id === "mj-column" && { view: groupedPluginView(view) }),
      ...(type.id === "mj-group" && { view: redrawnGroupView(view) }),
      ...(type.id === "mj-social-element" && { view: stackedSocialView(view) }),
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

interface PluginView {
  model: Component;
  el: HTMLElement;
  init(): void;
  render(): unknown;
  listenTo(target: unknown, events: string, callback: () => unknown): void;
  getMjmlTemplate(): { start: string; end: string };
  getTemplateFromEl(container: HTMLElement): HTMLElement | null;
}

const inGroup = (column: Component) => column.parent()?.get("type") === "mj-group";

/**
 * The plugin draws a column by compiling it in a section beside empty siblings and taking the
 * column's element from the result. In a group, MJML gives that element its width inline, where
 * a section's column gets 100% and only a desktop rule; so a grouped column is compiled in a
 * group, and taken from one level further down.
 */
function groupedPluginView(base: PluginView): Partial<PluginView> {
  return {
    getMjmlTemplate(this: PluginView) {
      if (!inGroup(this.model)) return base.getMjmlTemplate.call(this);
      const siblings = "<mj-column></mj-column>".repeat(
        Math.max((this.model.collection?.length ?? 1) - 1, 0),
      );
      // A px width is a share of the group, so the template carries the widths around it. The
      // section's padding is left out; it narrows a px column's share a little on Mobile only.
      const width = (c: Component | undefined) => {
        const value = c?.getAttributes().width;
        return typeof value === "string" && value ? ` width="${value.replace(/"/g, "")}"` : "";
      };
      let body: Component | undefined = this.model;
      while (body && body.get("type") !== "mj-body") body = body.parent();
      return {
        start: `<mjml><mj-body${width(body)}><mj-section><mj-group${width(this.model.parent())}>`,
        end: `${siblings}</mj-group></mj-section></mj-body></mjml>`,
      };
    },
    getTemplateFromEl(this: PluginView, container: HTMLElement) {
      if (!inGroup(this.model)) return base.getTemplateFromEl.call(this, container);
      return (
        (container.firstChild as HTMLElement | null)?.querySelector(
          "div > table > tbody > tr > td > div > div",
        ) ?? null
      );
    },
  };
}

/**
 * A group redraws its columns when one arrives or leaves, as the plugin's section does for its
 * own: each column's drawn width depends on how many share the group.
 */
function redrawnGroupView(base: PluginView): Partial<PluginView> {
  return {
    init(this: PluginView) {
      base.init.call(this);
      this.listenTo(this.model.components(), "add remove", this.render);
    },
  };
}

/**
 * How social icons sit in the canvas. In a row MJML lays them inline, as the plugin draws
 * them. Stacked it puts them in one table, a row each: they share a column, aligned as the
 * group is, with their left edges in line.
 */
export function socialLayout(mode: unknown, align: unknown) {
  if (mode !== "vertical") {
    return {
      icon: { display: "inline-table" },
      column: { display: "", justifyContent: "", justifyItems: "" },
    };
  }
  const side = align === "left" ? "start" : align === "right" ? "end" : "center";
  return {
    icon: { display: "table" },
    column: { display: "grid", justifyContent: side, justifyItems: "start" },
  };
}

/**
 * The plugin redraws every icon whenever its group changes, so an icon lays out the group's
 * cell as well as itself.
 */
function stackedSocialView(base: PluginView): Partial<PluginView> {
  return {
    render(this: PluginView) {
      const drawn = base.render.call(this);
      const group = this.model.parent()?.getAttributes() ?? {};
      const { icon, column } = socialLayout(group.mode, group.align);
      Object.assign(this.el.style, icon);
      if (this.el.parentElement) Object.assign(this.el.parentElement.style, column);
      return drawn;
    },
  };
}
