"use client";

/**
 * The color control for every color property in the Style Manager.
 *
 * GrapesJS's own is a text box and a swatch that opens Spectrum, a jQuery picker that
 * cannot be styled into the editor. This keeps the text box — typing a hex is often the
 * fastest way — and opens a picker with the colors the email already uses, which is what
 * keeps a design consistent.
 */

import { useEffect, useRef, useState } from "react";
import { HexAlphaColorPicker, HexColorPicker } from "react-colorful";
import { Pipette } from "lucide-react";

import type { EditorLabels } from "../../labels.js";
import { cn } from "../../lib/utils";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "../ui/popover";

/** Web-safe neutrals and a few saturated hues; emails rarely want more than this. */
const PRESETS = [
  "#000000",
  "#374151",
  "#6b7280",
  "#d1d5db",
  "#f3f4f6",
  "#ffffff",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0284c7",
  "#4f46e5",
  "#9333ea",
  "#db2777",
];

// Chrome's EyeDropper; absent elsewhere, and so is the button.
type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };
const eyeDropper = (): EyeDropperCtor | undefined =>
  (globalThis as { EyeDropper?: EyeDropperCtor }).EyeDropper;

export default function ColorField({
  value,
  placeholder,
  documentColors,
  labels,
  onChange,
  onSelectionChange,
}: {
  value: string;
  /** The property's default, shown when no value is set. */
  placeholder?: string;
  /** Read when the picker opens, so it reflects the email as it is now. */
  documentColors: () => string[];
  /** Passed in rather than read from context: this renders in its own React root. */
  labels: EditorLabels;
  /** `partial` while dragging, so GrapesJS records one undo step per change, not per pixel. */
  onChange: (value: string, partial: boolean) => void;
  /** Subscribes to the selection about to change; returns the unsubscribe. */
  onSelectionChange: (listener: () => void) => () => void;
}) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState<string[]>([]);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The value a drag left as a partial update, still to be committed.
  const dragged = useRef<string | null>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  // The picker opens beside the panel the field sits in, level with the field. Anchored to
  // the field itself it covered the panel, since a property can be half the panel wide.
  const anchor = useRef({
    getBoundingClientRect: () => {
      const field = fieldRef.current?.getBoundingClientRect() ?? new DOMRect();
      const panel = fieldRef.current?.closest(".editor-dark")?.getBoundingClientRect();
      return new DOMRect(panel?.right ?? field.right, field.top, 0, field.height);
    },
  });

  useEffect(() => setText(value), [value]);
  // A drag cut short by the view going away still ends as a real change, with an undo step.
  const latestOnChange = useRef(onChange);
  latestOnChange.current = onChange;
  useEffect(
    () => () => {
      clearTimeout(commitTimer.current ?? undefined);
      if (dragged.current !== null) latestOnChange.current(dragged.current, false);
    },
    [],
  );

  const hex = toHex(value) ?? toHex(placeholder ?? "") ?? "#000000";
  // Translucent colors keep their alpha, and get the slider to change it.
  const translucent = hex.length === 9;
  const empty = !value;

  const commit = (next: string) => {
    clearTimeout(commitTimer.current ?? undefined);
    dragged.current = null;
    onChange(next, false);
  };

  // GrapesJS writes to whatever is selected when the commit runs, so a drag still waiting
  // for it is committed before another element is selected rather than onto that one.
  const latestCommit = useRef(commit);
  latestCommit.current = commit;
  useEffect(
    () =>
      onSelectionChange(() => {
        if (dragged.current !== null) latestCommit.current(dragged.current);
      }),
    [onSelectionChange],
  );

  // react-colorful has no "drag ended"; a pause stands in for it.
  const drag = (next: string) => {
    setText(next);
    dragged.current = next;
    onChange(next, true);
    clearTimeout(commitTimer.current ?? undefined);
    commitTimer.current = setTimeout(() => commit(next), 300);
  };

  const pickFromScreen = async () => {
    const Ctor = eyeDropper();
    if (!Ctor) return;
    try {
      const { sRGBHex } = await new Ctor().open();
      commit(sRGBHex);
    } catch {
      // Escape cancels the eyedropper; nothing to do.
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setUsed(documentColors());
        // Closing by Escape or a click outside unmounts the hex input without a blur, so
        // a value typed there is committed here rather than lost.
        else if (text.trim() !== value) commit(text.trim());
        setOpen(next);
      }}
    >
      <PopoverAnchor virtualRef={anchor} />
      <div
        ref={fieldRef}
        className="flex h-8 w-full items-center gap-1.5 rounded-md border border-panel-border bg-panel-elevated pr-1.5 pl-2 focus-within:border-brand"
      >
        <input
          value={text}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text !== value && commit(text.trim())}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(text.trim());
            if (e.key === "Escape") setText(value);
          }}
          className="min-w-0 flex-1 bg-transparent font-mono text-xs text-panel-fg outline-none placeholder:text-panel-muted-fg"
        />
        <PopoverTrigger asChild>
          <button
            type="button"
            title={labels.colorPickerOpen}
            aria-label={labels.colorPickerOpen}
            className="relative size-5 shrink-0 overflow-hidden rounded border border-white/20 outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Checkerboard />
            {!empty && <span className="absolute inset-0" style={{ background: value }} />}
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        className="editor-dark flex w-52 flex-col gap-2.5 border border-panel-border bg-panel p-2.5 text-panel-fg"
      >
        {translucent ? (
          <HexAlphaColorPicker color={hex} onChange={drag} className="color-field-picker" />
        ) : (
          <HexColorPicker color={hex} onChange={drag} className="color-field-picker" />
        )}

        <div className="flex items-center gap-1.5">
          <span
            className="size-6 shrink-0 rounded border border-white/20"
            style={{ background: hex }}
          />
          <input
            value={text}
            spellCheck={false}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commit(text.trim())}
            onBlur={() => text !== value && commit(text.trim())}
            className="h-6 min-w-0 flex-1 rounded border border-panel-border bg-panel-elevated px-1.5 font-mono text-[11px] outline-none focus:border-brand"
          />
          {eyeDropper() && (
            <button
              type="button"
              onClick={() => void pickFromScreen()}
              title={labels.colorPickerEyedropper}
              aria-label={labels.colorPickerEyedropper}
              className="flex size-6 shrink-0 items-center justify-center rounded border border-panel-border bg-panel-elevated text-panel-muted-fg hover:text-panel-fg"
            >
              <Pipette className="size-3" />
            </button>
          )}
        </div>

        {used.length > 0 && (
          <Swatches
            title={labels.colorPickerDocument}
            colors={used}
            current={hex}
            onPick={commit}
          />
        )}
        <Swatches
          title={labels.colorPickerPresets}
          colors={PRESETS}
          current={hex}
          onPick={commit}
          transparentLabel={labels.colorPickerTransparent}
        />
      </PopoverContent>
    </Popover>
  );
}

