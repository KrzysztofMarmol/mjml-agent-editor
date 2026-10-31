/**
 * The attributes MJML accepts on each tag the editor renders, copied from mjml 4.18's
 * `allowedAttributes` (a test keeps the copy in step with the installed package).
 *
 * The agent compiles the whole document strictly on every write, so one illegal attribute
 * anywhere — the sidebar used to write `title` and `display` — makes every later agent edit
 * fail on an element it never touched.
 */
// prettier-ignore
export const ALLOWED_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  "mj-body": [
    "background-color", "width",
  ],
  "mj-wrapper": [
    "background-color", "background-position", "background-position-x",
    "background-position-y", "background-repeat", "background-size", "background-url",
    "border", "border-bottom", "border-left", "border-radius", "border-right", "border-top",
    "direction", "full-width", "gap", "padding", "padding-bottom", "padding-left",
    "padding-right", "padding-top", "text-align", "text-padding",
  ],
  "mj-section": [
    "background-color", "background-position", "background-position-x",
    "background-position-y", "background-repeat", "background-size", "background-url",
    "border", "border-bottom", "border-left", "border-radius", "border-right", "border-top",
    "direction", "full-width", "padding", "padding-bottom", "padding-left", "padding-right",
    "padding-top", "text-align", "text-padding",
  ],
  "mj-column": [
    "background-color", "border", "border-bottom", "border-left", "border-radius",
    "border-right", "border-top", "direction", "inner-background-color", "inner-border",
    "inner-border-bottom", "inner-border-left", "inner-border-radius", "inner-border-right",
    "inner-border-top", "padding", "padding-bottom", "padding-left", "padding-right",
    "padding-top", "vertical-align", "width",
  ],
  "mj-group": [
    "background-color", "direction", "vertical-align", "width",
  ],
  "mj-text": [
    "align", "background-color", "color", "container-background-color", "font-family",
    "font-size", "font-style", "font-weight", "height", "letter-spacing", "line-height",
    "padding", "padding-bottom", "padding-left", "padding-right", "padding-top",
    "text-decoration", "text-transform", "vertical-align",
  ],
  "mj-button": [
    "align", "background-color", "border", "border-bottom", "border-left", "border-radius",
    "border-right", "border-top", "color", "container-background-color", "font-family",
    "font-size", "font-style", "font-weight", "height", "href", "inner-padding",
    "letter-spacing", "line-height", "name", "padding", "padding-bottom", "padding-left",
    "padding-right", "padding-top", "rel", "target", "text-align", "text-decoration",
    "text-transform", "title", "vertical-align", "width",
  ],
  "mj-image": [
    "align", "alt", "border", "border-bottom", "border-left", "border-radius", "border-right",
    "border-top", "container-background-color", "fluid-on-mobile", "font-size", "height",
    "href", "max-height", "name", "padding", "padding-bottom", "padding-left", "padding-right",
    "padding-top", "rel", "sizes", "src", "srcset", "target", "title", "usemap", "width",
  ],
  "mj-divider": [
    "align", "border-color", "border-style", "border-width", "container-background-color",
    "padding", "padding-bottom", "padding-left", "padding-right", "padding-top", "width",
  ],
  "mj-spacer": [
    "border", "border-bottom", "border-left", "border-right", "border-top",
    "container-background-color", "height", "padding", "padding-bottom", "padding-left",
    "padding-right", "padding-top",
  ],
  "mj-social": [
    "align", "border-radius", "color", "container-background-color", "font-family",
    "font-size", "font-style", "font-weight", "icon-height", "icon-padding", "icon-size",
    "inner-padding", "line-height", "mode", "padding", "padding-bottom", "padding-left",
    "padding-right", "padding-top", "table-layout", "text-decoration", "text-padding",
    "vertical-align",
  ],
  "mj-social-element": [
    "align", "alt", "background-color", "border-radius", "color", "font-family", "font-size",
    "font-style", "font-weight", "href", "icon-height", "icon-padding", "icon-position",
    "icon-size", "line-height", "name", "padding", "padding-bottom", "padding-left",
    "padding-right", "padding-top", "rel", "sizes", "src", "srcset", "target",
    "text-decoration", "text-padding", "title", "vertical-align",
  ],
  "mj-hero": [
    "background-color", "background-height", "background-position", "background-url",
    "background-width", "border-radius", "container-background-color", "height",
    "inner-background-color", "inner-padding", "inner-padding-bottom", "inner-padding-left",
    "inner-padding-right", "inner-padding-top", "mode", "padding", "padding-bottom",
    "padding-left", "padding-right", "padding-top", "vertical-align",
  ],
  "mj-navbar": [
    "align", "base-url", "hamburger", "ico-align", "ico-close", "ico-color", "ico-font-family",
    "ico-font-size", "ico-line-height", "ico-open", "ico-padding", "ico-padding-bottom",
    "ico-padding-left", "ico-padding-right", "ico-padding-top", "ico-text-decoration",
    "ico-text-transform", "padding", "padding-bottom", "padding-left", "padding-right",
    "padding-top",
  ],
  "mj-navbar-link": [
    "color", "font-family", "font-size", "font-style", "font-weight", "href", "letter-spacing",
    "line-height", "name", "padding", "padding-bottom", "padding-left", "padding-right",
    "padding-top", "rel", "target", "text-decoration", "text-transform",
  ],
};

