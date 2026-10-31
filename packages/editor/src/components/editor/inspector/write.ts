import type { Component, Editor } from "grapesjs";

export type WriteOptions = {
  /** A step of a drag: shown at once, recorded only when the drag ends. */
  partial?: boolean;
  /** Attributes to drop in the same change, such as longhands a shorthand replaces. */
  remove?: readonly string[];
};

type Attributes = Record<string, unknown>;

function same(a: Attributes, b: Attributes): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => k in b && a[k] === b[k]);
}

/**
 * Writes one element's MJML attributes. On mj-image `src` is a model property, which the
 * plugin writes over the attribute.
 *
 * Every write replaces the whole attribute set at once: the plugin mirrors attributes into a
 * style object and back, and a removal followed by an addition, made silently, came back
 * from that mirror with the removed attribute still in it.
 */
export function createWriter(editor: Editor, component: Component) {
  const isImage = String(component.get("tagName") || component.get("type")) === "mj-image";
  // The attributes as MJML has them: without GrapesJS's `__p` marker and the plugin's style.
  const current = (): Attributes => {
    const { __p: _marker, style: _style, ...rest } = component.get("attributes") as Attributes;
    return rest;
  };

  // The attributes before a drag's first step, which its release is recorded as changing.
  let dragStart: Attributes | null = null;

  return async (attr: string, value: string, { partial, remove = [] }: WriteOptions = {}) => {
    // A write re-renders the element, which would drop text typed into it but not yet synced.
    if (editor.getEditing() === component) {
      const view = component.getView() as { syncContent?: () => Promise<void> } | undefined;
      await view?.syncContent?.();
    }
    if (attr === "src" && isImage) return void component.set({ src: value });

    const next = current();
    for (const name of remove) delete next[name];
    if (value === "") delete next[attr];
    else next[attr] = value;

    if (partial) {
      dragStart ??= current();
      component.setAttributes(next, { avoidStore: true });
      return;
    }
    const start = dragStart ?? current();
    // The drag's steps were silent. Its start goes back silently too, so the release is one
    // real change from it: one undo step and one save, or none when it ends where it began.
    if (dragStart) component.setAttributes(dragStart, { avoidStore: true });
    dragStart = null;
    if (!same(next, start)) component.setAttributes(next);
    // A silent write leaves the `__p` marker on the attributes object, put there in place by
    // the plugin's mirror; a real change clears it, and when there was none it goes the same way.
    delete (component.get("attributes") as Attributes).__p;
  };
}
