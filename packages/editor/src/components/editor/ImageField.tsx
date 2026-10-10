"use client";

/**
 * The control for image properties in the Style Manager, such as a section's
 * `background-url`.
 *
 * GrapesJS's own set the preview's `background-image` to the raw value. MJML stores a bare
 * URL there, not `url(...)`, so the preview was invalid CSS and stayed empty. This one shows
 * the image itself and opens the same picker, with the gallery, as an `mj-image` does.
 */

import { ImageIcon, X } from "lucide-react";

import type { EditorLabels } from "../../labels.js";

export default function ImageField({
  value,
  labels,
  onChoose,
  onClear,
}: {
  value: string;
  labels: EditorLabels;
  onChoose: () => void;
  /** The label's own clear button is missing on sub-properties, such as a background layer. */
  onClear: () => void;
}) {
  const url = imageUrl(value);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onChoose}
        title={labels.chooseImage}
        className="group relative block w-full overflow-hidden rounded-md border border-panel-border bg-panel-elevated outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        {url ? (
          <img src={url} alt="" className="h-24 w-full bg-black/25 object-contain" />
        ) : (
          <span className="flex h-16 flex-col items-center justify-center gap-1 text-xs text-panel-muted-fg">
            <ImageIcon className="size-5" />
            {labels.chooseImage}
          </span>
        )}
        {url && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
            {labels.chooseImage}
          </span>
        )}
      </button>
      {value && (
        <button
          type="button"
          onClick={onClear}
          title={labels.imageFieldRemove}
          aria-label={labels.imageFieldRemove}
          className="absolute top-1 right-1 flex size-5 items-center justify-center rounded bg-black/60 text-white hover:bg-black/80"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

/**
 * A bare URL (MJML attributes) or `url("…")` (CSS) to the URL. Anything else — `none`, a
 * gradient or another CSS image function — to null, as there is no image to show.
 */
export function imageUrl(value: string): string | null {
  const v = value.trim();
  if (!v || v === "none") return null;
  const css = /^url\(\s*(['"]?)(.*?)\1\s*\)$/i.exec(v);
  if (css) return css[2] || null;
  return /^[a-z-]+\(/i.test(v) ? null : v;
}
