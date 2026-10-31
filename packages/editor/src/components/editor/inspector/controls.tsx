"use client";

/**
 * The inputs the Settings inspector is built from. Text-like inputs keep a draft and commit
 * on blur or Enter: every committed attribute re-renders the element through MJML, and one
 * undo step per keystroke is not an undo history anyone can use.
 */

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Grid2x2,
  RotateCcw,
} from "lucide-react";

import type { EditorLabels } from "../../../labels.js";
import { cn } from "../../../lib/utils";
import { Switch } from "../../ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import type { Option, Unit } from "./types.js";
import { boxShorthand, parseLength, readBox, SIDES, type Sides } from "./values.js";

const FIELD =
  "h-7 w-full min-w-0 rounded-md border border-panel-border bg-panel-elevated px-2 text-xs text-panel-fg outline-none placeholder:text-panel-muted-fg/70 focus:border-brand";

// The ids of the caption and the help of the Row a control sits in: the caption is not a
// <label>, as it holds the reset button, so the control is named by reference.
const FieldLabel = createContext<{ label?: string; help?: string }>({});
/** `aria-labelledby` and `aria-describedby` for a control inside a Row. */
export const useFieldLabel = () => {
  const { label, help } = useContext(FieldLabel);
  return { "aria-labelledby": label, "aria-describedby": help };
};

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
  const id = useId();
  const helpId = useId();
  const [helpOpen, setHelpOpen] = useState(false);
  const control = (
    <FieldLabel.Provider value={{ label: id, help: help ? helpId : undefined }}>
      {children}
    </FieldLabel.Provider>
  );
  const caption = (
    <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-panel-muted-fg">
      <span
        aria-hidden
        className={cn("size-1.5 shrink-0 rounded-full", own ? "bg-brand" : "bg-transparent")}
      />
      <span id={id} className="truncate">
        {label}
      </span>
      {/* On demand: shown under every field, the help doubled the panel's length. */}
      {help && (
        // Opened by a tap as well: Radix opens a tooltip on hover and focus, not on touch.
        <Tooltip open={helpOpen} onOpenChange={setHelpOpen}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={help}
              onClick={() => setHelpOpen((open) => !open)}
              className="-m-0.5 shrink-0 rounded p-0.5 text-panel-muted-fg/70 hover:text-panel-fg focus-visible:text-panel-fg"
            >
              <CircleHelp className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-56 leading-snug">
            {help}
          </TooltipContent>
        </Tooltip>
      )}
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
          {control}
        </div>
      ) : inline ? (
        <div className="flex items-center justify-between gap-2">
          {caption}
          {control}
        </div>
      ) : (
        <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2">
          {caption}
          {control}
        </div>
      )}
      {help && (
        <span id={helpId} hidden>
          {help}
        </span>
      )}
    </div>
  );
}

/** `source`: what the shown value is read from, when that can change while it does not. */
function useDraft(value: string, commit: (next: string) => void, source: string = value) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value, source]);
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
  accept,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  /** False for text the field must not write; it is kept, marked, for the visitor to fix. */
  accept?: (next: string) => boolean;
  onCommit: (next: string) => void;
}) {
  const [invalid, setInvalid] = useState(false);
  const field = useFieldLabel();
  const { draft, setDraft, done, onKeyDown } = useDraft(value, (next) => {
    const ok = !accept || accept(next);
    setInvalid(!ok);
    if (ok) onCommit(next);
  });
  return (
    <input
      className={cn(FIELD, invalid && "border-red-400")}
      {...field}
      aria-invalid={invalid}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={done}
      onKeyDown={onKeyDown}
    />
  );
}

const BARE_NUMBER = /^-?\d*\.?\d+$/;

/**
 * Typed text as the length to write: a bare number takes `unit` (the field's current one),
 * so typing `24` into a px field means 24px. Null for what the field cannot write, a negative
 * included unless MJML takes one there.
 */
export function normaliseLength(
  text: string,
  units: readonly Unit[],
  negative = false,
  unit: Unit = units[0]!,
): string | null {
  if (text === "") return "";
  // Before parseLength, which reads a bare number as unitless where that is allowed.
  const parsed = BARE_NUMBER.test(text) ? { amount: text, unit } : parseLength(text, units);
  if (!parsed || (!negative && parsed.amount.startsWith("-"))) return null;
  return `${parsed.amount}${parsed.unit}`;
}

/**
 * `amount` moved by `delta`, to two decimals, not below zero unless allowed. Unchanged where
 * the result would not be a plain decimal (`1e+22`, `Infinity`), which MJML rejects.
 */
