/**
 * Whether a key press should open the block search: a bare `/`, as on GitHub and YouTube.
 * Not ⌘K, which browsers on Windows and Linux keep for their own search bar.
 */
export function opensBlockSearch(
  e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "isComposing" | "target">,
): boolean {
  if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return false;
  // Typing a slash into a field, or into text being edited on the canvas, is just a slash.
  const target = e.target as { tagName?: string; isContentEditable?: boolean } | null;
  if (target?.isContentEditable) return false;
  // GrapesJS re-dispatches every key pressed in the canvas on its <iframe>, where the text
  // being edited is out of sight; the canvas document's own listener judges those.
  return !["INPUT", "TEXTAREA", "SELECT", "IFRAME"].includes(target?.tagName ?? "");
}
