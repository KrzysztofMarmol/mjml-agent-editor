/** When the sidebar turns to Settings on its own. Selecting from Layers leaves it alone. */

/**
 * After GrapesJS has handled a click on the canvas: the click landed on what is selected,
 * whether it selected it just now or it already was. A click that selected nothing, on the
 * empty canvas say, leaves the sidebar where it is.
 */
export function clickShowsSettings(
  selected: Pick<Element, "contains"> | undefined,
  target: EventTarget | null,
): boolean {
  // Not `instanceof Node`: the canvas's nodes belong to the iframe's window, not this one.
  return !!selected && !!target && selected.contains(target as Node);
}

/**
 * After a block is dropped: GrapesJS selected what it added, which it does only for a block
 * marked `select` or `activate`. `added` is a list when the block held several components.
 */
export function dropShowsSettings(added: unknown, selected: unknown): boolean {
  const first: unknown = Array.isArray(added) ? added[0] : added;
  return first !== undefined && first === selected;
}
