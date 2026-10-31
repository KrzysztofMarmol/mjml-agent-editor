"use client";

/**
 * The inputs the Settings inspector is built from. Text-like inputs keep a draft and commit
 * on blur or Enter: every committed attribute re-renders the element through MJML, and one
 * undo step per keystroke is not an undo history anyone can use.
 */

import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Grid2x2, RotateCcw } from "lucide-react";

import type { EditorLabels } from "../../../labels.js";
import { cn } from "../../../lib/utils";
import { Switch } from "../../ui/switch";
import type { Option, Unit } from "./types.js";
import { boxShorthand, parseLength, readBox, SIDES, type Sides } from "./values.js";

const FIELD =
  "h-7 w-full min-w-0 rounded-md border border-panel-border bg-panel-elevated px-2 text-xs text-panel-fg outline-none placeholder:text-panel-muted-fg/70 focus:border-brand";

/** A label, the control, and — when the element sets its own value — a dot and a reset. */
export function Row({
  label,
  help,
  own,
  wide,
  inline,
  labels,
  onReset,
  children,
}: {
  label: string;
  help?: string;
  own: boolean;
  /** Label above the control rather than beside it, for controls that need the width. */
  wide?: boolean;
  /** Label across the row and the control at its end, for a switch. */
  inline?: boolean;
  labels: EditorLabels;
  onReset: () => void;
  children: ReactNode;
}) {
  const caption = (
    <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-panel-muted-fg">
      <span
        aria-hidden
        className={cn("size-1.5 shrink-0 rounded-full", own ? "bg-brand" : "bg-transparent")}
      />
      <span className="truncate">{label}</span>
      {own && (
        <button
          type="button"
          onClick={onReset}
          title={labels.resetToDefault}
          aria-label={`${labels.resetToDefault}: ${label}`}
          className="ml-auto rounded p-0.5 text-panel-muted-fg opacity-0 group-hover/row:opacity-100 hover:text-panel-fg focus-visible:opacity-100"
        >
          <RotateCcw className="size-3" />
        </button>
      )}
    </span>
  );
  return (
    <div className="group/row px-3 py-1">
      {wide ? (
        <div className="flex flex-col gap-1">
          {caption}
          {children}
        </div>
      ) : inline ? (
        <div className="flex items-center justify-between gap-2">
          {caption}
          {children}
        </div>
      ) : (
        <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2">
          {caption}
          {children}
        </div>
      )}
      {help && <p className="mt-1 pl-3 text-[11px] leading-snug text-panel-muted-fg/80">{help}</p>}
    </div>
  );
}

function useDraft(value: string, commit: (next: string) => void) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const done = () => {
    if (draft.trim() !== value) commit(draft.trim());
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") {
      setDraft(value);
      // Blurring after the reset commits nothing, since the draft equals the value again.
      requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
    }
  };
  return { draft, setDraft, done, onKeyDown };
}

export function TextInput({
  value,
  placeholder,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  onCommit: (next: string) => void;
}) {
  const { draft, setDraft, done, onKeyDown } = useDraft(value, onCommit);
  return (
    <input
      className={FIELD}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={done}
      onKeyDown={onKeyDown}
    />
  );
}

/** A bare number gets the first unit, so typing `24` into a px field means 24px. */
function normaliseLength(text: string, units: readonly Unit[]): string | null {
  if (text === "") return "";
  const parsed = parseLength(text, units) ?? parseLength(`${text}${units[0]}`, units);
  return parsed ? `${parsed.amount}${parsed.unit}` : null;
}

export function LengthInput({
  value,
  placeholder,
  units,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  units: readonly Unit[];
  onCommit: (next: string) => void;
}) {
  const [invalid, setInvalid] = useState(false);
  const { draft, setDraft, done, onKeyDown } = useDraft(value, (next) => {
    const normal = normaliseLength(next, units);
    setInvalid(normal === null);
    if (normal !== null) onCommit(normal);
  });
  const step = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return onKeyDown(e);
    e.preventDefault();
    const current = parseLength(draft || placeholder || "", units) ?? {
      amount: "0",
      unit: units[0]!,
    };
    const delta = (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1);
    const next = `${Math.max(0, Number(current.amount) + delta)}${current.unit}`;
    setDraft(next);
    onCommit(next);
  };
  return (
    <input
      className={cn(FIELD, "font-mono", invalid && "border-red-400")}
      value={draft}
      placeholder={placeholder}
      inputMode="decimal"
      aria-invalid={invalid}
      title={units.filter(Boolean).join(", ")}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={done}
      onKeyDown={step}
    />
  );
}

