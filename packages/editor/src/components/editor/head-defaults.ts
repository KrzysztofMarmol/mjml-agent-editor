/**
 * What the document's mj-attributes give an element, for the canvas. The plugin compiles each
 * element alone, without the head, so mj-all, a tag's defaults and mj-class never reached the
 * canvas. They are resolved here and compiled as the element's own attributes: a head in the
 * compile would also reach the scaffold the plugin wraps an element in, and the plugin finds
 * the element in the result by its place in that scaffold. mj-style and mj-font need nothing:
 * the head draws them as styles.
 */

import type { Component } from "grapesjs";

type Attributes = Record<string, unknown>;

// What mj-social hands each icon, over mj-all; MJML's `getSocialElementAttributes`.
const SOCIAL_PASSED = [
  "border-radius",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "icon-size",
  "icon-height",
  "icon-padding",
  "text-padding",
  "line-height",
  "text-decoration",
];

const classNames = (c: Component | undefined) =>
  String(c?.getAttributes()["mj-class"] ?? "").split(" ");

/** The head's declarations, merged as MJML merges them across several mj-attributes. */
function declarations(root: Component) {
  const head = root.components().find((c: Component) => c.get("type") === "mj-head");
  const tags: Record<string, Attributes> = {};
  const classes: Record<string, Attributes> = {};
  const classChildren: Record<string, Record<string, Attributes>> = {};
  const own = (c: Component): Attributes => {
    const { style: _style, id: _id, ...attributes } = c.get("attributes") as Attributes;
    return attributes;
  };
  for (const block of head?.components().models ?? []) {
    if (block.get("tagName") !== "mj-attributes") continue;
    for (const c of block.components().models) {
      const tag = String(c.get("tagName"));
      if (tag !== "mj-class") {
        tags[tag] = { ...tags[tag], ...own(c) };
        continue;
      }
      const { name, ...attributes } = own(c);
      classes[String(name)] = { ...classes[String(name)], ...attributes };
      classChildren[String(name)] = {
        ...classChildren[String(name)],
        ...Object.fromEntries(c.components().map((d: Component) => [d.get("tagName"), own(d)])),
      };
    }
  }
  return { tags, classes, classChildren };
}

/**
 * In MJML's order: mj-all, then the tag's defaults, then its mj-classes (their css-classes
 * joined), then what the nearest ancestor's mj-classes give its tag. Its own attributes go
 * over these. MJML gives them to the body only, not to the head or the root.
 */
export function headAttributesOf(model: Component): Attributes {
  let root: Component | undefined = model;
  let inBody = false;
  while (root && root.get("type") !== "mjml") {
    inBody ||= root.get("type") === "mj-body";
    root = root.parent();
  }
  if (!root || !inBody) return {};
  const { tags, classes, classChildren } = declarations(root);
  const tag = String(model.get("tagName"));
  const all = { ...tags["mj-all"] };
  // MJML hands these down from the group, over mj-all; the plugin compiles the icon in it.
  if (tag === "mj-social-element") {
    for (const name of SOCIAL_PASSED) delete all[name];
    if (resolvedAttributesOf(model.parent())["inner-padding"]) delete all.padding;
  }
  const fromClasses: Attributes = {};
  for (const name of classNames(model)) {
    const joined = [fromClasses["css-class"], classes[name]?.["css-class"]].filter(Boolean);
    Object.assign(
      fromClasses,
      classes[name],
      joined.length > 1 && { "css-class": joined.join(" ") },
    );
  }
  let ancestor = model.parent();
  while (ancestor && ancestor.getAttributes()["mj-class"] === undefined) {
    ancestor = ancestor.parent();
  }
  const fromAncestor = Object.assign(
    {},
    ...classNames(ancestor).map((name) => classChildren[name]?.[tag]),
  ) as Attributes;
  return { ...all, ...tags[tag], ...fromClasses, ...fromAncestor };
}

/** What MJML takes as set: an empty value is never written, so the head's goes on applying. */
export const setAttributes = (attributes: Attributes): Attributes =>
  Object.fromEntries(Object.entries(attributes).filter(([, v]) => v !== undefined && v !== ""));

/** An element's attributes as MJML resolves them: the head's, then its own. */
export function resolvedAttributesOf(model: Component | undefined): Attributes {
  return model ? { ...headAttributesOf(model), ...setAttributes(model.getAttributes()) } : {};
}
