/**
 * Stable identifiers for sections and commentable elements.
 *
 * The MJML validator rejects non-standard attributes, so `css-class` is the only
 * legal place to carry metadata. Sections are tagged `sec-<id>`, individually
 * commentable elements `obj-<id>`.
 *
 * This module is the single source of truth for that scheme. The spike had two
 * divergent implementations — Python used `secrets.token_hex(4)` (8 hex chars)
 * while the editor used `Math.random().toString(36).slice(2, 10)` (up to 8 base36
 * chars, occasionally fewer). Everything now goes through `newId` below, which
 * keeps the Python shape so documents written by the spike stay readable.
 */

export const SECTION_PREFIX = "sec";
export const OBJECT_PREFIX = "obj";

export type IdPrefix = typeof SECTION_PREFIX | typeof OBJECT_PREFIX;

/** Characters an id may contain. Anything else is treated as "not an id token". */
const ID_CHARS = /^[A-Za-z0-9_-]+$/;

const ID_BYTES = 4;

/** 8 lowercase hex characters, from a cryptographic source. */
export function newId(): string {
  const bytes = new Uint8Array(ID_BYTES);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

export const newSectionId = newId;
export const newObjectId = newId;

function splitClassList(cssClass: string | null | undefined): string[] {
  return (cssClass ?? "").split(/\s+/).filter(Boolean);
}

function idOfToken(token: string, prefix: IdPrefix): string | null {
  if (!token.startsWith(`${prefix}-`)) return null;
  const id = token.slice(prefix.length + 1);
  return id.length > 0 && ID_CHARS.test(id) ? id : null;
}

/** Reads the `sec-`/`obj-` id out of a `css-class` value, or null when absent. */
export function readIdFromClassList(
  cssClass: string | null | undefined,
  prefix: IdPrefix,
): string | null {
  for (const token of splitClassList(cssClass)) {
    const id = idOfToken(token, prefix);
    if (id !== null) return id;
  }
  return null;
}

/**
 * Forces the class list to carry exactly this id for the prefix, dropping any
 * other `<prefix>-*` token. Used when replacing a section, where the caller owns
 * the identity and the model's suggestion must not win.
 */
export function setIdInClassList(
  cssClass: string | null | undefined,
  prefix: IdPrefix,
  id: string,
): string {
  const tokens = splitClassList(cssClass).filter((token) => idOfToken(token, prefix) === null);
  tokens.push(`${prefix}-${id}`);
  return tokens.join(" ");
}

/**
 * Returns the existing id if the class list already has one, otherwise appends a
 * freshly generated one. Never renames an element that is already identified —
 * those ids are anchors for comments.
 */
export function ensureIdInClassList(
  cssClass: string | null | undefined,
  prefix: IdPrefix,
  generate: () => string = newId,
): { cssClass: string; id: string } {
  const existing = readIdFromClassList(cssClass, prefix);
  if (existing !== null) return { cssClass: (cssClass ?? "").trim(), id: existing };
  const id = generate();
  return { cssClass: setIdInClassList(cssClass, prefix, id), id };
}
