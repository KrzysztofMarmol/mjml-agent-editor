import type { Component, Editor } from "grapesjs";

export type WriteOptions = {
  /** A step of a drag: shown at once, recorded only when the drag ends. */
  partial?: boolean;
  /** Attributes to drop in the same change, such as longhands a shorthand replaces. */
  remove?: readonly string[];
};

/**
 * Writes one element's MJML attributes. On mj-image `src` is a model property, which the
 * plugin writes over the attribute.
 */
export function createWriter(editor: Editor, component: Component) {
  const isImage = String(component.get("tagName") || component.get("type")) === "mj-image";
  const read = (attr: string): string =>
    String(
      (attr === "src" && isImage ? component.get("src") : component.getAttributes()[attr]) ?? "",
    );
  const set = (attr: string, value: string, opts: { avoidStore?: boolean }) => {
    if (attr === "src" && isImage) component.set({ src: value }, opts);
    else if (value === "") component.removeAttributes([attr], opts);
    else component.addAttributes({ [attr]: value }, opts);
  };

  let dragFrom: { attr: string; value: string } | null = null;

  return async (attr: string, value: string, { partial, remove = [] }: WriteOptions = {}) => {
    // A write re-renders the element, which would drop text typed into it but not yet synced.
    if (editor.getEditing() === component) {
      const view = component.getView() as { syncContent?: () => Promise<void> } | undefined;
      await view?.syncContent?.();
    }
    if (partial) {
      dragFrom ??= { attr, value: read(attr) };
      set(attr, value, { avoidStore: true });
      return;
    }
    // A silent write leaves GrapesJS's `__p` marker in the attributes, where it would be
    // serialised, and only a real change clears it. Ending a drag on the value its last
    // step already showed is no change, so the start is put back first: the release is then
    // one real change, one undo step and one save.
    if (dragFrom?.attr === attr && dragFrom.value !== value) {
      set(attr, dragFrom.value, { avoidStore: true });
    }
    const dragged = dragFrom !== null;
    dragFrom = null;
    const present = remove.filter((a) => a in component.getAttributes());
    if (present.length) component.removeAttributes(present);
    set(attr, value, {});
    // A drag that ends where it began changes nothing, so nothing above cleared the marker.
    // It is the plugin that put it on the attributes object in place, and it goes the same way.
    if (dragged) delete (component.get("attributes") as Record<string, unknown>).__p;
  };
}
