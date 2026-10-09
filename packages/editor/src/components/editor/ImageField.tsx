"use client";

/**
 * The control for image properties in the Style Manager, such as a section's
 * `background-url`.
 *
 * GrapesJS's own set the preview's `background-image` to the raw value. MJML stores a bare
 * URL there, not `url(...)`, so the preview was invalid CSS and stayed empty. This one shows
 * the image itself and opens the same picker, with the gallery, as an `mj-image` does.
 */

import { ImageIcon } from "lucide-react";

import type { EditorLabels } from "../../labels.js";

export default function ImageField({
  value,
  labels,
  onChoose,
}: {
  value: string;
  labels: EditorLabels;
  onChoose: () => void;
}) {
  const url = imageUrl(value);
  return (
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
  );
}

/** A bare URL (MJML attributes) or `url("…")` (CSS) to the URL; nothing usable to null. */
export function imageUrl(value: string): string | null {
  const v = value.trim();
  if (!v || v === "none") return null;
  const css = /^url\(\s*(['"]?)(.*?)\1\s*\)$/i.exec(v);
  return css ? css[2] || null : v;
}
