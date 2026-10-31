/**
 * The Layers tab: rows named by what they hold ("Summer sale", "Shop now") rather than by tag,
 * each with an icon for its kind. GrapesJS renders the tree; this only names the rows.
 */

import type { Component, Editor } from "grapesjs";

import type { EditorLabels } from "../../labels.js";
import { NETWORKS } from "./inspector/schema.js";
import { parseNetwork } from "./inspector/values.js";

const svg = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

// Lucide icons, the set the rest of the editor uses.
const ICONS: Record<string, string> = {
  "mj-wrapper": svg(
    '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect width="10" height="10" x="7" y="7" rx="1"/>',
  ),
  "mj-section": svg('<rect width="20" height="12" x="2" y="6" rx="2"/>'),
  "mj-hero": svg('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/>'),
  "mj-group": svg(
    '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>',
  ),
  "mj-column": svg('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 3v18"/>'),
  "mj-text": svg('<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>'),
  "mj-image": svg(
    '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  ),
  "mj-button": svg('<rect width="20" height="10" x="2" y="7" rx="3"/><path d="M8 12h8"/>'),
  "mj-divider": svg('<path d="M5 12h14"/>'),
  "mj-spacer": svg('<path d="M12 3v18"/><path d="m8 17 4 4 4-4"/><path d="m8 7 4-4 4 4"/>'),
  "mj-social": svg(
    '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98"/><path d="m15.41 6.51-6.82 3.98"/>',
  ),
  "mj-social-element": svg(
    '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
  ),
  "mj-navbar": svg('<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>'),
  "mj-navbar-link": svg(
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  ),
  "mj-raw": svg('<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>'),
  "mj-table": svg(
    '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M12 3v18"/>',
  ),
};

function tagOf(c: Component): string {
  return String(c.get("tagName") || c.get("type") || "");
}

/**
 * The first line a reader sees of an element's content, most often its heading: tags dropped,
 * entities decoded. Without the line breaks a heading and its paragraph ran together.
 */
export function textOf(c: Component): string {
  // A template parses without running scripts or fetching images.
  const template = document.createElement("template");
  template.innerHTML = c.getInnerHTML();
  template.content
    .querySelectorAll("br, p, div, li, tr, h1, h2, h3, h4, h5, h6")
    .forEach((el) => el.after("\n"));
  const lines = (template.content.textContent ?? "").split("\n");
  const first = lines.map((l) => l.replace(/\s+/g, " ").trim()).find(Boolean) ?? "";
  return first.slice(0, 60);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

/** A row's name: the element's own words where it has any, else what kind of element it is. */
export function layerName(c: Component, labels: EditorLabels): string {
  const tag = tagOf(c);
  const kind = labels.elementNames[tag] ?? tag.replace(/^mj-/, "");
  const attributes = c.getAttributes() as Record<string, string | undefined>;
  switch (tag) {
    case "mj-text":
    case "mj-button":
    case "mj-navbar-link":
      return textOf(c) || kind;
    case "mj-image":
      return attributes.alt?.trim() || kind;
    case "mj-social-element": {
      const { network } = parseNetwork(String(attributes.name ?? ""));
      const option = NETWORKS.find((o) => o.value === network && network !== "custom");
      return (
        textOf(c) || (option && (labels.inspectorLabels[option.label] ?? option.label)) || kind
      );
    }
    case "mj-section":
    case "mj-wrapper":
    case "mj-hero": {
      // A section is known by its first words: its heading, most often.
      let words = "";
      c.onAll((d) => {
        if (!words && d !== c && ["mj-text", "mj-button"].includes(tagOf(d))) words = textOf(d);
      });
      return words || kind;
    }
    case "mj-column": {
      const columns =
        c
          .parent()
          ?.components()
          .filter((s: Component) => tagOf(s) === "mj-column") ?? [];
      return columns.length > 1 ? `${kind} ${columns.indexOf(c) + 1}` : kind;
    }
    default:
      return kind;
  }
}

// Elements whose children are their content — a text's paragraphs, a button's words — and
// not rows of their own.
const CONTENT = new Set(["mj-text", "mj-button", "mj-navbar-link", "mj-social-element", "mj-raw"]);

/** The canvas badge, which keeps saying what kind of element is under the pointer. */
export function badgeLabel(labels: EditorLabels) {
  return (c: Component) => {
    const tag = tagOf(c);
    const icon = ICONS[tag] ? `<div class="gjs-badge__icon">${ICONS[tag]}</div>` : "";
    const kind = labels.elementNames[tag] ?? tag.replace(/^mj-/, "");
    return `${icon}<div class="gjs-badge__name">${escapeHtml(kind)}</div>`;
  };
}

/**
 * Names and icons for the mj-* types. The names live in the layers only: GrapesJS's own
 * renaming is turned off in the sidebar, as a name set there is not MJML and would be lost.
 */
export function setupLayerNames(editor: Editor, labels: EditorLabels) {
  // Not stored and not undoable: it is how the tree shows the element, not the element.
  const hideContent = (c: Component) =>
    c.onAll((d) => d !== c && d.set("layerable", false, { avoidStore: true }));

  for (const type of editor.Components.getTypes()) {
    if (!type.id.startsWith("mj-")) continue;
    editor.Components.addType(type.id, {
      model: {
        // Ours whatever the element says: GrapesJS writes it into the row's markup as it is.
        getIcon() {
          return ICONS[type.id] ?? "";
        },
        // GrapesJS writes the name into the row's markup unescaped, and it is document text.
        getName(this: Component) {
          return escapeHtml(layerName(this, labels));
        },
        ...(CONTENT.has(type.id) && {
          // Editing a text replaces its children, so they are hidden again as they arrive.
          init(this: Component) {
            hideContent(this);
            this.listenTo(this.components(), "add reset", () => hideContent(this));
          },
        }),
      },
      // Runs the plugin's own `init` as well.
      extendFn: ["init"],
    } as never);
  }

  // A name follows its content, and a section's follows its children, so after any change
  // every row is re-read, once per frame.
  let pending = false;
  editor.on("update component:add component:remove", () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      editor.Layers.getRoot()?.onAll((c) => {
        const view = (c as { viewLayer?: { getInputName?: () => HTMLElement | null } }).viewLayer;
        const el = view?.getInputName?.();
        const name = layerName(c, labels);
        if (!el || el.textContent === name) return;
        el.textContent = name;
        el.parentElement?.setAttribute("title", name);
      });
    });
  });
}
