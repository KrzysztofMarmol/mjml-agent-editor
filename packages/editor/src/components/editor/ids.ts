/**
 * The ids the agent addresses elements by: `sec-<id>` on a section and `obj-<id>` on an element
 * inside one, kept in `css-class` because the MJML validator rejects any other attribute.
 */

import type { Component } from "grapesjs";

const ID_RE = { sec: /\bsec-([A-Za-z0-9_-]+)\b/, obj: /\bobj-([A-Za-z0-9_-]+)\b/ } as const;
type Prefix = keyof typeof ID_RE;

function idOf(c: Component, prefix: Prefix): string | null {
  return String(c.getAttributes()["css-class"] ?? "").match(ID_RE[prefix])?.[1] ?? null;
}

const newId = () => Math.random().toString(36).slice(2, 10);

export function sectionIdOf(c: Component): string | null {
  return idOf(c, "sec");
}

export function addIdClass(c: Component, prefix: Prefix): string {
  const existing = idOf(c, prefix);
  if (existing) return existing;
  const cssClass = String(c.getAttributes()["css-class"] ?? "");
  const id = newId();
  c.addAttributes({ "css-class": `${cssClass} ${prefix}-${id}`.trim() });
  return id;
}

/**
 * Gives an added subtree new ids wherever another element already has them. A duplicate or a
 * paste copies its original's `css-class`, and two sections answering to one `sec-*` make
 * comments and agent edits land on either.
 */
export function freshenCopiedIds(root: Component | undefined, added: Component) {
  const used = (prefix: Prefix, id: string, except: Component) => {
    let found = false;
    root?.onAll((o) => {
      if (o !== except && idOf(o, prefix) === id) found = true;
    });
    return found;
  };
  added.onAll((c) => {
    for (const prefix of ["sec", "obj"] as const) {
      const id = idOf(c, prefix);
      if (!id || !used(prefix, id, c)) continue;
      const cssClass = String(c.getAttributes()["css-class"]);
      c.addAttributes({ "css-class": cssClass.replace(`${prefix}-${id}`, `${prefix}-${newId()}`) });
    }
  });
}
