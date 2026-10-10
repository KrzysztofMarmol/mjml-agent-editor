"use client";

/**
 * The image picker, replacing GrapesJS's asset modal.
 *
 * GrapesJS's own modal could not be styled into the editor, and its "click to upload" area
 * was a transparent file input that did not open the file browser at all. This one is
 * opened by GrapesJS (`assetManager.custom`), so the canvas double-click, the toolbar button
 * and the sidebar all land here, and selecting goes back through GrapesJS to the image.
 */

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Check, ImageUp, Link2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useImageLibrary, useLabels, type ImageAsset } from "../../index.js";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";

type Quota = { readonly used: number; readonly limit: number };

export default function ImagePicker({
  open,
  currentUrl,
  onSelect,
  onClose,
}: {
  open: boolean;
  /** The image being replaced, marked in the gallery. */
  currentUrl?: string;
  onSelect: (url: string) => void;
  onClose: () => void;
}) {
  const library = useImageLibrary();
  const labels = useLabels();
  const [images, setImages] = useState<readonly ImageAsset[]>([]);
  const [quota, setQuota] = useState<Quota>();
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [url, setUrl] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Bumped on every open and close. An upload still running when the picker closes, or
  // reopens for another image, must not apply its result to whatever is open now.
  const session = useRef(0);
  // Read through refs so neither a new `labels` object nor a new `onSelect` from a parent
  // render re-runs the open effect — that would wipe a half-typed URL.
  const latest = useRef({ labels, onSelect });
  latest.current = { labels, onSelect };
  // Opening, uploading and deleting each list the gallery; only the newest answer is shown.
  const lists = useRef(0);

  const refresh = useCallback(async () => {
    if (!library) return;
    const mine = ++lists.current;
    setLoading(true);
    try {
      const result = await library.list();
      if (mine !== lists.current) return;
      setImages(result.images);
      setQuota(result.quota);
    } catch (err) {
      console.error(err);
      if (mine === lists.current) toast.error(latest.current.labels.imagePickerLoadFailed);
    } finally {
      if (mine === lists.current) setLoading(false);
    }
  }, [library]);

  useEffect(() => {
    session.current += 1;
    if (!open) return;
    setUrl("");
    setConfirmId(null);
    void refresh();
    // Once per opening; `refresh` reads the latest props through `latest`.
  }, [open]);

  const accepts = (file: File) => matchesAccept(file, library?.accept);

  const full = quota !== undefined && quota.used >= quota.limit;

  const upload = async (files: FileList | null) => {
    if (!library || !files?.length) return;
    const mine = session.current;
    // The input's `accept` covers browsing; a drop bypasses it, so check here too rather
    // than send a whole file only to have the host refuse it.
    const list = Array.from(files).filter((f) => {
      if (accepts(f)) return true;
      toast.error(labels.imagePickerUnsupported(f.name));
      return false;
    });
    if (!list.length) return;
    setPending((n) => n + list.length);
    // Settled rather than all: an upload that succeeded has already been stored and
    // counted by the host, so one failure must not hide it.
    // Async, so an adapter that throws rather than rejects still settles.
    const results = await Promise.allSettled(list.map(async (f) => library.upload(f)));
    setPending((n) => n - list.length);
    for (const r of results) {
      if (r.status === "rejected") {
        console.error(r.reason);
        // The host's message is usually the actionable part ("limit reached", "too large").
        toast.error(r.reason instanceof Error ? r.reason.message : labels.imageUploadFailed);
      }
    }
    if (session.current !== mine) return;
    await refresh();
    // One file dropped while editing an image is meant for that image.
    const [only] = results;
    if (results.length === 1 && only?.status === "fulfilled" && session.current === mine) {
      latest.current.onSelect(only.value.url);
    }
  };

  const remove = async (image: ImageAsset) => {
    if (!library?.remove) return;
    // Two clicks rather than a confirm(): an image in use breaks every email showing it.
    if (confirmId !== image.id) {
      setConfirmId(image.id);
      return;
    }
    setConfirmId(null);
    try {
      await library.remove(image.id);
      await refresh();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : labels.imageDeleteFailed);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!full) void upload(e.dataTransfer.files);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="editor-dark gap-0 overflow-hidden border border-panel-border bg-panel p-0 text-panel-fg ring-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-panel-border px-5 py-4">
          <DialogTitle>{labels.imagePickerTitle}</DialogTitle>
          {quota && (
            <DialogDescription className="text-panel-muted-fg">
              {labels.imagePickerQuota(quota.used, quota.limit)}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto p-5">
          {library &&
            (full ? (
              <p className="rounded-lg border border-panel-border bg-panel-elevated px-4 py-3 text-sm text-panel-muted-fg">
                {labels.imagePickerQuotaFull}
              </p>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={cn(
                  "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
                  dragging ? "border-brand bg-brand-soft" : "border-panel-border bg-panel-elevated",
                )}
              >
                <ImageUp className="size-8 text-panel-muted-fg" />
                <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-panel-muted-fg">
                  <span>{labels.imagePickerDrop}</span>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-brand text-brand-fg hover:bg-brand/90"
                    onClick={() => fileInput.current?.click()}
                  >
                    {labels.imagePickerBrowse}
                  </Button>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept={library.accept ?? "image/*"}
                  multiple
                  hidden
                  onChange={(e) => {
                    void upload(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
            ))}

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const value = url.trim();
              if (value) onSelect(value);
            }}
          >
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-panel-muted-fg" />
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={labels.imagePickerUrlPlaceholder}
                className="h-9 border-panel-border bg-panel-elevated pl-8 text-panel-fg placeholder:text-panel-muted-fg"
              />
            </div>
            <Button
              type="submit"
              size="lg"
              variant="outline"
              disabled={!url.trim()}
              className="border-panel-border bg-panel-elevated text-panel-fg hover:bg-panel-hover hover:text-panel-fg"
            >
              {labels.imagePickerUseUrl}
            </Button>
          </form>

          {library && (
            <section>
              <h3 className="mb-2 text-xs font-medium tracking-wide text-panel-muted-fg uppercase">
                {labels.imagePickerGallery}
              </h3>
              {loading && images.length === 0 && pending === 0 ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : images.length === 0 && pending === 0 ? (
                <p className="py-6 text-center text-sm text-panel-muted-fg">
                  {labels.imagePickerEmpty}
                </p>
              ) : (
                <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {Array.from({ length: pending }, (_, i) => (
                    <li
                      key={`pending-${i}`}
                      className="flex aspect-[4/3] items-center justify-center rounded-lg border border-panel-border bg-panel-elevated"
                    >
                      <Spinner />
                    </li>
                  ))}
                  {images.map((image) => {
                    const selected = image.url === currentUrl;
                    const confirming = confirmId === image.id;
                    return (
                      <li key={image.id} className="group relative">
                        <button
                          type="button"
                          onClick={() => onSelect(image.url)}
                          title={image.name}
                          className={cn(
                            "block aspect-[4/3] w-full overflow-hidden rounded-lg border bg-black/25 transition outline-none focus-visible:ring-2 focus-visible:ring-brand",
                            selected
                              ? "border-brand ring-2 ring-brand"
                              : "border-panel-border hover:border-panel-muted-fg",
                          )}
                        >
                          {/* Contained, not cropped: email images are mostly wide banners, and
                              choosing one means seeing its whole composition. */}
                          <img
                            src={image.url}
                            alt={image.name ?? ""}
                            loading="lazy"
                            className="size-full object-contain"
                          />
                        </button>
                        {selected && (
                          <span className="pointer-events-none absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-full bg-brand text-brand-fg">
                            <Check className="size-3" />
                          </span>
                        )}
                        {image.name && (
                          <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate rounded-b-lg bg-black/60 px-2 py-1 text-[11px] text-white opacity-0 transition group-hover:opacity-100">
                            {image.name}
                          </span>
                        )}
                        {library.remove && (
                          <button
                            type="button"
                            onClick={() => void remove(image)}
                            onBlur={() => confirming && setConfirmId(null)}
                            title={
                              confirming
                                ? labels.imagePickerConfirmDelete
                                : labels.imagePickerDelete
                            }
                            aria-label={labels.imagePickerDelete}
                            className={cn(
                              "absolute top-1.5 right-1.5 flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-white transition focus-visible:opacity-100",
                              confirming
                                ? "bg-red-600 opacity-100"
                                : "bg-black/60 opacity-0 group-hover:opacity-100 hover:bg-black/80",
                            )}
                          >
                            <Trash2 className="size-3.5" />
                            {confirming && labels.imagePickerConfirmDelete}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The subset of `<input accept>` a picker needs: MIME types, `type/*`, and `.ext`. */
function matchesAccept(file: File, accept: string | undefined): boolean {
  if (!accept) return file.type.startsWith("image/");
  return accept.split(",").some((raw) => {
    const rule = raw.trim().toLowerCase();
    if (rule.startsWith(".")) return file.name.toLowerCase().endsWith(rule);
    if (rule.endsWith("/*")) return file.type.startsWith(rule.slice(0, -1));
    return file.type === rule;
  });
}
