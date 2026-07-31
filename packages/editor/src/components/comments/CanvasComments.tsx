"use client";

import { useEditorMaybe } from "@grapesjs/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, MessageSquarePlus, X } from "lucide-react";

import { useCommentStore, type CommentTarget, type SectionComment } from "../../index.js";
import { Popover, PopoverAnchor, PopoverContent } from "../ui/popover";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

type Props = {
  docId: string;
  /** Sparkles-button target → opens the compose popover for that element. */
  composeTarget: CommentTarget | null;
  onComposeConsumed: () => void;
  /** Bump to refetch comments (after agent turns). */
  refreshSignal: number;
  onOpenCountChange: (n: number) => void;
};

type Pos = { top: number; left: number };

// Anchor key = the stable css-class the comment is attached to.
const keyOf = (c: Pick<SectionComment, "objectId" | "sectionId">) =>
  c.objectId ? `obj-${c.objectId}` : `sec-${c.sectionId}`;
const keyOfTarget = (t: CommentTarget) => (t.objectId ? `obj-${t.objectId}` : `sec-${t.sectionId}`);

export default function CanvasComments({
  docId,
  composeTarget,
  onComposeConsumed,
  refreshSignal,
  onOpenCountChange,
}: Props) {
  // Injected by the host rather than imported, so comments carry no database.
  const commentStore = useCommentStore();
  const editor = useEditorMaybe();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [comments, setComments] = useState<SectionComment[]>([]);
  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [composeInfo, setComposeInfo] = useState<CommentTarget | null>(null);
  const [body, setBody] = useState("");

  const reload = useCallback(() => {
    commentStore.list(docId).then(setComments).catch(console.error);
  }, [docId]);

  useEffect(() => {
    reload();
  }, [reload, refreshSignal]);

  const open = useMemo(() => comments.filter((c) => c.status === "open"), [comments]);

  useEffect(() => {
    onOpenCountChange(open.length);
  }, [open.length, onOpenCountChange]);

  // One pin per commented anchor (element or section), with its open comments.
  const pins = useMemo(() => {
    const map = new Map<string, SectionComment[]>();
    for (const c of open) {
      const k = keyOf(c);
      const arr = map.get(k) ?? [];
      arr.push(c);
      map.set(k, arr);
    }
    return [...map.entries()].map(([key, list]) => ({ key, list }));
  }, [open]);

  // Refs so the event-driven recompute reads fresh values without re-subscribing.
  const openRef = useRef(open);
  openRef.current = open;
  const activeRef = useRef(activeKey);
  activeRef.current = activeKey;
  const positionsRef = useRef<Record<string, Pos>>({});

  // Positions of pins/popover, computed from the elements' rects in the canvas iframe.
  const recompute = useCallback(() => {
    const ed = editor;
    const container = containerRef.current;
    if (!ed || !container) return;
    const frame = ed.Canvas.getFrameEl?.();
    const cdoc = ed.Canvas.getDocument?.();
    if (!frame || !cdoc) return;
    const cRect = container.getBoundingClientRect();
    const fRect = frame.getBoundingClientRect();
    // The iframe is scaled by GrapesJS zoom (transform), so its on-screen rect
    // (fRect) is scaled while elements INSIDE it report unscaled coordinates.
    // Map an inner coordinate to screen by this zoom factor.
    const zoom = frame.offsetWidth ? fRect.width / frame.offsetWidth : 1;
    const keys = new Set<string>(openRef.current.map(keyOf));
    if (activeRef.current) keys.add(activeRef.current);
    const next: Record<string, Pos> = {};
    keys.forEach((k) => {
      const el = cdoc.querySelector(`.${k}`) as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Element's top-right corner mapped from iframe coords to screen (× zoom),
      // then a small constant offset so the pin sits just past the right edge.
      next[k] = {
        top: fRect.top - cRect.top + r.top * zoom + 4,
        left: fRect.left - cRect.left + (r.left + r.width) * zoom + 8,
      };
    });
    if (JSON.stringify(positionsRef.current) !== JSON.stringify(next)) {
      positionsRef.current = next;
      setPositions(next);
    }
  }, [editor]);

  // Recompute on canvas activity (edits, scroll, device change, resize) + a
  // low-frequency safety net for layout shifts the events miss.
  useEffect(() => {
    const ed = editor;
    if (!ed) return;
    const evts = [
      "canvas:update",
      "update",
      "change:device",
      "load",
      "component:update",
      "component:mount",
    ];
    evts.forEach((e) => ed.on(e, recompute));
    const win = ed.Canvas.getWindow?.();
    win?.addEventListener("scroll", recompute, true);
    window.addEventListener("resize", recompute);
    const id = window.setInterval(recompute, 500);
    return () => {
      evts.forEach((e) => ed.off(e, recompute));
      win?.removeEventListener("scroll", recompute, true);
      window.removeEventListener("resize", recompute);
      window.clearInterval(id);
    };
  }, [editor, recompute]);

  useEffect(() => {
    recompute();
  }, [comments, activeKey, recompute]);

  // Sparkles button → open the compose popover anchored to that element.
  useEffect(() => {
    if (!composeTarget) return;
    setComposeInfo(composeTarget);
    setActiveKey(keyOfTarget(composeTarget));
    setBody("");
    requestAnimationFrame(recompute);
  }, [composeTarget, recompute]);

  const activeComments = activeKey ? open.filter((c) => keyOf(c) === activeKey) : [];
  const activeTarget: CommentTarget | null = (() => {
    if (!activeKey) return null;
    const c = activeComments[0];
    if (c) return { sectionId: c.sectionId, objectId: c.objectId, objectLabel: c.objectLabel };
    if (composeInfo && keyOfTarget(composeInfo) === activeKey) return composeInfo;
    return null;
  })();
  const activePos = activeKey ? positions[activeKey] : undefined;
  // Keep the last real anchor position through the popover's close animation.
  // On close activeKey→null makes activePos undefined; without this the anchor
  // would snap to (0,0) and the still-animating popover would flash there.
  const lastAnchorPos = useRef<Pos>({ top: 0, left: 0 });
  if (activePos) lastAnchorPos.current = activePos;
  const anchorPos = activePos ?? lastAnchorPos.current;

  const closePopover = useCallback(() => {
    setActiveKey(null);
    setBody("");
    if (composeInfo) {
      setComposeInfo(null);
      onComposeConsumed();
    }
  }, [composeInfo, onComposeConsumed]);

  // Close the popover on a click inside the canvas iframe (Radix's outside-click
  // detection lives in the top document and misses iframe clicks).
  useEffect(() => {
    if (!activeKey || !editor) return;
    const doc = editor.Canvas.getDocument?.();
    if (!doc) return;
    const onDown = () => closePopover();
    doc.addEventListener("mousedown", onDown, true);
    return () => doc.removeEventListener("mousedown", onDown, true);
  }, [activeKey, editor, closePopover]);

  const submit = async () => {
    if (!activeTarget || !body.trim()) return;
    try {
      await commentStore.add(docId, activeTarget, body.trim());
      setBody("");
      if (composeInfo) {
        setComposeInfo(null);
        onComposeConsumed();
      }
      reload();
    } catch (e) {
      console.error(e);
    }
  };

  const resolve = async (id: string) => {
    try {
      await commentStore.resolve(id);
      reload();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {pins.map(({ key, list }) => {
        const pos = positions[key];
        if (!pos) return null;
        return (
          <button
            key={key}
            type="button"
            onClick={() => {
              setActiveKey((k) => (k === key ? null : key));
              setBody("");
            }}
            style={{ top: pos.top, left: pos.left }}
            className="pointer-events-auto absolute flex h-6 min-w-6 items-center justify-center rounded-full rounded-bl-none bg-brand px-1.5 text-xs font-semibold text-brand-fg shadow-md ring-2 ring-white transition-transform hover:scale-110"
            title={`${list.length} comment(s)`}
          >
            {list.length}
          </button>
        );
      })}

      <Popover open={!!activeKey && !!activePos} onOpenChange={(o) => !o && closePopover()}>
        <PopoverAnchor asChild>
          <div
            style={{
              position: "absolute",
              top: anchorPos.top,
              left: anchorPos.left,
              width: 1,
              height: 1,
            }}
          />
        </PopoverAnchor>
        <PopoverContent
          side="right"
          align="start"
          // Disable the close animation: while it plays, Radix keeps the content
          // mounted but floating-ui drops its positioning for a frame, flashing
          // the popover at (0,0). No exit animation → instant unmount, no flash.
          className="pointer-events-auto w-80 p-0 data-[state=closed]:!animate-none data-[state=closed]:!duration-0"
        >
          <div className="flex items-start justify-between gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
            <span className="min-w-0">
              {activeTarget?.objectId ? (
                <>
                  Comment on{" "}
                  <span className="font-medium text-foreground">{activeTarget.objectLabel}</span>
                </>
              ) : (
                <>
                  Comment on the whole section{" "}
                  <code className="font-mono">{activeTarget?.sectionId}</code>
                </>
              )}
            </span>
            <button
              type="button"
              onClick={closePopover}
              aria-label="Close"
              className="-mr-1 -mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto p-3">
            {activeComments.length === 0 && (
              <p className="text-xs text-muted-foreground">No comments yet — add the first one.</p>
            )}
            {activeComments.map((c) => (
              <div key={c.id} className="rounded-md border bg-muted/40 p-2 text-sm">
                <p className="whitespace-pre-wrap">{c.body}</p>
                <button
                  onClick={() => void resolve(c.id)}
                  className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Check className="size-3" /> Resolve
                </button>
              </div>
            ))}
          </div>
          <div className="border-t p-3">
            <Textarea
              autoFocus
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add a comment… (⌘/Ctrl+Enter to send)"
              className="min-h-14 resize-none text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
            <div className="mt-2 flex justify-end">
              <Button size="sm" disabled={!body.trim()} onClick={() => void submit()}>
                <MessageSquarePlus /> Add
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