function Swatches({
  title,
  colors,
  current,
  onPick,
  transparentLabel,
}: {
  title: string;
  colors: string[];
  current: string;
  onPick: (color: string) => void;
  /** Adds a "transparent" swatch at the end when given. */
  transparentLabel?: string;
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-medium tracking-wide text-panel-muted-fg uppercase">
        {title}
      </p>
      <div className="grid grid-cols-8 gap-1">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            title={color}
            onClick={() => onPick(color)}
            className={cn(
              "aspect-square rounded border border-white/15 outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-brand",
              color.toLowerCase() === current.toLowerCase() && "ring-2 ring-brand",
            )}
            style={{ background: color }}
          />
        ))}
        {transparentLabel && (
          <button
            type="button"
            title={transparentLabel}
            onClick={() => onPick("transparent")}
            className="relative aspect-square overflow-hidden rounded border border-white/15 outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Checkerboard />
          </button>
        )}
      </div>
    </div>
  );
}

function Checkerboard() {
  return (
    <span
      className="absolute inset-0"
      style={{
        backgroundImage: "repeating-conic-gradient(#9ca3af 0% 25%, #e5e7eb 0% 50%)",
        backgroundSize: "8px 8px",
      }}
    />
  );
}

/**
 * `#rgb`, `#rrggbb(aa)` and `rgb()/rgba()` to `#rrggbb`, or `#rrggbbaa` when translucent
 * unless `opaque` is set; anything else (names, `transparent`) to null.
 */
export function toHex(value: string, { opaque = false } = {}): string | null {
  const v = value.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{8}$/.test(v)) return opaque || v.endsWith("ff") ? v.slice(0, 7) : v;
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?/.exec(v);
  if (rgb) {
    const channels = [rgb[1], rgb[2], rgb[3]].map((n) => Math.min(255, Number(n)));
    const alphaText = rgb[4];
    const alpha = alphaText?.endsWith("%") ? parseFloat(alphaText) / 100 : Number(alphaText ?? 1);
    if (!opaque && alpha < 1) channels.push(Math.round(Math.max(0, alpha) * 255));
    return `#${channels.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  }
  return null;
}
