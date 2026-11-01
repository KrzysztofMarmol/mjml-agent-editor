/**
 * The fields the Settings tab offers per MJML tag, in display order.
 *
 * Every attribute, option and unit here must pass MJML's strict validation, which the agent
 * runs on the whole document at every write; `schema.test.ts` compiles each one.
 */

import type { Field, Option, Unit } from "./types.js";

const PX: readonly Unit[] = ["px"];
const PX_PCT: readonly Unit[] = ["px", "%"];
const LINE_HEIGHT: readonly Unit[] = ["", "px", "%"];
const LETTER_SPACING: readonly Unit[] = ["px", "em"];

const ALIGN: readonly Option[] = [
  { value: "left", label: "alignLeft" },
  { value: "center", label: "alignCenter" },
  { value: "right", label: "alignRight" },
];

const VERTICAL_ALIGN: readonly Option[] = [
  { value: "top", label: "alignTop" },
  { value: "middle", label: "alignMiddle" },
  { value: "bottom", label: "alignBottom" },
];

const FONTS: readonly Option[] = [
  { value: "Ubuntu, Helvetica, Arial, sans-serif", label: "Ubuntu" },
  { value: "Arial, Helvetica, sans-serif", label: "Arial" },
  { value: "Helvetica, Arial, sans-serif", label: "Helvetica" },
  { value: "Verdana, Geneva, sans-serif", label: "Verdana" },
  { value: "Tahoma, Geneva, sans-serif", label: "Tahoma" },
  { value: "'Trebuchet MS', Helvetica, sans-serif", label: "Trebuchet MS" },
  { value: "Georgia, 'Times New Roman', serif", label: "Georgia" },
  { value: "'Times New Roman', Times, serif", label: "Times New Roman" },
  { value: "'Courier New', Courier, monospace", label: "Courier New" },
];

// Keywords at both ends because MJML's own defaults are `normal`; agents' `400`/`700` show
// as values the select does not list.
const WEIGHTS: readonly Option[] = [
  { value: "normal", label: "weightRegular" },
  { value: "500", label: "weightMedium" },
  { value: "600", label: "weightSemibold" },
  { value: "bold", label: "weightBold" },
];

const TEXT_TRANSFORM: readonly Option[] = [
  { value: "none", label: "caseNone" },
  { value: "uppercase", label: "caseUpper" },
  { value: "lowercase", label: "caseLower" },
  { value: "capitalize", label: "caseCapitalize" },
];

const TARGET: readonly Option[] = [
  { value: "_blank", label: "targetNewTab" },
  { value: "_self", label: "targetSameTab" },
];

const BACKGROUND_POSITION: readonly Option[] = [
  { value: "top left", label: "positionTopLeft" },
  { value: "top center", label: "positionTopCenter" },
  { value: "top right", label: "positionTopRight" },
  { value: "center left", label: "positionCenterLeft" },
  { value: "center center", label: "positionCenter" },
  { value: "center right", label: "positionCenterRight" },
  { value: "bottom left", label: "positionBottomLeft" },
  { value: "bottom center", label: "positionBottomCenter" },
  { value: "bottom right", label: "positionBottomRight" },
];

export const NETWORKS: readonly Option[] = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "x", label: "X" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "youtube", label: "YouTube" },
  { value: "pinterest", label: "Pinterest" },
  { value: "github", label: "GitHub" },
  { value: "web", label: "networkWebsite" },
  { value: "snapchat", label: "Snapchat" },
  { value: "vimeo", label: "Vimeo" },
  { value: "medium", label: "Medium" },
  { value: "dribbble", label: "Dribbble" },
  { value: "soundcloud", label: "SoundCloud" },
  { value: "tumblr", label: "Tumblr" },
  { value: "xing", label: "Xing" },
  { value: "custom", label: "networkCustom" },
];

const hasBackgroundImage = (a: Readonly<Record<string, string>>) => !!a["background-url"];

