/** The link schemes an email may hold. Shared by the editor's fields and both agent backends. */
export const LINK_SCHEMES = ["http", "https", "mailto", "tel", "sms"] as const;
const SCHEMES = new Set<string>(LINK_SCHEMES);

// What the browser makes of a numeric reference out of Unicode's range, where JS would throw.
const codePoint = (n: number) => (n > 0x10ffff ? "�" : String.fromCodePoint(n));

/**
 * Whether a link may be written: web, mail and phone links, and those without a scheme
 * (relative, or a merge tag the sender fills in). Not `javascript:`, which the preview, the
 * export and some mail clients would run. Read as a browser reads an href: entities decoded,
 * and tabs, newlines and control characters ignored.
 */
export function isSafeLink(value: string): boolean {
  const decoded = value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => codePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);?/g, (_, dec: string) => codePoint(Number(dec)))
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

const LINK_ATTRIBUTES = new Set(["href", "xlink:href", "action", "formaction"]);
// Elements that exist to run or embed something; an email has no use for any of them.
const RUNNING_TAGS = new Set([
  "script",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "base",
  "animate",
  "set",
]);

// ASCII only, here and in the Python twin, so both read the same input the same way. Each
// alternative runs to the end of the input rather than failing, which keeps a scan linear.
const TAG_NAME = /[A-Za-z][^\t\n\f\r />]*/y;
const ATTRIBUTE =
  /[\t\n\f\r /]*([^\t\n\f\r />][^\t\n\f\r />=]*)(?:[\t\n\f\r ]*=[\t\n\f\r ]*(?:"([^"]*)"?|'([^']*)'?|([^\t\n\f\r >]*)))?/y;

/**
 * What in compiled HTML could run: a link with any other scheme than `LINK_SCHEMES`, an `on…`
 * handler, an element such as `<script>` or `<iframe>`. Read as a browser tokenises tags, so a
 * quote cannot hide one, and inside comments too, where Outlook reads conditional markup.
 * Checked on the compiled email because MJML adds what the source does not say: a navbar's
 * `base-url` from `mj-attributes` or an `mj-class`, joined to each of its links.
 */
export function unsafeMarkup(html: string): string[] {
  const found: string[] = [];
  let i = html.indexOf("<");
  while (i !== -1) {
    TAG_NAME.lastIndex = i + 1;
    const name = TAG_NAME.exec(html)?.[0];
    let end = i + 1;
    if (name) {
      if (RUNNING_TAGS.has(name.toLowerCase())) found.push(`<${name.toLowerCase()}>`);
      end = TAG_NAME.lastIndex;
      while (end < html.length && html[end] !== ">") {
        ATTRIBUTE.lastIndex = end;
        const m = ATTRIBUTE.exec(html);
        if (!m || ATTRIBUTE.lastIndex === end) {
          end++;
          continue;
        }
        end = ATTRIBUTE.lastIndex;
        const attribute = m[1]!.toLowerCase();
        const value = m[2] ?? m[3] ?? m[4] ?? "";
        if (/^on./.test(attribute)) found.push(attribute);
        else if (LINK_ATTRIBUTES.has(attribute) && !isSafeLink(value)) found.push(value);
      }
    }
    i = html.indexOf("<", end);
  }
  return found;
}

/** What `after` holds more of than `before`: a write is refused only for what it adds. */
export function addedItems(after: readonly string[], before: readonly string[]): string[] {
  const known = new Map<string, number>();
  for (const item of before) known.set(item, (known.get(item) ?? 0) + 1);
  return after.filter((item) => {
    const left = known.get(item) ?? 0;
    if (left > 0) known.set(item, left - 1);
    return left === 0;
  });
}

/** The refusal's list: each item once, cut short, at most five, so it cannot flood the model. */
export function describeItems(items: readonly string[]): string {
  const unique = [...new Set(items)];
  const shown = unique
    .slice(0, 5)
    .map((item) =>
      JSON.stringify([...item].length > 60 ? `${[...item].slice(0, 60).join("")}…` : item),
    );
  return unique.length > 5 ? `${shown.join(", ")} and ${unique.length - 5} more` : shown.join(", ");
}
