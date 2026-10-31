"use client";

/**
 * The Settings tab: the selected element's MJML attributes, grouped by what they are for.
 *
 * It reads `getAttributes()` and writes `addAttributes` / `removeAttributes`, never through
 * GrapesJS's Style Manager: its properties are global per CSS name, so a label, unit list or
 * option set could not differ by tag, and it reads a style mirror the plugin seeds with its
 * own defaults rather than the document's values. Only attributes the schema names are
 * written, so `css-class`, which carries the agent's `sec-*` and `obj-*` ids, never is.
 */

import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import type { Component, Editor } from "grapesjs";
import { useEditorMaybe } from "@grapesjs/react";
import { ArrowUp, ChevronRight, Copy, Monitor, Trash2, X } from "lucide-react";

import { useLabels } from "../../../index.js";
import type { EditorLabels } from "../../../labels.js";
import { useAgentTurn } from "../../../stores.js";
import { cn } from "../../../lib/utils";
import ColorField, { toHex } from "../ColorField.js";
import ImageField, { imageUrl } from "../ImageField.js";
import { BoxInput, LengthInput, Row, Segmented, Select, TextInput, Toggle } from "./controls.js";
import { layerName } from "../layers.js";
import { SCHEMA } from "./schema.js";
import StructureSection from "./StructureSection.js";
import type { Field, Group, Option } from "./types.js";
import { isSafeLink, isSafeNavbarLink, networkName, parseNetwork, SIDES } from "./values.js";
import { createWriter, type WriteOptions } from "./write.js";

const GROUPS: readonly Exclude<Group, "advanced">[] = ["content", "layout", "spacing", "style"];

// Never listed under "Other attributes": the agent's ids, and GrapesJS's own bookkeeping.
const HIDDEN = new Set(["css-class", "mj-class", "id", "style"]);

function tagOf(c: Component): string {
  return String(c.get("tagName") || c.get("type") || "");
}

/** Attributes as strings; GrapesJS keeps a few as booleans or numbers. */
function attributesOf(c: Component): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(c.getAttributes())) {
    if (v !== undefined && v !== null && v !== false) out[k] = String(v);
  }
  // mj-image keeps `src` as a model property, and the plugin writes that over the attribute.
  if (tagOf(c) === "mj-image") out.src = String(c.get("src") ?? "");
  return out;
}

/**
 * Distinct colors already in the email, most frequent first, read when the picker opens.
 * Only values of color-bearing attributes: a bare `#[0-9a-f]+` also matches entities such as
 * `&#039;` and anchors such as `href="#top"`.
 */
function documentColors(editor: Editor): string[] {
  const counts = new Map<string, number>();
  const colorValue =
    /(?:color|background|border)[\w-]*\s*[:=]\s*["']?[^"';>{}]*?(#[0-9a-f]{3,8}\b|rgba?\([^)]*\))/gi;
  for (const match of editor.getHtml().matchAll(colorValue)) {
    const hex = toHex(match[1]!, { opaque: true });
    if (hex) counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([hex]) => hex);
}

export default function Inspector({
  onEmailSettings,
  empty,
}: {
  onEmailSettings: () => void;
  /** Shown when nothing is selected. */
  empty: ReactNode;
}) {
  const editor = useEditorMaybe();
  const labels = useLabels();
  const { locked } = useAgentTurn();
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const root = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);

  // GrapesJS owns the selection and the values; re-read them whenever either changes. No
  // Component is kept in state: an agent turn's reload replaces every one of them.
  useEffect(() => {
    if (!editor) return;
    const events = "component:update change:device";
    // A button here that changes the selection (parent, duplicate, delete, a link, Add) goes
    // with the old element's settings; focus moves to what replaces them, not to the page.
    const toggled = () => {
      if (root.current?.contains(document.activeElement)) refocus.current = true;
      refresh();
    };
    editor.on(events, refresh);
    editor.on("component:toggled", toggled);
    return () => {
      editor.off(events, refresh);
      editor.off("component:toggled", toggled);
    };
  }, [editor]);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    root.current?.querySelector<HTMLElement>("[data-focus-target]")?.focus();
  });

  if (!editor) return null;
  const selected = editor.getSelectedAll();
  const component = selected[0];
  return (
    <div ref={root}>
      {selected.length === 0 ? (
        <div data-focus-target tabIndex={-1} className="outline-none">
          {empty}
        </div>
      ) : selected.length > 1 ? (
        <p
          data-focus-target
          tabIndex={-1}
          className="px-4 py-8 text-center text-xs text-panel-muted-fg outline-none"
        >
          {labels.multipleSelected(selected.length)}
        </p>
      ) : (
        <ElementSettings
          key={component!.cid}
          editor={editor}
          component={component!}
          labels={labels}
          locked={locked}
          onEmailSettings={onEmailSettings}
        />
      )}
    </div>
  );
}

