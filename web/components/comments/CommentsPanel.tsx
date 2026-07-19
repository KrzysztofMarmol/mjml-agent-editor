"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  addComment,
  listComments,
  resolveComment,
  type CommentTarget,
  type SectionComment,
} from "@/lib/documents";
import { toast } from "sonner";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type Props = {
  docId: string;
  /** Currently selected comment target (a section or an element inside it). */
  target: CommentTarget | null;
  /** Changing the value forces the list to reload. */
  refreshSignal: number;
  /** Number of open comments (badge on the tab). */
  onOpenCountChange?: (count: number) => void;
};

/** Label for the comment's target: element name or "whole section". */
function scopeLabel(c: SectionComment): string {
  return c.object_id ? (c.object_label ?? "element") : "whole section";
}

export default function CommentsPanel({ docId, target, refreshSignal, onOpenCountChange }: Props) {
  const [comments, setComments] = useState<SectionComment[]>([]);
  const [body, setBody] = useState("");

  const reload = useCallback(() => {
    listComments(docId)
      .then(setComments)
      .catch((e) => {
        console.error(e);
        toast.error("Failed to load comments.");
      });
  }, [docId]);

  useEffect(reload, [reload, refreshSignal]);

  // Grouping per section: { sectionId -> comments } for open ones.
  const openBySection = useMemo(() => {
    const map = new Map<string, SectionComment[]>();
    for (const c of comments) {
      if (c.status !== "open") continue;
      const list = map.get(c.section_id) ?? [];
      list.push(c);
      map.set(c.section_id, list);
    }
    return map;
  }, [comments]);

  const resolved = comments.filter((c) => c.status === "resolved");
  const openCount = comments.filter((c) => c.status === "open").length;

  // Emit the open-comment count upward (badge on the Comments tab).
  useEffect(() => {
    onOpenCountChange?.(openCount);
  }, [openCount, onOpenCountChange]);

  const submit = async () => {
    if (!target || !body.trim()) return;
    try {
      await addComment(docId, target, body.trim());
      setBody("");
      reload();
      toast.success("Comment added.");
    } catch (e) {
      console.error(e);
      toast.error("Failed to add the comment.");
    }
  };

  const resolve = async (id: string) => {
    try {
      await resolveComment(id);
      reload();
      toast.success("Comment resolved.");
    } catch (e) {
      console.error(e);
      toast.error("Failed to resolve the comment.");
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-sm">
      <div className="rounded-lg border border-border p-2">
        {target ? (
          <>
            <p className="mb-1 text-xs text-muted-foreground">
              Comment on{" "}
              {target.objectId ? (
                <>
                  element{" "}
                  <span className="font-medium text-foreground">{target.objectLabel}</span> in section{" "}
                  <code className="font-mono">{target.sectionId}</code>
                </>
              ) : (
                <>
                  the whole section <code className="font-mono">{target.sectionId}</code>
                </>
              )}
              :
            </p>
            <Textarea
              className="min-h-16 resize-y"
              placeholder="What to change and how? e.g. “make the button green, shorter text”"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <Button size="sm" className="mt-2" onClick={() => void submit()} disabled={!body.trim()}>
              Add comment
            </Button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Select a section or an element in the editor (or use the comment button
            in its toolbar) to add a comment.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <h3 className="font-medium">Open</h3>
        <Badge variant="secondary">{openCount}</Badge>
      </div>
      {openCount === 0 && (
        <p className="text-xs text-muted-foreground">No open comments.</p>
      )}

      {/* Tree: section → comments; each shows what it refers to */}
      {[...openBySection.entries()].map(([sectionId, list]) => (
        <div key={sectionId} className="rounded-lg border border-border">
          <div className="border-b border-border bg-muted/50 px-2 py-1 text-xs font-medium text-muted-foreground">
            section <code className="font-mono">{sectionId}</code> ({list.length})
          </div>
          <div className="space-y-2 p-2">
            {list.map((c) => (
              <div
                key={c.id}
                className={cnScope(c.object_id)}
              >
                <p className="text-xs text-muted-foreground">{scopeLabel(c)}</p>
                <p className="whitespace-pre-wrap text-foreground">{c.body}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => void resolve(c.id)}
                >
                  <Check /> Mark as resolved
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {resolved.length > 0 && (
        <details className="mt-1">
          <summary className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            Resolved <Badge variant="outline">{resolved.length}</Badge>
          </summary>
          {resolved.map((c) => (
            <div key={c.id} className="mt-1 rounded-lg border border-border p-2 opacity-60">
              <p className="text-xs text-muted-foreground">
                section <code className="font-mono">{c.section_id}</code> · {scopeLabel(c)}
              </p>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

/** Comment card color by scope: element (indigo) vs whole section (amber). */
function cnScope(objectId: string | null): string {
  return objectId
    ? "rounded-lg border border-indigo-200 bg-indigo-50 p-2"
    : "rounded-lg border border-amber-300 bg-amber-50 p-2";
}
