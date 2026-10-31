/**
 * Tags the visual editor cannot keep or show. GrapesJS flattens an mj-table's rows into
 * text when it loads one, and the next save stores that; an mj-hero holds content outside
 * any section, where neither the section tools nor comments reach; the editor has no way to
 * render or edit an accordion or a carousel.
 */
export const UNEDITABLE_TAGS = ["mj-table", "mj-hero", "mj-accordion", "mj-carousel"] as const;

// A tag inside a comment is not an element, and counting it would let a write that removes
// the comment add a real one unnoticed.
function count(mjml: string, tag: string): number {
  const elements = mjml.replace(/<!--[\s\S]*?-->/g, "");
  return (elements.match(new RegExp(`<${tag}(?=[\\s/>])`, "gi")) ?? []).length;
}

/**
 * The uneditable tags a write would add. Only additions are refused: a document that
 * already holds one, from before this rule, stays writable.
 */
export function addedUneditableTags(before: string, after: string): string[] {
  return UNEDITABLE_TAGS.filter((tag) => count(after, tag) > count(before, tag));
}
