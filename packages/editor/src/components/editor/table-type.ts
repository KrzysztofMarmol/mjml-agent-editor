/**
 * An mj-table, which grapesjs-mjml has no type for. Its markup is kept as it was given and
 * never edited: parsed as HTML, rows outside a table were dropped and only their text kept,
 * so the first edit to an email with a table stored it flattened (see `withTableRowsKept`).
 */

import { isSafeLink } from "@mjml-agent-editor/core";
import type { Component, Editor } from "grapesjs";

const DROPPED = "script, style, link, iframe, frame, object, embed, applet, base, meta";
const LINK_ATTRIBUTES = new Set(["href", "xlink:href", "action", "formaction"]);

/**
 * What GrapesJS's parser removes everywhere else, removed from the rows too: it never looks
 * inside a template. Scripts and embeds, `on…` handlers, links with another scheme.
 */
function cleanRows(rows: DocumentFragment) {
  rows.querySelectorAll(DROPPED).forEach((el) => el.remove());
  rows.querySelectorAll("*").forEach((el) => {
    for (const { name, value } of [...el.attributes]) {
      const lower = name.toLowerCase();
      const script = /^(java|vb)script:/i.test(value.replace(/[\u0000-\u0020]/g, ""));
      if (lower.startsWith("on") || script || (LINK_ATTRIBUTES.has(lower) && !isSafeLink(value))) {
        el.removeAttribute(name);
      }
    }
  });
}

// A column's children are table rows in the canvas, as the plugin renders its own.
const ROW_STYLE = "pointer-events: all; display: table; width: 100%;";

/**
 * The table as the canvas shows it: its rows and cells as text, aligned as written. Built from
 * an inert template rather than written as HTML, so nothing in the cells runs or loads.
 */
export function tablePreview(doc: Document, attributes: Record<string, unknown>, rows: string) {
  const attr = (name: string, fallback: string) => String(attributes[name] ?? fallback);
  const template = doc.createElement("template");
  template.innerHTML = `<table>${rows}</table>`;

  const table = doc.createElement("table");
  table.setAttribute("cellpadding", String(parseInt(attr("cellpadding", "0"), 10) || 0));
  table.setAttribute("cellspacing", String(parseInt(attr("cellspacing", "0"), 10) || 0));
  Object.assign(table.style, {
    width: attr("width", "100%"),
    border: attr("border", "none"),
    color: attr("color", "#000000"),
    fontFamily: attr("font-family", "Ubuntu, Helvetica, Arial, sans-serif"),
    fontSize: attr("font-size", "13px"),
    lineHeight: attr("line-height", "22px"),
    tableLayout: attr("table-layout", "auto"),
  });
  for (const row of template.content.querySelectorAll("tr")) {
    const tr = table.insertRow();
    for (const cell of row.querySelectorAll(":scope > th, :scope > td")) {
      const copy = doc.createElement(cell.tagName.toLowerCase());
      copy.textContent = cell.textContent;
      const align = cell.getAttribute("align");
      if (align && /^(left|right|center)$/i.test(align)) copy.setAttribute("align", align);
      tr.append(copy);
    }
  }

  const cell = doc.createElement("td");
  cell.style.padding = attr("padding", "10px 25px");
  cell.append(table);
  return cell;
}

export function addTableType(editor: Editor) {
  const base = editor.Components.getType("default")!.view.prototype as {
    updateAttributes: (...args: unknown[]) => void;
  };
  editor.Components.addType("mj-table", {
    isComponent: (el: HTMLElement) => {
      if (el.tagName?.toLowerCase() !== "mj-table") return false;
      const rows = el.querySelector<HTMLTemplateElement>(":scope > template");
      if (rows) cleanRows(rows.content);
      return { type: "mj-table", content: rows?.innerHTML ?? "", components: [] };
    },
    model: { defaults: { tagName: "mj-table", droppable: false, editable: false } },
    view: {
      tagName: "tr",
      // GrapesJS clears the element's attributes, style among them, when the model's change.
      updateAttributes(this: { el: HTMLElement }, ...args: unknown[]) {
        base.updateAttributes.apply(this, args);
        this.el.style.cssText = ROW_STYLE;
      },
      updateContent(this: { el: HTMLElement; model: Component }) {
        const { el, model } = this;
        el.style.cssText = ROW_STYLE;
        el.replaceChildren(
          tablePreview(el.ownerDocument, model.getAttributes(), String(model.get("content") ?? "")),
        );
      },
    },
  } as never);
}
