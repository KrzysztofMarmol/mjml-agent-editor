/** Reading and writing attribute values the way MJML spells them. */

import type { Unit } from "./types.js";

export const SIDES = ["top", "right", "bottom", "left"] as const;
export type Sides = [string, string, string, string];

/** CSS shorthand order: one value for all, two for vertical/horizontal, three, or four. */
export function expandBox(value: string): Sides | null {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 4) return null;
  const [t, r = t, b = t, l = r] = parts as [string, string?, string?, string?];
  return [t, r, b, l];
}

/**
 * Each side as MJML resolves it: a `-top`-style longhand wins over the shorthand, and a side
 * neither sets is empty. Agents write both forms, so reading only one showed wrong values.
 */
export function readBox(attributes: Readonly<Record<string, string>>, attr: string): Sides {
  const short = expandBox(attributes[attr] ?? "") ?? ["", "", "", ""];
  return SIDES.map((side, i) => attributes[`${attr}-${side}`] ?? short[i]!) as Sides;
}

/** The shortest shorthand for four sides; empty sides become `0`. */
export function boxShorthand(sides: Sides): string {
  const [t, r, b, l] = sides.map((s) => s.trim() || "0") as Sides;
  if (t === b && r === l) return t === r ? t : `${t} ${r}`;
  if (r === l) return `${t} ${r} ${b}`;
  return `${t} ${r} ${b} ${l}`;
}

export type Length = { amount: string; unit: Unit };

/** `"20px"` to `{ amount: "20", unit: "px" }`; null for anything that is not one length. */
export function parseLength(value: string, units: readonly Unit[]): Length | null {
  const match = /^(-?\d*\.?\d+)\s*(px|%|em)?$/.exec(value.trim());
  if (!match) return null;
  const unit = (match[2] ?? "") as Unit;
  return units.includes(unit) ? { amount: match[1]!, unit } : null;
}

const NO_SHARE = "-noshare";

/**
 * mj-social-element names a network and, without `-noshare`, makes the icon open a "share
 * this page" dialog instead of linking to the profile. Custom has no share variant.
 */
export function parseNetwork(name: string): { network: string; share: boolean } {
  return name.endsWith(NO_SHARE)
    ? { network: name.slice(0, -NO_SHARE.length), share: false }
    : { network: name, share: name !== "custom" && name !== "" };
}

export function networkName(network: string, share: boolean): string {
  return share || network === "custom" ? network : `${network}${NO_SHARE}`;
}

const LINK_SCHEMES = new Set(["http", "https", "mailto", "tel", "sms"]);

/**
 * Whether a link may be written: web, mail and phone links, and those without a scheme
 * (relative, or a merge tag the sender fills in). Not `javascript:`, which the preview, the
 * export and some mail clients would run. Read as a browser reads an href: entities decoded,
 * and tabs, newlines and control characters ignored.
 */
export function isSafeLink(value: string): boolean {
  const decoded = value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&colon;/g, ":")
    .replace(/&(Tab|NewLine);/g, "")
    .replace(/[\u0000-\u0020]/g, "");
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(decoded)?.[1];
  return !scheme || LINK_SCHEMES.has(scheme.toLowerCase());
}

/**
 * A navigation link as MJML writes it: the bar's `base-url` in front of the link's `href`.
 * Each can look harmless alone, `javascript` and `:alert(1)`, so they are checked joined.
 */
export function isSafeNavbarLink(baseUrl: string, href: string): boolean {
  return isSafeLink(baseUrl) && isSafeLink(href) && isSafeLink(baseUrl + href);
}
