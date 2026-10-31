/** Changes to what an element holds rather than to its attributes: columns, links, networks. */

import type { Component } from "grapesjs";

function tagOf(c: Component): string {
  return String(c.get("tagName") || c.get("type") || "");
}

/** Column proportions offered for a section of two or three columns; equal sets no widths. */
export const COLUMN_RATIOS: Readonly<Record<number, readonly (readonly number[])[]>> = {
  2: [
    [1, 1],
    [1, 2],
    [2, 1],
  ],
  3: [
    [1, 1, 1],
    [1, 2, 1],
  ],
};

/** A section's columns, when columns are all it holds; a column group is left alone. */
export function columnsOf(section: Component): Component[] | null {
  const children = section.components().models;
  return children.length > 0 && children.every((c) => tagOf(c) === "mj-column") ? children : null;
}

/** Percent widths for a ratio, to two decimals, or null where MJML's equal split does. */
export function ratioWidths(ratio: readonly number[]): string[] | null {
  if (ratio.every((r) => r === ratio[0])) return null;
  const total = ratio.reduce((a, b) => a + b, 0);
  return ratio.map((r) => `${Math.round((r / total) * 10000) / 100}%`);
}

/** The ratio the columns' widths already have, if it is one of the offered. */
export function currentRatio(columns: Component[]): readonly number[] | null {
  const widths = columns.map((c) => String(c.getAttributes().width ?? ""));
  return (
    COLUMN_RATIOS[columns.length]?.find((ratio) => {
      const want = ratioWidths(ratio);
      if (!want) return widths.every((w) => w === "");
      return widths.every(
        (w, i) => /%$/.test(w) && Math.abs(parseFloat(w) - parseFloat(want[i]!)) < 0.5,
      );
    }) ?? null
  );
}

/** Sets every column's width in one change, so it is one undo step. */
export function setRatio(columns: Component[], ratio: readonly number[]) {
  const widths = ratioWidths(ratio);
  columns.forEach((c, i) => {
    if (widths) c.addAttributes({ width: widths[i]! });
    else c.removeAttributes(["width"]);
  });
}

// Networks a new social link starts as, in order, each linking to the site until edited.
const PROFILE_URLS: Readonly<Record<string, string>> = {
  facebook: "https://facebook.com/",
  instagram: "https://instagram.com/",
  x: "https://x.com/",
  linkedin: "https://linkedin.com/",
  youtube: "https://youtube.com/",
  pinterest: "https://pinterest.com/",
  github: "https://github.com/",
};

/** Adds the first common network the group does not have yet, as a profile link. */
export function addNetwork(social: Component): Component {
  const present = new Set(
    social
      .components()
      .map((c: Component) => String(c.getAttributes().name ?? "").replace(/-noshare$/, "")),
  );
  const network = Object.keys(PROFILE_URLS).find((n) => !present.has(n)) ?? "facebook";
  // As markup: the plugin's types are recognised by tag, and a type alone renders a <div>.
  return social.append(
    `<mj-social-element name="${network}-noshare" href="${PROFILE_URLS[network]}"></mj-social-element>`,
  )[0]!;
}

export function addNavbarLink(navbar: Component, text: string): Component {
  return navbar.append(`<mj-navbar-link>${escapeHtml(text)}</mj-navbar-link>`)[0]!;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
