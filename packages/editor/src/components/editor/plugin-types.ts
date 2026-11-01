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
 * - A social icon's label is drawn: the plugin compiled the icon without it, then put the
 *   label inside the `<img>`, where nothing shows.
 */
export function fixPluginTypes(editor: Editor) {
  addTableType(editor);
  for (const type of editor.Components.getTypes()) {
    // mj-table is ours and serialises through GrapesJS's own escaping; this would add a second.
    if (!type.id.startsWith("mj-") || type.id === "mj-table") continue;
    const base = (type.model.prototype as { getAttrToHTML: AttrToHTML }).getAttrToHTML;
    const view = type.view.prototype as PluginView;
    editor.Components.addType(type.id, {
      ...(type.id === "mj-column" && { view: groupedColumnView(view) }),
      ...(type.id === "mj-group" && { view: redrawnGroupView(view) }),
      ...(type.id === "mj-social" && { view: stackedSocialGroupView(view) }),
      ...(type.id === "mj-social-element" && { view: socialIconView(view) }),
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
  getChildrenContainer(): HTMLElement;
  getInnerMjmlTemplate(): { start: string; end: string };
}

const inGroup = (column: Component) => column.parent()?.get("type") === "mj-group";

/**
 * The plugin draws a column by compiling it in a section beside empty siblings and taking the
 * column's element from the result. In a group, MJML gives that element its width inline, where
 * a section's column gets 100% and only a desktop rule; so a grouped column is compiled in a
 * group, and taken from one level further down.
 */
function groupedColumnView(base: PluginView): Partial<PluginView> {
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
 * them. Stacked it puts them in one table, a row each, so icons and labels share columns: the
 * group's cell is that grid, aligned as the group is, and each icon a row of it (a subgrid),
 * which keeps its own box to be selected by.
 */
export function socialLayout(mode: unknown, align: unknown) {
  if (mode !== "vertical") {
    return {
      icon: { display: "inline-table", gridColumn: "", gridTemplateColumns: "", alignItems: "" },
      column: { display: "", gridTemplateColumns: "", justifyContent: "" },
    };
  }
  const side = align === "left" ? "start" : align === "right" ? "end" : "center";
  return {
    icon: {
      display: "grid",
      gridColumn: "1 / -1",
      gridTemplateColumns: "subgrid",
      alignItems: "center",
    },
    column: { display: "grid", gridTemplateColumns: "auto auto", justifyContent: side },
  };
}

const groupLayout = (group: Component | undefined) => {
  const attributes = group?.getAttributes() ?? {};
  return socialLayout(attributes.mode, attributes.align);
};

/** The group's cell, laid out once its icons are in it: on load, and as icons come and go. */
function stackedSocialGroupView(base: PluginView): Partial<PluginView> {
  return {
    render(this: PluginView) {
      const drawn = base.render.call(this);
      Object.assign(this.getChildrenContainer().style, groupLayout(this.model).column);
      return drawn;
    },
  };
}

/** In a drawn icon, what holds its label: the link or span in the cell beside the icon's. */
export function socialLabel(icon: HTMLElement): HTMLElement | null {
  const row = icon.querySelector("tr");
  const cell = Array.from(row?.cells ?? []).find((td) => !td.querySelector("table"));
  return (cell?.firstElementChild as HTMLElement | null | undefined) ?? null;
}

function socialIconView(base: PluginView): Partial<PluginView> {
  return {
    // The label decides whether MJML draws a label cell, so a change to it redraws the icon.
    init(this: PluginView) {
      base.init.call(this);
      this.listenTo(this.model.components(), "add remove", this.render);
    },
    // A change to the group's attributes redraws its icons, so each lays out the cell as well.
    render(this: PluginView) {
      const drawn = base.render.call(this);
      const { icon, column } = groupLayout(this.model.parent());
      Object.assign(this.el.style, icon);
      // The table's own rows step aside, so its cells sit in the group's columns.
      if (icon.display === "grid") {
        for (const part of this.el.querySelectorAll<HTMLElement>(
          ":scope > tbody, :scope > tbody > tr",
        )) {
          part.style.display = "contents";
        }
      }
      if (this.el.parentElement) Object.assign(this.el.parentElement.style, column);
      return drawn;
    },
    // With its label, so MJML draws the label's cell, and on the side `icon-position` says.
    getInnerMjmlTemplate(this: PluginView) {
      const { start, end } = base.getInnerMjmlTemplate.call(this);
      return { start: `${start}${this.model.getInnerHTML()}`, end };
    },
    // The label's components are drawn in that cell; the plugin's container is the `<img>`.
    getChildrenContainer(this: PluginView) {
      return socialLabel(this.el) ?? base.getChildrenContainer.call(this);
    },
  };
}
