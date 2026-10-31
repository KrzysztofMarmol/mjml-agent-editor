/**
 * An mj-table, which grapesjs-mjml has no type for. Its markup is kept as it was given and
 * never edited: parsed as HTML, rows outside a table were dropped and only their text kept,
 * so the first edit to an email with a table stored it flattened (see `withTableRowsKept`).
 */

import type { Component, Editor } from "grapesjs";

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

  // A column's children are table rows in the canvas, as the plugin renders its own.
  const cell = doc.createElement("td");
  cell.style.padding = attr("padding", "10px 25px");
  cell.append(table);
  return cell;
}

export function addTableType(editor: Editor) {
  editor.Components.addType("mj-table", {
    isComponent: (el: HTMLElement) =>
      el.tagName?.toLowerCase() === "mj-table" && {
        type: "mj-table",
        content: el.querySelector(":scope > template")?.innerHTML ?? "",
        components: [],
      },
    model: { defaults: { tagName: "mj-table", droppable: false, editable: false } },
    view: {
      tagName: "tr",
      updateContent(this: { el: HTMLElement; model: Component }) {
        const { el, model } = this;
        el.style.cssText = "pointer-events: all; display: table; width: 100%;";
        el.replaceChildren(
          tablePreview(el.ownerDocument, model.getAttributes(), String(model.get("content") ?? "")),
        );
      },
    },
  } as never);
}
