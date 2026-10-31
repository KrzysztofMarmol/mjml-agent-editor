/**
 * Tags the visual editor cannot keep or show. GrapesJS flattens an mj-table's rows into
 * text when it loads one, and the next save stores that; an mj-hero holds content outside
 * any section, where neither the section tools nor comments reach; the editor has no way to
 * render or edit an accordion or a carousel.
 */
export const UNEDITABLE_TAGS = ["mj-table", "mj-hero", "mj-accordion", "mj-carousel"] as const;

function count(mjml: string, tag: string): number {
  return (mjml.match(new RegExp(`<${tag}(?=[\\s/>])`, "gi")) ?? []).length;
}

/**
 * The uneditable tags a write would add. Only additions are refused: a document that
 * already holds one, from before this rule, stays writable.
 */
export function addedUneditableTags(before: string, after: string): string[] {
  return UNEDITABLE_TAGS.filter((tag) => count(after, tag) > count(before, tag));
}