/** Shared by mj-section and mj-wrapper, whose background and box attributes are the same. */
const SECTION_FIELDS: readonly Field[] = [
  {
    attr: "full-width",
    label: "fullWidth",
    group: "layout",
    control: { type: "toggle", on: "full-width" },
  },
  {
    attr: "padding",
    label: "padding",
    group: "spacing",
    control: { type: "box", units: PX_PCT },
    default: "20px 0",
  },
  {
    attr: "background-color",
    label: "backgroundColor",
    group: "style",
    control: { type: "color" },
  },
  { attr: "background-url", label: "backgroundImage", group: "style", control: { type: "image" } },
  {
    attr: "background-size",
    label: "backgroundSize",
    group: "style",
    control: {
      type: "segmented",
      options: [
        { value: "cover", label: "sizeCover" },
        { value: "contain", label: "sizeContain" },
        { value: "auto", label: "sizeAuto" },
      ],
    },
    default: "auto",
    when: hasBackgroundImage,
  },
  {
    attr: "background-repeat",
    label: "backgroundRepeat",
    group: "style",
    control: {
      type: "segmented",
      options: [
        { value: "repeat", label: "repeatTile" },
        { value: "no-repeat", label: "repeatOnce" },
      ],
    },
    default: "repeat",
    when: hasBackgroundImage,
  },
  {
    attr: "background-position",
    label: "backgroundPosition",
    group: "style",
    control: { type: "select", options: BACKGROUND_POSITION },
    default: "top center",
    when: hasBackgroundImage,
  },
  {
    attr: "border-radius",
    label: "cornerRadius",
    group: "style",
    control: { type: "length", units: PX_PCT },
  },
];

