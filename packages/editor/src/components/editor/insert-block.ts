/** The palette from the keyboard: GrapesJS's tiles can only be dragged. */

import type { Block, Component, Editor } from "grapesjs";

/** Makes a tile focusable and names the block it adds; GrapesJS sets these on the tile. */
export const tileAttributes = (id: string) => ({ tabindex: "0", role: "button", "data-block": id });

const tagOf = (c: Component) => String(c.get("tagName") ?? "");

function closest(c: Component | undefined, tag: string): Component | undefined {
  for (let cur = c; cur; cur = cur.parent() ?? undefined) if (tagOf(cur) === tag) return cur;
  return undefined;
}

/** `c`'s ancestor, or itself, whose parent is `parent`. */
function childOf(parent: Component, c: Component): Component {
  let cur = c;
  while (cur.parent() && cur.parent() !== parent) cur = cur.parent()!;
  return cur;
}

/**
 * Adds a block where a keyboard user means it: a section after the selected one, or last; an
 * element after the selected one or into the selected column, else in a section of its own.
 * Then selects it and, as a drop does, activates it (the image picker opens for an image).
 */
export function insertBlock(editor: Editor, block: Block): Component | undefined {
  const content = block.getContent();
  let body: Component | undefined;
  editor.getWrapper()?.onAll((c) => {
    if (!body && tagOf(c) === "mj-body") body = c;
  });
  if (typeof content !== "string" || !body) return undefined;

  const selected = editor.getSelected();
  const section = closest(selected, "mj-section");
  const afterSection = section ? { at: childOf(body, section).index() + 1 } : {};
  const column = closest(selected, "mj-column");
  let added: Component | undefined;
  if (/^\s*<mj-section\b/i.test(content)) {
    added = body.append(content, afterSection)[0];
  } else if (column && selected) {
    const at = selected === column ? {} : { at: childOf(column, selected).index() + 1 };
    added = column.append(content, at)[0];
  } else {
    const [wrapper] = body.append(
      `<mj-section><mj-column>${content}</mj-column></mj-section>`,
      afterSection,
    );
    added = wrapper?.components().at(0)?.components().at(0);
  }
  if (!added) return undefined;

  editor.select(added);
  if (block.get("activate")) added.getView()?.onActive(undefined as never);
  return added;
}