export function stepAmount(amount: string, delta: number, negative = false): string {
  const moved = Math.round((Number(amount) + delta) * 100) / 100;
  const next = String(negative ? moved : Math.max(0, moved));
  return BARE_NUMBER.test(next) ? next : amount;
}

// A hold on a step button keeps stepping, after a pause long enough for a single click.
const REPEAT_AFTER_MS = 400;
const REPEAT_EVERY_MS = 60;

/**
 * A number with its unit beside it, steppable by the arrows, the arrow keys (Shift for 10) or
 * holding a step button. A hold is shown as it goes and recorded as one change when released.
 * A value the field cannot read, such as one the agent wrote in another unit, shows whole and
 * is not stepped: stepping it from zero would throw it away.
 */
export function LengthInput({
  value,
  placeholder,
  units,
  negative = false,
  compact = false,
  labelledBy,
  labels,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  units: readonly Unit[];
  negative?: boolean;
  /** Too narrow for the arrows to stay: they show on hover and focus, the unit cannot change. */
  compact?: boolean;
  /** Ids naming the field, when the Row's caption alone does not. */
  labelledBy?: string;
  labels: EditorLabels;
  onCommit: (next: string, partial?: boolean) => void;
}) {
  const fieldLabel = useFieldLabel();
  const own = parseLength(value, units);
  const fallback = parseLength(placeholder ?? "", units);
  // Picked while the field is empty; a value carries its own unit.
  const [picked, setPicked] = useState<Unit | null>(null);
  const unit = own?.unit ?? picked ?? fallback?.unit ?? units[0]!;
  const [invalid, setInvalid] = useState(false);
  // The latest, for a hold that outlives the render it began in: what it may write can change
  // under it, as when an agent turn locks the editor.
  const commit = useRef(onCommit);
  commit.current = onCommit;
  // Ends a hold still running: before any other edit of this field, and when it goes away.
  const endHold = useRef<(() => void) | null>(null);
  useEffect(() => () => endHold.current?.(), []);

  const { draft, setDraft, done, onKeyDown } = useDraft(
    own ? own.amount : value,
    (next) => {
      endHold.current?.();
      const normal = normaliseLength(next, units, negative, unit);
      setInvalid(normal === null);
      if (normal !== null) commit.current(normal);
    },
    value,
  );

  // Where a step starts: what is typed, else the default in the current unit, else zero.
  // Null for text the field cannot read.
  const from = (): { amount: string; unit: Unit } | null => {
    const text = draft.trim();
    if (BARE_NUMBER.test(text)) return { amount: text, unit };
    if (text === "") return { amount: fallback?.amount ?? "0", unit };
    return parseLength(text, units);
  };
  const stepOnce = (delta: number) => {
    endHold.current?.();
    const start = from();
    if (!start) return setInvalid(true);
    const amount = stepAmount(start.amount, delta, negative);
    setInvalid(false);
    setDraft(amount);
    commit.current(`${amount}${start.unit}`);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return onKeyDown(e);
    e.preventDefault();
    stepOnce((e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1));
  };

  const press = (direction: 1 | -1) => (e: React.PointerEvent<HTMLButtonElement>) => {
    // One hold at a time: a second finger, or the other arrow, waits for the first to end.
    if (e.button !== 0 || endHold.current) return;
    // Focus stays where it was; the press is not a click on the field.
    e.preventDefault();
    const start = from();
    if (!start) return setInvalid(true);
    const delta = direction * (e.shiftKey ? 10 : 1);
    let amount = stepAmount(start.amount, delta, negative);
    const show = () => {
      setInvalid(false);
      setDraft(amount);
      commit.current(`${amount}${start.unit}`, true);
    };
    show();
    let timer = window.setTimeout(function repeat() {
      amount = stepAmount(amount, delta, negative);
      show();
      timer = window.setTimeout(repeat, REPEAT_EVERY_MS);
    }, REPEAT_AFTER_MS);
    const button = e.currentTarget;
    // Captured, so a release over the canvas iframe still reaches the button; the window, the
    // blur and the cancel end it where capture is missing or the pointer is taken away.
    try {
      button.setPointerCapture(e.pointerId);
    } catch {
      // Not supported here; the window's listeners below end the hold.
    }
    const events = ["pointerup", "pointercancel", "lostpointercapture"] as const;
    const end = () => {
      window.clearTimeout(timer);
      for (const type of events) button.removeEventListener(type, end);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("blur", end);
      endHold.current = null;
      commit.current(`${amount}${start.unit}`);
    };
    endHold.current = end;
    for (const type of events) button.addEventListener(type, end);
    window.addEventListener("pointerup", end);
    window.addEventListener("blur", end);
  };
  // A click with no pointer behind it (`detail` 0) is the keyboard or assistive technology
  // pressing the button; a pointer's click follows the press, which already stepped.
  const click = (direction: 1 | -1) => (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.detail === 0) stepOnce(direction);
  };

  const pickUnit = () => {
    const next = units[(units.indexOf(unit) + 1) % units.length]!;
    const text = draft.trim();
    if (!BARE_NUMBER.test(text)) return setPicked(next);
    const normal = normaliseLength(text, units, negative, next);
    // A number the field refuses (a negative) is not written in another unit either.
    if (normal === null) return setInvalid(true);
    setPicked(next);
    commit.current(normal);
  };
  const unitName = (u: Unit) => u || labels.noUnit;
  // Only a value the field reads as a number has a unit to show beside it.
  const readable = draft.trim() === "" || BARE_NUMBER.test(draft.trim());

  const arrow =
    "flex h-1/2 w-3.5 items-center justify-center text-panel-muted-fg hover:bg-panel-hover hover:text-panel-fg";
  return (
    <div
      className={cn(
        "group/length flex h-7 w-full min-w-0 items-center overflow-hidden rounded-md border border-panel-border bg-panel-elevated focus-within:border-brand",
        invalid && "border-red-400",
      )}
    >
      <input
        className="h-full w-full min-w-0 flex-1 bg-transparent pl-2 font-mono text-xs text-panel-fg outline-none placeholder:text-panel-muted-fg/70"
        value={draft}
        placeholder={fallback ? fallback.amount : placeholder}
        inputMode="decimal"
        {...fieldLabel}
        aria-labelledby={labelledBy ?? fieldLabel["aria-labelledby"]}
        aria-invalid={invalid}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={done}
        onKeyDown={onKey}
      />
      {readable &&
        (units.length > 1 && !compact ? (
          <button
            type="button"
            onClick={pickUnit}
            title={labels.changeUnit(unitName(unit))}
            aria-label={labels.changeUnit(unitName(unit))}
            className="shrink-0 rounded px-0.5 font-mono text-[10px] text-panel-muted-fg underline decoration-dotted underline-offset-2 hover:text-panel-fg"
          >
            {unitName(unit)}
          </button>
        ) : (
          // Narrow, the unit gives its place to the arrows while they show; a unit is typed.
          <span
            aria-hidden
            className={cn(
              "shrink-0 px-0.5 font-mono text-[10px] text-panel-muted-fg",
              compact && "group-focus-within/length:hidden group-hover/length:hidden",
            )}
          >
            {unitName(unit)}
          </span>
        ))}
      <span
        className={cn(
          "h-full shrink-0 flex-col border-l border-panel-border",
          compact ? "hidden group-focus-within/length:flex group-hover/length:flex" : "flex",
        )}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label={labels.increase}
          onPointerDown={press(1)}
          onClick={click(1)}
          className={arrow}
        >
          <ChevronUp className="size-2.5" />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label={labels.decrease}
          onPointerDown={press(-1)}
          onClick={click(-1)}
          className={arrow}
        >
          <ChevronDown className="size-2.5" />
        </button>
      </span>
    </div>
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
  onCommit: (shorthand: string, partial?: boolean) => void;
}) {
  const sides = readBox(attributes, attr);
  const defaults = readBox(placeholder ? { [attr]: placeholder } : {}, attr);
  const symmetric = sides[0] === sides[2] && sides[1] === sides[3];
  const [each, setEach] = useState(!symmetric);
  useEffect(() => {
    if (!symmetric) setEach(true);
  }, [symmetric]);

  const set = (indices: number[], v: string, partial?: boolean) => {
    // Sides left unset keep showing MJML's default; writing them as 0 would move them.
    const next = sides.map((s, i) => s || defaults[i]!) as Sides;
    for (const i of indices) next[i] = v || defaults[i]!;
    onCommit(next.every((s, i) => s === defaults[i]) ? "" : boxShorthand(next), partial);
  };

  const fieldLabel = useFieldLabel();
  const sideId = useId();
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
              compact={each}
              labels={labels}
              labelledBy={[fieldLabel["aria-labelledby"], `${sideId}-${indices[0]}`]
                .filter(Boolean)
                .join(" ")}
              onCommit={(v, partial) => set(indices, v, partial)}
            />
            <span
              id={`${sideId}-${indices[0]}`}
              className="truncate text-center text-[10px] text-panel-muted-fg/80"
            >
              {name}
            </span>
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
  const field = useFieldLabel();
  return (
    <select
      className={cn(FIELD, "px-1.5")}
      {...field}
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