// prettier-ignore
export const SCHEMA: Readonly<Record<string, readonly Field[]>> = {
  "mj-body": [
    { attr: "width", label: "contentWidth", group: "layout", control: { type: "length", units: PX }, default: "600px" },
    { attr: "background-color", label: "pageBackground", group: "style", control: { type: "color" } },
  ],
  "mj-wrapper": [
    ...SECTION_FIELDS,
    { attr: "gap", label: "gap", group: "advanced", control: { type: "length", units: PX } },
    { attr: "border", label: "border", group: "advanced", control: { type: "text", placeholder: "1px solid #cccccc" } },
  ],
  "mj-section": [
    ...SECTION_FIELDS,
    { attr: "text-align", label: "alignColumns", group: "advanced", control: { type: "segmented", options: ALIGN }, default: "center" },
    { attr: "direction", label: "reverseColumns", group: "advanced", control: { type: "toggle", on: "rtl" } },
    { attr: "border", label: "border", group: "advanced", control: { type: "text", placeholder: "1px solid #cccccc" } },
  ],
  // MJML allows a group these and `width` only: padding or a border fails strict. Its width is
  // not offered, as the canvas does not draw it: the plugin's group drops MJML's rule for it.
  "mj-group": [
    { attr: "vertical-align", label: "verticalAlign", group: "layout", control: { type: "segmented", options: VERTICAL_ALIGN } },
    { attr: "background-color", label: "backgroundColor", group: "style", control: { type: "color" } },
    { attr: "direction", label: "reverseColumns", group: "advanced", control: { type: "toggle", on: "rtl" } },
  ],
  "mj-column": [
    { attr: "vertical-align", label: "verticalAlign", group: "layout", control: { type: "segmented", options: VERTICAL_ALIGN }, default: "top" },
    { attr: "padding", label: "padding", group: "spacing", control: { type: "box", units: PX_PCT } },
    { attr: "background-color", label: "backgroundColor", group: "style", control: { type: "color" } },
    { attr: "border-radius", label: "cornerRadius", group: "style", control: { type: "length", units: PX_PCT } },
    { attr: "width", label: "width", group: "advanced", control: { type: "length", units: PX_PCT } },
    { attr: "inner-background-color", label: "innerBackground", group: "advanced", control: { type: "color" } },
    { attr: "inner-border-radius", label: "innerCornerRadius", group: "advanced", control: { type: "length", units: PX_PCT } },
    { attr: "border", label: "border", group: "advanced", control: { type: "text", placeholder: "1px solid #cccccc" } },
    { attr: "inner-border", label: "innerBorder", group: "advanced", control: { type: "text", placeholder: "1px solid #cccccc" } },
  ],
  "mj-text": [
    {
      attr: "align",
      label: "align",
      group: "layout",
      control: { type: "segmented", options: [...ALIGN, { value: "justify", label: "alignJustify" }] },
      default: "left",
    },
    { attr: "padding", label: "padding", group: "spacing", control: { type: "box", units: PX_PCT }, default: "10px 25px" },
    { attr: "font-family", label: "font", group: "style", control: { type: "select", options: FONTS }, default: "Ubuntu, Helvetica, Arial, sans-serif" },
    { attr: "font-size", label: "fontSize", group: "style", control: { type: "length", units: PX }, default: "13px" },
    { attr: "font-weight", label: "fontWeight", group: "style", control: { type: "select", options: WEIGHTS } },
    { attr: "color", label: "textColor", group: "style", control: { type: "color" }, default: "#000000" },
    { attr: "line-height", label: "lineHeight", group: "style", control: { type: "length", units: LINE_HEIGHT }, default: "1" },
    { attr: "container-background-color", label: "blockBackground", group: "style", control: { type: "color" } },
    { attr: "letter-spacing", label: "letterSpacing", group: "advanced", control: { type: "length", units: LETTER_SPACING, negative: true } },
    { attr: "text-transform", label: "textTransform", group: "advanced", control: { type: "select", options: TEXT_TRANSFORM } },
  ],
  "mj-button": [
    { attr: "href", label: "link", group: "content", control: { type: "link" } },
    { attr: "align", label: "align", group: "layout", control: { type: "segmented", options: ALIGN }, default: "center" },
    { attr: "inner-padding", label: "buttonPadding", group: "spacing", control: { type: "box", units: PX_PCT }, default: "10px 25px" },
    { attr: "padding", label: "spaceAround", group: "spacing", control: { type: "box", units: PX_PCT }, default: "10px 25px" },
    { attr: "background-color", label: "buttonColor", group: "style", control: { type: "color" }, default: "#414141" },
    { attr: "color", label: "textColor", group: "style", control: { type: "color" }, default: "#ffffff" },
    { attr: "font-size", label: "fontSize", group: "style", control: { type: "length", units: PX }, default: "13px" },
    { attr: "border-radius", label: "cornerRadius", group: "style", control: { type: "length", units: PX_PCT }, default: "3px" },
    { attr: "width", label: "width", group: "advanced", control: { type: "length", units: PX_PCT } },
    { attr: "font-family", label: "font", group: "advanced", control: { type: "select", options: FONTS }, default: "Ubuntu, Helvetica, Arial, sans-serif" },
    { attr: "font-weight", label: "fontWeight", group: "advanced", control: { type: "select", options: WEIGHTS }, default: "normal" },
    { attr: "target", label: "opensIn", group: "advanced", control: { type: "select", options: TARGET }, default: "_blank" },
    { attr: "title", label: "tooltip", group: "advanced", control: { type: "text" } },
    { attr: "rel", label: "rel", group: "advanced", control: { type: "text", placeholder: "noopener" } },
    { attr: "container-background-color", label: "blockBackground", group: "advanced", control: { type: "color" } },
    { attr: "border", label: "border", group: "advanced", control: { type: "text", placeholder: "1px solid #cccccc" }, default: "none" },
    { attr: "letter-spacing", label: "letterSpacing", group: "advanced", control: { type: "length", units: LETTER_SPACING, negative: true } },
    { attr: "text-transform", label: "textTransform", group: "advanced", control: { type: "select", options: TEXT_TRANSFORM }, default: "none" },
    { attr: "line-height", label: "lineHeight", group: "advanced", control: { type: "length", units: LINE_HEIGHT }, default: "120%" },
  ],
  "mj-image": [
    { attr: "src", label: "image", group: "content", control: { type: "image" } },
    { attr: "alt", label: "altText", group: "content", control: { type: "text" } },
    { attr: "href", label: "link", group: "content", control: { type: "link" } },
    { attr: "width", label: "width", group: "layout", control: { type: "length", units: PX } },
    { attr: "align", label: "align", group: "layout", control: { type: "segmented", options: ALIGN }, default: "center" },
    { attr: "fluid-on-mobile", label: "fluidOnMobile", group: "layout", control: { type: "toggle", on: "true" } },
    { attr: "padding", label: "padding", group: "spacing", control: { type: "box", units: PX_PCT }, default: "10px 25px" },
    { attr: "border-radius", label: "cornerRadius", group: "style", control: { type: "length", units: PX_PCT } },
    { attr: "target", label: "opensIn", group: "advanced", control: { type: "select", options: TARGET }, default: "_blank" },
    { attr: "title", label: "tooltip", group: "advanced", control: { type: "text" } },
    { attr: "rel", label: "rel", group: "advanced", control: { type: "text", placeholder: "noopener" } },
    { attr: "border", label: "border", group: "advanced", control: { type: "text", placeholder: "1px solid #cccccc" }, default: "0" },
    { attr: "container-background-color", label: "blockBackground", group: "advanced", control: { type: "color" } },
  ],
  "mj-divider": [
    { attr: "width", label: "width", group: "layout", control: { type: "length", units: PX_PCT }, default: "100%" },
    { attr: "align", label: "align", group: "layout", control: { type: "segmented", options: ALIGN }, default: "center" },
    { attr: "padding", label: "padding", group: "spacing", control: { type: "box", units: PX_PCT }, default: "10px 25px" },
    { attr: "border-color", label: "lineColor", group: "style", control: { type: "color" }, default: "#000000" },
    { attr: "border-width", label: "thickness", group: "style", control: { type: "length", units: PX }, default: "4px" },
    {
      attr: "border-style",
      label: "lineStyle",
      group: "style",
      control: {
        type: "segmented",
        options: [
          { value: "solid", label: "lineSolid" },
          { value: "dashed", label: "lineDashed" },
          { value: "dotted", label: "lineDotted" },
        ],
      },
      default: "solid",
    },
    { attr: "container-background-color", label: "blockBackground", group: "advanced", control: { type: "color" } },
  ],
  "mj-spacer": [
    { attr: "height", label: "height", group: "layout", control: { type: "length", units: PX }, default: "20px" },
    { attr: "container-background-color", label: "blockBackground", group: "advanced", control: { type: "color" } },
  ],
  "mj-social": [
    {
      attr: "mode",
      label: "socialMode",
      group: "layout",
      control: {
        type: "segmented",
        options: [
          { value: "horizontal", label: "modeHorizontal" },
          { value: "vertical", label: "modeVertical" },
        ],
      },
      default: "horizontal",
    },
    { attr: "align", label: "align", group: "layout", control: { type: "segmented", options: ALIGN }, default: "center" },
    { attr: "padding", label: "padding", group: "spacing", control: { type: "box", units: PX_PCT }, default: "10px 25px" },
    { attr: "inner-padding", label: "iconSpacing", group: "spacing", control: { type: "box", units: PX_PCT } },
    { attr: "icon-size", label: "iconSize", group: "style", control: { type: "length", units: PX_PCT }, default: "20px" },
    // A single value: mj-social's border-radius is not a 4-side shorthand.
    { attr: "border-radius", label: "cornerRadius", group: "style", control: { type: "length", units: PX_PCT }, default: "3px" },
    { attr: "font-family", label: "font", group: "advanced", control: { type: "select", options: FONTS }, default: "Ubuntu, Helvetica, Arial, sans-serif" },
    { attr: "font-size", label: "fontSize", group: "advanced", control: { type: "length", units: PX }, default: "13px" },
    { attr: "color", label: "textColor", group: "advanced", control: { type: "color" }, default: "#333333" },
    { attr: "line-height", label: "lineHeight", group: "advanced", control: { type: "length", units: LINE_HEIGHT }, default: "22px" },
    { attr: "container-background-color", label: "blockBackground", group: "advanced", control: { type: "color" } },
  ],
  "mj-social-element": [
    { attr: "name", label: "network", group: "content", control: { type: "network", networks: NETWORKS } },
    { attr: "href", label: "link", group: "content", control: { type: "link" } },
    {
      attr: "src",
      label: "customIcon",
      group: "content",
      control: { type: "image" },
      when: (a) => (a.name ?? "").startsWith("custom") || !!a.src,
    },
    { attr: "alt", label: "altText", group: "content", control: { type: "text" } },
    { attr: "background-color", label: "iconColor", group: "style", control: { type: "color" } },
    { attr: "icon-size", label: "iconSize", group: "advanced", control: { type: "length", units: PX_PCT } },
    { attr: "border-radius", label: "cornerRadius", group: "advanced", control: { type: "length", units: PX }, default: "3px" },
    { attr: "padding", label: "padding", group: "advanced", control: { type: "box", units: PX_PCT }, default: "4px" },
    { attr: "icon-position", label: "iconPosition", group: "advanced", control: { type: "segmented", options: [{ value: "left", label: "alignLeft" }, { value: "right", label: "alignRight" }] }, default: "left" },
    { attr: "title", label: "tooltip", group: "advanced", control: { type: "text" } },
    { attr: "target", label: "opensIn", group: "advanced", control: { type: "select", options: TARGET }, default: "_blank" },
    { attr: "rel", label: "rel", group: "advanced", control: { type: "text", placeholder: "noopener" } },
  ],
  "mj-hero": [
    { attr: "background-url", label: "backgroundImage", group: "content", control: { type: "image" } },
    {
      attr: "mode",
      label: "heroMode",
      group: "content",
      control: {
        type: "segmented",
        options: [
          { value: "fixed-height", label: "heroFixed" },
          { value: "fluid-height", label: "heroFluid" },
        ],
      },
      default: "fixed-height",
    },
    {
      attr: "height",
      label: "height",
      group: "layout",
      control: { type: "length", units: PX_PCT },
      default: "0px",
      when: (a) => (a.mode ?? "fixed-height") === "fixed-height",
    },
    {
      attr: "background-width",
      label: "backgroundWidth",
      group: "layout",
      control: { type: "length", units: PX_PCT },
      when: (a) => a.mode === "fluid-height",
    },
    {
      attr: "background-height",
      label: "backgroundHeight",
      group: "layout",
      control: { type: "length", units: PX_PCT },
      when: (a) => a.mode === "fluid-height",
    },
    { attr: "vertical-align", label: "verticalAlign", group: "layout", control: { type: "segmented", options: VERTICAL_ALIGN }, default: "top" },
    { attr: "background-position", label: "backgroundPosition", group: "layout", control: { type: "select", options: BACKGROUND_POSITION }, default: "center center" },
    { attr: "padding", label: "padding", group: "spacing", control: { type: "box", units: PX_PCT }, default: "0px" },
    { attr: "background-color", label: "fallbackColor", group: "style", control: { type: "color" }, default: "#ffffff" },
    { attr: "border-radius", label: "cornerRadius", group: "style", control: { type: "length", units: PX_PCT } },
    { attr: "inner-padding", label: "contentPadding", group: "advanced", control: { type: "box", units: PX_PCT } },
    { attr: "inner-background-color", label: "contentBackground", group: "advanced", control: { type: "color" } },
  ],
  "mj-navbar": [
    { attr: "align", label: "align", group: "layout", control: { type: "segmented", options: ALIGN }, default: "center" },
    { attr: "hamburger", label: "hamburger", group: "layout", control: { type: "toggle", on: "hamburger" } },
    { attr: "padding", label: "padding", group: "spacing", control: { type: "box", units: PX_PCT } },
    { attr: "ico-color", label: "menuIconColor", group: "advanced", control: { type: "color" }, default: "#000000", when: (a) => !!a.hamburger },
    { attr: "ico-font-size", label: "menuIconSize", group: "advanced", control: { type: "length", units: PX_PCT }, default: "30px", when: (a) => !!a.hamburger },
    { attr: "ico-align", label: "menuIconAlign", group: "advanced", control: { type: "segmented", options: ALIGN }, default: "center", when: (a) => !!a.hamburger },
    { attr: "base-url", label: "baseUrl", group: "advanced", control: { type: "link" } },
  ],
  "mj-navbar-link": [
    { attr: "href", label: "link", group: "content", control: { type: "link" } },
    { attr: "padding", label: "padding", group: "spacing", control: { type: "box", units: PX_PCT }, default: "15px 10px" },
    { attr: "color", label: "textColor", group: "style", control: { type: "color" }, default: "#000000" },
    { attr: "font-family", label: "font", group: "style", control: { type: "select", options: FONTS }, default: "Ubuntu, Helvetica, Arial, sans-serif" },
    { attr: "font-size", label: "fontSize", group: "style", control: { type: "length", units: PX }, default: "13px" },
    { attr: "font-weight", label: "fontWeight", group: "style", control: { type: "select", options: WEIGHTS }, default: "normal" },
    { attr: "text-transform", label: "textTransform", group: "style", control: { type: "select", options: TEXT_TRANSFORM }, default: "uppercase" },
    { attr: "target", label: "opensIn", group: "advanced", control: { type: "select", options: TARGET }, default: "_blank" },
    { attr: "rel", label: "rel", group: "advanced", control: { type: "text", placeholder: "noopener" } },
    { attr: "letter-spacing", label: "letterSpacing", group: "advanced", control: { type: "length", units: LETTER_SPACING, negative: true } },
    { attr: "line-height", label: "lineHeight", group: "advanced", control: { type: "length", units: LINE_HEIGHT }, default: "22px" },
  ],
};
