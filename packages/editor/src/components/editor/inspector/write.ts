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
 *
 * `blocked` is asked as the write lands, after any wait: an agent turn can lock the editor
 * while a text's typing is being synced.
 */
export function createWriter(
  editor: Editor,
  component: Component,
  blocked: () => boolean = () => false,
) {
  const isImage = String(component.get("tagName") || component.get("type")) === "mj-image";
  // The attributes as MJML has them: without GrapesJS's `__p` marker and the plugin's style.
  const current = (): Attributes => {
    const { __p: _marker, style: _style, ...rest } = component.get("attributes") as Attributes;
    return rest;
  };

  // The drag under way: its attribute and the attributes before its first step, which its
  // release is recorded as changing.
  let drag: { attr: string; start: Attributes } | null = null;

  // Records the attributes now as one change from `start`: the steps were silent, so the start
  // goes back silently first. None when they end where they began.
  const record = (start: Attributes, end: Attributes) => {
    component.setAttributes(start, { avoidStore: true });
    if (!same(end, start)) component.setAttributes(end);
    // A silent write leaves the `__p` marker on the attributes object, put there in place by
    // the plugin's mirror; a real change clears it, and when there was none it goes the same way.
    delete (component.get("attributes") as Attributes).__p;
  };

  return async (attr: string, value: string, { partial, remove = [] }: WriteOptions = {}) => {
    // A write re-renders the element, which would drop text typed into it but not yet synced.
    if (editor.getEditing() === component) {
      const view = component.getView() as { syncContent?: () => Promise<void> } | undefined;
      await view?.syncContent?.();
    }
    if (blocked()) return;
    // Another field written mid-drag ends the drag first, so each keeps its own undo step.
    if (drag && drag.attr !== attr) {
      const { start } = drag;
      drag = null;
      record(start, current());
    }
    if (attr === "src" && isImage) return void component.set({ src: value });

    const next = current();
    for (const name of remove) delete next[name];
    if (value === "") delete next[attr];
    else next[attr] = value;

    if (partial) {
      drag ??= { attr, start: current() };
      component.setAttributes(next, { avoidStore: true });
      return;
    }
    const start = drag?.start ?? current();
    drag = null;
    record(start, next);
  };
}
