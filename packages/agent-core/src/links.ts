/** The link schemes an email may hold. Shared by the editor's fields and both agent backends. */
export const LINK_SCHEMES = ["http", "https", "mailto", "tel", "sms"] as const;
const SCHEMES = new Set<string>(LINK_SCHEMES);

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
    .replace(/[\u0000- ]/g, "");
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(decoded)?.[1];
  return !scheme || SCHEMES.has(scheme.toLowerCase());
}

/**
 * A navigation link as MJML writes it: the bar's `base-url` in front of the link's `href`.
 * Each can look harmless alone, `javascript` and `:alert(1)`, so they are checked joined.
 */
export function isSafeNavbarLink(baseUrl: string, href: string): boolean {
  return isSafeLink(baseUrl) && isSafeLink(href) && isSafeLink(baseUrl + href);
}

const LINK =
  /[\s/"'](?:xlink:)?(?:href|action|formaction)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const NAVBAR = /<mj-navbar\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/mj-navbar\s*>/gi;
const BASE_URL = /[\s"']base-url\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

const TAG = /<[a-z][^\s/>]*(?:[^>"']|"[^"]*"|'[^']*')*>/gi;

// Inside tags only: a text that mentions `href=` is not a link.
const linksIn = (markup: string) =>
  (markup.match(TAG) ?? []).flatMap((tag) =>
    [...tag.matchAll(LINK)].map((m) => m[1] ?? m[2] ?? m[3] ?? ""),
  );

/** Every link in the MJML, an element's or one inside a text's HTML, that is not safe. */
export function unsafeLinks(mjml: string): string[] {
  const source = mjml.replace(/<!--[\s\S]*?-->/g, "");
  const found = linksIn(source).filter((link) => !isSafeLink(link));
  for (const [, attributes = "", inner = ""] of source.matchAll(NAVBAR)) {
    const m = BASE_URL.exec(attributes);
    const base = m ? (m[1] ?? m[2] ?? m[3] ?? "") : "";
    if (!isSafeLink(base)) found.push(base);
    for (const href of linksIn(inner)) {
      if (isSafeLink(href) && !isSafeLink(base + href)) found.push(base + href);
    }
  }
  return found;
}

/**
 * The unsafe links a write would add. Only additions are refused: a document that already
 * holds one, from before this rule, stays writable.
 */
export function addedUnsafeLinks(before: string, after: string): string[] {
  const known = unsafeLinks(before);
  return unsafeLinks(after).filter((link) => {
    const i = known.indexOf(link);
    if (i === -1) return true;
    known.splice(i, 1);
    return false;
  });
}
