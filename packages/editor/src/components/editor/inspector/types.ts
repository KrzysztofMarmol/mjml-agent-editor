/** What the Settings tab shows for one MJML tag: one entry per attribute it edits. */

export type Group = "content" | "layout" | "spacing" | "style" | "advanced";

/** `""` is a unitless number, as `line-height` accepts. */
export type Unit = "px" | "%" | "em" | "";

export type Option = {
  value: string;
  /** A key of `inspectorLabels`, or the text itself when there is none (a font, a network). */
  label: string;
};

export type Control =
  | { readonly type: "text"; readonly placeholder?: string }
  | { readonly type: "link" }
  | { readonly type: "color" }
  /** A picked image URL. On mj-image `src` is a model property, not an attribute. */
  | { readonly type: "image" }
  /** `negative`: MJML takes a negative value here; elsewhere its unit type rejects one. */
  | { readonly type: "length"; readonly units: readonly Unit[]; readonly negative?: true }
  /** One to four lengths in a shorthand attribute, with `-top`/`-right`/… longhands. */
  | { readonly type: "box"; readonly units: readonly Unit[] }
  /** Few short options, shown side by side. */
  | { readonly type: "segmented"; readonly options: readonly Option[] }
  | { readonly type: "select"; readonly options: readonly Option[] }
  /** Present with `on` when checked, absent when not. */
  | { readonly type: "toggle"; readonly on: string }
  /** mj-social-element `name`: a network, and whether it links to a profile or shares. */
  | { readonly type: "network"; readonly networks: readonly Option[] };

export type Field = {
  readonly attr: string;
  /** A key of `inspectorLabels`; `<label>.help`, when present there, is shown beneath. */
  readonly label: string;
  readonly group: Group;
  readonly control: Control;
  /** MJML's own default, shown while the attribute is unset. */
  readonly default?: string;
  /** Shown only when this holds for the element's current attributes. */
  readonly when?: (attributes: Readonly<Record<string, string>>) => boolean;
};
