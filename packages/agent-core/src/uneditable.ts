/**
 * Tags the visual editor cannot edit. It keeps an mj-table's rows as they are, with no way
 * to change them; an mj-hero holds content outside any section, where neither the section
 * tools nor comments reach; the editor has no way to render or edit an accordion or a carousel.
 */
export const UNEDITABLE_TAGS = ["mj-table", "mj-hero", "mj-accordion", "mj-carousel"] as const;

// A comment, or a tag with its quoted values, so that `<!--` inside a value starts no comment.
const TOKEN = /<!--[\s\S]*?(?:-->|$)|<([a-z][^\s/>]*)(?:[^>"']|"[^"]*"|'[^']*')*/gi;

// A tag inside a comment is not an element, and counting it would let a write that removes
// the comment add a real one unnoticed.
function count(mjml: string, tag: string): number {
  let n = 0;
  for (const [, name] of mjml.matchAll(TOKEN)) if (name?.toLowerCase() === tag) n++;
  return n;
}

/**
 * The uneditable tags a write would add. Only additions are refused: a document that
 * already holds one, from before this rule, stays writable.
 */
export function addedUneditableTags(before: string, after: string): string[] {
  return UNEDITABLE_TAGS.filter((tag) => count(after, tag) > count(before, tag));
}
