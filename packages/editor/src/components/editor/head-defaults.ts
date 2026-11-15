/**
 * The document's mj-attributes, for the canvas. The plugin compiles each element alone, in a
 * document of its own without a head, so mj-all, a tag's defaults and mj-class never reached
 * the canvas. mj-style and mj-font need nothing: the head draws them as styles.
 */

import type { Component } from "grapesjs";

function headOf(model: Component): Component | undefined {
  let root: Component | undefined = model;
  while (root && root.get("type") !== "mjml") root = root.parent();
  return root?.components().find((c: Component) => c.get("type") === "mj-head");
}

const attributeBlocks = (head: Component): Component[] =>
  head.components().filter((c: Component) => c.get("tagName") === "mj-attributes");

// The mj-attributes each mj-head holds, as MJML, until something in that head changes.
const cache = new WeakMap<Component, string>();

/** The head's mj-attributes as MJML, for an element's own compile. */
export function headDefaultsOf(model: Component): string {
  const head = headOf(model);
  if (!head) return "";
  let defaults = cache.get(head);
  if (defaults === undefined) {
    defaults = attributeBlocks(head)
      .map((c) => c.toHTML())
      .join("");
    cache.set(head, defaults);
  }
  return defaults;
}

/** A body element's template with a head of `defaults`; mj-style's and mj-font's have one. */
export function withHeadDefaults(template: { start: string; end: string }, defaults: string) {
  if (!defaults || !template.start.startsWith("<mjml>") || template.start.includes("<mj-head")) {
    return template;
  }
  return { ...template, start: `<mjml><mj-head>${defaults}</mj-head>${template.start.slice(6)}` };
}

/**
 * What the head gives an element that is not compiled (mj-table), in MJML's order: mj-all,
 * then its tag's defaults, then its mj-classes. Its own attributes go over these.
 */
export function headAttributesOf(model: Component): Record<string, unknown> {
  const head = headOf(model);
  const sets = head ? attributeBlocks(head).flatMap((c) => c.components().models) : [];
  const named = (tag: string) => sets.filter((c) => c.get("tagName") === tag);
  const classes = String(model.getAttributes()["mj-class"] ?? "").split(/\s+/);
  const resolved: Record<string, unknown> = {};
  for (const set of [
    ...named("mj-all"),
    ...named(String(model.get("tagName"))),
    ...classes.flatMap((name) => named("mj-class").filter((c) => c.getAttributes().name === name)),
  ]) {
    Object.assign(resolved, set.getAttributes());
  }
  delete resolved.name;
  return resolved;
}

/** On mj-head: a change anywhere in it redraws the body, every element from the new defaults. */
export function redrawOnHeadChange(this: Component) {
  this.on("component:update component:update-inside", () => {
    cache.delete(this);
    const body = this.parent()
      ?.components()
      .find((c: Component) => c.get("type") === "mj-body");
    (body?.view as { render(): unknown } | undefined)?.render();
  });
}