function ElementSettings({
  editor,
  component,
  labels,
  locked,
  onEmailSettings,
}: {
  editor: Editor;
  component: Component;
  labels: EditorLabels;
  locked: boolean;
  onEmailSettings: () => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const tag = tagOf(component);
  const fields = SCHEMA[tag] ?? [];
  const attributes = attributesOf(component);
  const visible = fields.filter((f) => !f.when || f.when(attributes));
  const t = (key: string) => labels.inspectorLabels[key] ?? key;
  const optionName = (o: Option) => labels.inspectorLabels[o.label] ?? o.label;

  // One writer per element (this component is keyed by it), so a drag's start survives renders.
  const [writer] = useState(() => createWriter(editor, component));
  const write = (attr: string, value: string, options?: WriteOptions) =>
    locked ? Promise.resolve() : writer(attr, value, options);
  // A box writes its shorthand and drops the longhands, which would otherwise override it.
  const writeBox = (attr: string, shorthand: string, partial?: boolean) =>
    write(attr, shorthand, { remove: SIDES.map((s) => `${attr}-${s}`), partial });

  const chooseImage = (attr: string) => {
    if (attr === "src" && tag === "mj-image") return void editor.runCommand("open-image-picker");
    const am = editor.AssetManager;
    am.open({
      types: ["image"],
      current: imageUrl(attributes[attr] ?? "") ?? undefined,
      select(asset: string | { getSrc: () => string }, complete?: boolean) {
        void write(attr, typeof asset === "string" ? asset : asset.getSrc());
        if (complete) am.close();
      },
    } as never);
  };

  const safeLink = (attr: string) => (link: string) => {
    if (tag === "mj-navbar-link" && attr === "href") {
      return isSafeNavbarLink(String(component.parent()?.getAttributes()["base-url"] ?? ""), link);
    }
    if (tag === "mj-navbar" && attr === "base-url") {
      return component
        .components()
        .every((c: Component) => isSafeNavbarLink(link, String(c.getAttributes().href ?? "")));
    }
    return isSafeLink(link);
  };

  const control = (f: Field): ReactNode => {
    const value = attributes[f.attr] ?? "";
    const c = f.control;
    switch (c.type) {
      case "text":
        return (
          <TextInput
            value={value}
            placeholder={c.placeholder ?? f.default}
            onCommit={(v) => write(f.attr, v)}
          />
        );
      case "link":
        return (
          <TextInput
            value={value}
            placeholder="https://"
            accept={safeLink(f.attr)}
            onCommit={(v) => write(f.attr, v)}
          />
        );
      case "color":
        return (
          <ColorField
            value={value}
            placeholder={f.default}
            documentColors={() => documentColors(editor)}
            labels={labels}
            onChange={(v, partial) => write(f.attr, v, { partial })}
          />
        );
      case "image":
        return (
          <ImageField
            value={value}
            labels={labels}
            onChoose={() => chooseImage(f.attr)}
            onClear={() => write(f.attr, "")}
          />
        );
      case "length":
        return (
          <LengthInput
            value={value}
            placeholder={f.default}
            units={c.units}
            negative={c.negative}
            labels={labels}
            onCommit={(v, partial) => write(f.attr, v, { partial })}
          />
        );
      case "box":
        return (
          <BoxInput
            attributes={attributes}
            attr={f.attr}
            placeholder={f.default}
            units={c.units}
            labels={labels}
            onCommit={(v, partial) => writeBox(f.attr, v, partial)}
          />
        );
      case "segmented":
        return (
          <Segmented
            value={value}
            fallback={f.default}
            options={c.options}
            name={optionName}
            onCommit={(v) => write(f.attr, v)}
          />
        );
      case "select":
        return (
          <Select
            value={value}
            fallback={f.default}
            options={c.options}
            name={optionName}
            onCommit={(v) => write(f.attr, v)}
          />
        );
      case "toggle":
        return (
          <Toggle
            checked={value === c.on}
            label={t(f.label)}
            onCommit={(on) => write(f.attr, on ? c.on : "")}
          />
        );
      case "network": {
        const { network, share } = parseNetwork(value);
        return (
          <div className="flex flex-col gap-1.5">
            <Select
              value={network}
              options={c.networks}
              name={optionName}
              onCommit={(n) => write(f.attr, n ? networkName(n, share) : "")}
            />
            {network && network !== "custom" && (
              <Segmented
                value={share ? "share" : "profile"}
                options={[
                  { value: "profile", label: labels.linkTypeProfile },
                  { value: "share", label: labels.linkTypeShare },
                ]}
                name={(o) => o.label}
                onCommit={(v) => write(f.attr, networkName(network, v === "share"))}
              />
            )}
          </div>
        );
      }
    }
  };

  const own = (f: Field) =>
    f.control.type === "box"
      ? [f.attr, ...SIDES.map((s) => `${f.attr}-${s}`)].some((a) => attributes[a] !== undefined)
      : !!attributes[f.attr];
  const reset = (f: Field) => (f.control.type === "box" ? writeBox(f.attr, "") : write(f.attr, ""));
  const wide = (f: Field) =>
    ["color", "image", "link", "text", "box", "network"].includes(f.control.type);

  const row = (f: Field) => (
    <Row
      key={f.attr}
      label={t(f.label)}
      help={labels.inspectorLabels[`${f.label}.help`]}
      own={own(f)}
      wide={wide(f)}
      inline={f.control.type === "toggle"}
      labels={labels}
      onReset={() => void reset(f)}
    >
      {control(f)}
    </Row>
  );

  const named = new Set(
    fields.flatMap((f) =>
      f.control.type === "box" ? [f.attr, ...SIDES.map((s) => `${f.attr}-${s}`)] : [f.attr],
    ),
  );
  const others = Object.entries(attributes).filter(([k]) => !named.has(k) && !HIDDEN.has(k));
  const advanced = visible.filter((f) => f.group === "advanced");
  const advancedCount = advanced.length + others.length;

  return (
    <div className="pb-6">
      <Header
        editor={editor}
        component={component}
        labels={labels}
        onEmailSettings={onEmailSettings}
      />
      {editor.getDevice() !== "Desktop" && (
        <p className="mx-3 mt-2 flex items-center gap-1.5 rounded-md bg-panel-elevated px-2 py-1.5 text-[11px] text-panel-muted-fg">
          <Monitor className="size-3.5 shrink-0" />
          {labels.allScreenSizes}
        </p>
      )}
      <StructureSection editor={editor} component={component} labels={labels} locked={locked} />
      {GROUPS.map((group) => {
        const inGroup = visible.filter((f) => f.group === group);
        if (inGroup.length === 0) return null;
        return (
          <section key={group} className="border-b border-panel-border/60 py-2">
            <h3 className="px-3 pb-1 text-[10px] font-semibold tracking-wider text-panel-muted-fg/80 uppercase">
              {groupName(group, labels)}
            </h3>
            {inGroup.map(row)}
          </section>
        );
      })}
      {advancedCount > 0 && (
        <section className="py-1">
          <button
            type="button"
            onClick={() => setAdvancedOpen((o) => !o)}
            aria-expanded={advancedOpen}
            className="flex w-full items-center gap-1 px-3 py-2 text-[10px] font-semibold tracking-wider text-panel-muted-fg/80 uppercase hover:text-panel-fg"
          >
            <ChevronRight
              className={cn("size-3 transition-transform", advancedOpen && "rotate-90")}
            />
            {labels.groupAdvanced}
            <span className="font-normal normal-case">({advancedCount})</span>
          </button>
          {advancedOpen && (
            <>
              {advanced.map(row)}
              {others.length > 0 && (
                <div className="px-3 pt-2">
                  <p className="pb-1 text-[11px] text-panel-muted-fg">{labels.otherAttributes}</p>
                  <ul className="flex flex-col gap-1">
                    {others.map(([k, v]) => (
                      <li
                        key={k}
                        className="flex items-center gap-2 rounded-md bg-panel-elevated px-2 py-1 font-mono text-[11px]"
                      >
                        <span className="text-panel-muted-fg">{k}</span>
                        <span className="min-w-0 flex-1 truncate text-panel-fg" title={v}>
                          {v}
                        </span>
                        <button
                          type="button"
                          onClick={() => void write(k, "")}
                          title={labels.removeAttribute}
                          aria-label={`${labels.removeAttribute}: ${k}`}
                          className="text-panel-muted-fg hover:text-panel-fg"
                        >
                          <X className="size-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}

function groupName(group: Exclude<Group, "advanced">, labels: EditorLabels): string {
  return {
    content: labels.groupContent,
    layout: labels.groupLayout,
    spacing: labels.groupSpacing,
    style: labels.groupStyle,
  }[group];
}

/** What is selected, with the actions the canvas toolbar has, so the panel needs no hunt. */
function Header({
  editor,
  component,
  labels,
  onEmailSettings,
}: {
  editor: Editor;
  component: Component;
  labels: EditorLabels;
  onEmailSettings: () => void;
}) {
  const tag = tagOf(component);
  const isBody = tag === "mj-body";
  const name = isBody
    ? labels.emailSettings
    : (labels.elementNames[tag] ?? tag.replace(/^mj-/, ""));
  // What it says, as Layers names it; a column's number is not something it says.
  const words = tag === "mj-column" ? "" : layerName(component, labels);
  const excerpt = words === name ? "" : words;
  const parent = component.parent();
  const action =
    "flex size-7 items-center justify-center rounded-md text-panel-muted-fg hover:bg-panel-hover hover:text-panel-fg";
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-panel-border bg-panel px-3 py-2">
      <div className="min-w-0 flex-1">
        <p
          data-focus-target
          tabIndex={-1}
          className="truncate text-sm font-medium text-panel-fg outline-none"
        >
          {name}
        </p>
        {excerpt && !isBody && (
          <p className="truncate text-[11px] text-panel-muted-fg">“{excerpt}”</p>
        )}
      </div>
      {!isBody && parent && (
        <button
          type="button"
          className={action}
          title={labels.selectParent}
          aria-label={labels.selectParent}
          onClick={() => (tagOf(parent) === "mj-body" ? onEmailSettings() : editor.select(parent))}
        >
          <ArrowUp className="size-3.5" />
        </button>
      )}
      {!isBody && (
        <>
          <button
            type="button"
            className={action}
            title={labels.duplicate}
            aria-label={labels.duplicate}
            onClick={() => editor.runCommand("tlb-clone")}
          >
            <Copy className="size-3.5" />
          </button>
          <button
            type="button"
            className={action}
            title={labels.deleteElement}
            aria-label={labels.deleteElement}
            onClick={() => editor.runCommand("tlb-delete")}
          >
            <Trash2 className="size-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