// Accepted on every tag by MJML's validator, plus GrapesJS's own `id` and `style` (the
// plugin's style mirror), which it never serialises.
const ALWAYS_ALLOWED = new Set(["mj-class", "css-class", "id", "style"]);

const EDITOR_PROPS = /\sdata-gjs-[\w-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?/gi;

/**
 * The MJML without `data-gjs-*` attributes, which GrapesJS reads as properties of the element
 * rather than attributes: its layer name and icon among them, which it writes into the page
 * as markup. Strict MJML does not look inside a text's HTML, so the agent can write them too.
 */
export function withoutEditorProps(mjml: string): string {
  return mjml.replace(EDITOR_PROPS, "");
}

/** The attributes MJML would reject on `tag`; none for a tag the table does not cover. */
export function illegalAttributes(tag: string, attributes: Record<string, unknown>): string[] {
  const allowed = ALLOWED_ATTRIBUTES[tag];
  if (!allowed) return [];
  return Object.keys(attributes).filter((a) => !ALWAYS_ALLOWED.has(a) && !allowed.includes(a));
}

/** The colour names MJML accepts, as mjml-core 4.18 lists them: CSS's, plus `inherit`. */
// prettier-ignore
export const NAMED_COLORS: ReadonlySet<string> = new Set([
  "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque", "black",
  "blanchedalmond", "blue", "blueviolet", "brown", "burlywood", "cadetblue", "chartreuse",
  "chocolate", "coral", "cornflowerblue", "cornsilk", "crimson", "cyan", "darkblue", "darkcyan",
  "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki", "darkmagenta",
  "darkolivegreen", "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen",
  "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise", "darkviolet", "deeppink",
  "deepskyblue", "dimgray", "dimgrey", "dodgerblue", "firebrick", "floralwhite", "forestgreen",
  "fuchsia", "gainsboro", "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow",
  "grey", "honeydew", "hotpink", "indianred", "indigo", "inherit", "ivory", "khaki", "lavender",
  "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral", "lightcyan",
  "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey", "lightpink", "lightsalmon",
  "lightseagreen", "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue",
  "lightyellow", "lime", "limegreen", "linen", "magenta", "maroon", "mediumaquamarine",
  "mediumblue", "mediumorchid", "mediumpurple", "mediumseagreen", "mediumslateblue",
  "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue", "mintcream",
  "mistyrose", "moccasin", "navajowhite", "navy", "oldlace", "olive", "olivedrab", "orange",
  "orangered", "orchid", "palegoldenrod", "palegreen", "paleturquoise", "palevioletred",
  "papayawhip", "peachpuff", "peru", "pink", "plum", "powderblue", "purple", "rebeccapurple",
  "red", "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown", "seagreen", "seashell",
  "sienna", "silver", "skyblue", "slateblue", "slategray", "slategrey", "snow", "springgreen",
  "steelblue", "tan", "teal", "thistle", "tomato", "transparent", "turquoise", "violet", "wheat",
  "white", "whitesmoke", "yellow", "yellowgreen",
]);
