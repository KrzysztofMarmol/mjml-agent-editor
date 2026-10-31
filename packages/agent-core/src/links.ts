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
// Elements that exist to run or embed something; an email has no use for any of them. SVG and
// MathML too: inside them a browser tokenises `<style>` and `<![CDATA[` otherwise than in HTML,
// so what is read here would not be what it reads.
const REFUSED_TAGS = new Set([
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
  "svg",
  "math",
  "plaintext",
]);
// Elements whose content a browser reads as text up to their end tag, with scripting on.
const RAW_TEXT = new Set([
  "script",
  "style",
  "xmp",
  "iframe",
  "noembed",
  "noframes",
  "noscript",
  "textarea",
  "title",
]);

// ASCII only, here and in the Python twin, so both read the same input the same way. Each
// alternative runs to the end of the input rather than failing, which keeps a scan linear.
const TAG_NAME = /[A-Za-z][^\t\n\f\r />]*/y;
const ATTRIBUTE =
  /[\t\n\f\r /]*([^\t\n\f\r />][^\t\n\f\r />=]*)(?:[\t\n\f\r ]*=[\t\n\f\r ]*(?:"([^"]*)"?|'([^']*)'?|([^\t\n\f\r >]*)))?/y;
const END_TAG_DELIMITER = /[\t\n\f\r />]/;

/**
 * What in compiled HTML could run: a link with any other scheme than `LINK_SCHEMES`, an `on…`
 * handler, an element such as `<script>` or `<iframe>`. Read as a browser's tokeniser reads
 * HTML: tags with their quotes; comments, `<!…>`, `<?…>` and `<style>`-like elements ending
 * where it ends them, so a quote inside one cannot hide what follows. Inside comments too, where
 * Outlook reads conditional markup. Checked on the compiled email because MJML adds what the
 * source does not say: a navbar's `base-url` from `mj-attributes` or an `mj-class`, joined to
 * each of its links.
 */
export function unsafeMarkup(html: string): string[] {
  const found: string[] = [];
  scan(html, found, false);
  return found;
}

function scan(html: string, found: string[], inComment: boolean): void {
  const lower = asciiLower(html);
  let i = html.indexOf("<");
  while (i !== -1) {
    const next = html[i + 1] ?? "";
    let end = i + 1;
    if (html.startsWith("<!--", i)) {
      // Its content is read once, as markup, so a comment inside cannot repeat the scan.
      if (inComment) end = i + 4;
      else {
        const [content, after] = commentEnd(html, i + 4);
        scan(html.slice(i + 4, content), found, true);
        end = after;
      }
    } else if (
      next === "!" ||
      next === "?" ||
      (next === "/" && !/[A-Za-z]/.test(html[i + 2] ?? ""))
    ) {
      // A bogus comment, `<![CDATA[` outside SVG among them: up to the next `>`.
      const close = html.indexOf(">", i);
      end = close === -1 ? html.length : close + 1;
    } else {
      const closing = next === "/";
      TAG_NAME.lastIndex = closing ? i + 2 : i + 1;
      const tag = TAG_NAME.exec(html)?.[0];
      const name = tag && asciiLower(tag);
      if (name) {
        if (!closing && REFUSED_TAGS.has(name)) found.push(`<${name}>`);
        end = TAG_NAME.lastIndex;
        while (end < html.length && html[end] !== ">") {
          ATTRIBUTE.lastIndex = end;
          const m = ATTRIBUTE.exec(html);
          if (!m || ATTRIBUTE.lastIndex === end) {
            end++;
            continue;
          }
          end = ATTRIBUTE.lastIndex;
          if (closing) continue;
          const attribute = asciiLower(m[1]!);
          const value = m[2] ?? m[3] ?? m[4] ?? "";
          if (attribute.length > 2 && attribute.startsWith("on")) found.push(attribute);
          else if (LINK_ATTRIBUTES.has(attribute) && !isSafeLink(value)) found.push(value);
        }
        if (!closing && RAW_TEXT.has(name)) end = rawTextEnd(lower, name, end);
      }
    }
    i = html.indexOf("<", end);
  }
}

// Only ASCII, as the Python twin does: elsewhere a lower-case form can differ in length.
const asciiLower = (text: string) => text.replace(/[A-Z]+/g, (s) => s.toLowerCase());

/** Where a comment's content ends and what follows it starts, as a browser finds them. */
function commentEnd(html: string, from: number): [number, number] {
  if (html.startsWith(">", from)) return [from, from + 1];
  if (html.startsWith("->", from)) return [from, from + 2];
  const dashes = html.indexOf("-->", from);
  const bang = html.indexOf("--!>", from);
  if (bang !== -1 && (dashes === -1 || bang < dashes)) return [bang, bang + 4];
  return dashes === -1 ? [html.length, html.length] : [dashes, dashes + 3];
}

/** The start of the end tag that closes a `<style>`-like element, or the end of the input. */
function rawTextEnd(lower: string, name: string, from: number): number {
  let at = lower.indexOf(`</${name}`, from);
  while (at !== -1 && !END_TAG_DELIMITER.test(lower[at + 2 + name.length] ?? "")) {
    at = lower.indexOf(`</${name}`, at + 1);
  }
  return at === -1 ? lower.length : at;
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