/** Vertical/horizontal pair, which is how emails are spaced, expanding to four sides. */
export function BoxInput({
  attributes,
  attr,
  placeholder,
  units,
  labels,
  onCommit,
}: {
  attributes: Readonly<Record<string, string>>;
  attr: string;
  placeholder?: string;
  units: readonly Unit[];
  labels: EditorLabels;
  onCommit: (shorthand: string) => void;
}) {
  const sides = readBox(attributes, attr);
  const defaults = readBox(placeholder ? { [attr]: placeholder } : {}, attr);
  const symmetric = sides[0] === sides[2] && sides[1] === sides[3];
  const [each, setEach] = useState(!symmetric);
  useEffect(() => {
    if (!symmetric) setEach(true);
  }, [symmetric]);

  const set = (indices: number[], v: string) => {
    // Sides left unset keep showing MJML's default; writing them as 0 would move them.
    const next = sides.map((s, i) => s || defaults[i]!) as Sides;
    for (const i of indices) next[i] = v || defaults[i]!;
    onCommit(next.every((s, i) => s === defaults[i]) ? "" : boxShorthand(next));
  };

  const sideNames = [labels.sideTop, labels.sideRight, labels.sideBottom, labels.sideLeft];
  const pairs: [string, number[]][] = each
    ? SIDES.map((_, i) => [sideNames[i]!, [i]])
    : [
        [labels.sidesVertical, [0, 2]],
        [labels.sidesHorizontal, [1, 3]],
      ];

  return (
    <div className="flex items-start gap-1.5">
      <div className={cn("grid flex-1 gap-1.5", each ? "grid-cols-4" : "grid-cols-2")}>
        {pairs.map(([name, indices]) => (
          <label key={name} className="flex min-w-0 flex-col gap-0.5" title={name}>
            <LengthInput
              value={sides[indices[0]!]!}
              placeholder={defaults[indices[0]!] || "0"}
              units={units}
              onCommit={(v) => set(indices, v)}
            />
            <span className="truncate text-center text-[10px] text-panel-muted-fg/80">{name}</span>
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setEach((v) => !v)}
        disabled={each && !symmetric}
        aria-pressed={each}
        title={labels.editEachSide}
        aria-label={labels.editEachSide}
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md border border-panel-border text-panel-muted-fg hover:text-panel-fg disabled:opacity-40",
          each && "border-brand text-panel-fg",
        )}
      >
        <Grid2x2 className="size-3.5" />
      </button>
    </div>
  );
}

const ALIGN_ICONS: Record<string, ReactNode> = {
  left: <AlignLeft className="size-3.5" />,
  center: <AlignCenter className="size-3.5" />,
  right: <AlignRight className="size-3.5" />,
  justify: <AlignJustify className="size-3.5" />,
};

export function Segmented({
  value,
  fallback,
  options,
  name,
  onCommit,
}: {
  value: string;
  /** Shown as selected, unpressed, while nothing is set: MJML's default. */
  fallback?: string;
  options: readonly Option[];
  name: (option: Option) => string;
  onCommit: (next: string) => void;
}) {
  const current = value || fallback;
  const iconsOnly = options.every((o) => o.value in ALIGN_ICONS);
  return (
    <div className="flex h-7 overflow-hidden rounded-md border border-panel-border bg-panel-elevated">
      {options.map((o) => {
        const active = current === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            title={name(o)}
            aria-label={name(o)}
            onClick={() => o.value !== value && onCommit(o.value)}
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center px-1 text-[11px] text-panel-muted-fg transition-colors hover:text-panel-fg",
              active &&
                (value
                  ? "bg-brand text-brand-fg hover:text-brand-fg"
                  : "bg-panel-hover text-panel-fg"),
            )}
          >
            {iconsOnly ? ALIGN_ICONS[o.value] : <span className="truncate">{name(o)}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Select({
  value,
  fallback,
  options,
  name,
  onCommit,
}: {
  value: string;
  fallback?: string;
  options: readonly Option[];
  name: (option: Option) => string;
  onCommit: (next: string) => void;
}) {
  // A value no option names (an agent's own font stack) stays visible and selected.
  const known = !value || options.some((o) => o.value === value);
  const fallbackOption = options.find((o) => o.value === fallback);
  return (
    <select
      className={cn(FIELD, "px-1.5")}
      value={value || ""}
      onChange={(e) => onCommit(e.target.value)}
    >
      {/* Unset: MJML's default applies. */}
      <option value="">{fallbackOption ? name(fallbackOption) : "—"}</option>
      {!known && <option value={value}>{value}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {name(o)}
        </option>
      ))}
    </select>
  );
}

export function Toggle({
  checked,
  label,
  onCommit,
}: {
  checked: boolean;
  label: string;
  onCommit: (next: boolean) => void;
}) {
  return (
    <Switch
      checked={checked}
      onCheckedChange={onCommit}
      aria-label={label}
      className="justify-self-end data-checked:bg-brand data-unchecked:bg-panel-border"
    />
  );
}
