"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Undo2, Redo2, Code2, Copy, Eye, Download, MessageSquare } from "lucide-react";

import { getDocument, updateDocument } from "@/lib/documents";
import type { EditorApi, EditorState, SaveStatus } from "@/components/editor/EmailEditor";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed",
};

function SaveBadge({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  if (status === "saving")
    return (
      <span className="flex items-center gap-1 text-xs text-panel-muted-fg">
        <Spinner className="size-3" /> {SAVE_LABEL.saving}
      </span>
    );
  if (status === "error") return <Badge variant="destructive">{SAVE_LABEL.error}</Badge>;
  return <span className="text-xs text-emerald-400">{SAVE_LABEL.saved}</span>;
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Ghost/icon buttons on the dark header need light text + subtle hover.
const darkGhost = "text-panel-muted-fg hover:bg-white/10 hover:text-panel-fg";

export default function EditorHeader({
  docId,
  api,
  openCount,
}: {
  docId: string;
  api: EditorApi | null;
  openCount: number;
}) {
  const [name, setName] = useState("");
  const [state, setState] = useState<EditorState>({
    device: "Desktop",
    canUndo: false,
    canRedo: false,
    saveStatus: "idle",
  });
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState("");

  useEffect(() => {
    getDocument(docId)
      .then((d) => setName(d.name))
      .catch(() => {});
  }, [docId]);

  useEffect(() => {
    if (!api) return;
    return api.onEditorState(setState);
  }, [api]);

  const commitName = async () => {
    const n = name.trim() || "Untitled";
    setName(n);
    try {
      await updateDocument(docId, { name: n });
    } catch {
      toast.error("Failed to rename.");
    }
  };

  const devices = api?.getDevices() ?? [];

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-panel-border bg-panel px-3 text-panel-fg">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void commitName()}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="h-8 w-56 border-transparent bg-transparent text-sm font-medium text-panel-fg hover:border-panel-border focus-visible:border-panel-border"
        aria-label="Email name"
      />

      <Separator orientation="vertical" className="mx-1 !h-5 bg-panel-border" />

      {devices.length > 0 && (
        <ToggleGroup
          type="single"
          size="sm"
          value={state.device}
          onValueChange={(v) => v && api?.setDevice(v)}
          className="rounded-md border border-panel-border"
        >
          {devices.map((d) => (
            <ToggleGroupItem
              key={d.id}
              value={d.name}
              className="px-2.5 text-panel-muted-fg data-[state=on]:bg-panel-elevated data-[state=on]:text-panel-fg"
            >
              {d.name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={darkGhost}
            disabled={!state.canUndo}
            onClick={() => api?.undo()}
          >
            <Undo2 />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Undo</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={darkGhost}
            disabled={!state.canRedo}
            onClick={() => api?.redo()}
          >
            <Redo2 />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Redo</TooltipContent>
      </Tooltip>

      <div className="ml-auto flex items-center gap-2">
        {openCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-panel-muted-fg">
            <MessageSquare className="size-3.5" /> {openCount}
          </span>
        )}
        <SaveBadge status={state.saveStatus} />

        {/* Preview compiled email */}
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(darkGhost, "gap-1.5")}
              onClick={() => setPreview(api?.getCompiledHtml() ?? "")}
            >
              <Eye /> Preview
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Preview</DialogTitle>
            </DialogHeader>
            <iframe
              title="Email preview"
              srcDoc={preview}
              className="h-[70vh] w-full rounded-md border bg-white"
            />
          </DialogContent>
        </Dialog>

        {/* Export compiled HTML */}
        <Button
          variant="ghost"
          size="sm"
          className={cn(darkGhost, "gap-1.5")}
          onClick={() => download("email.html", api?.getCompiledHtml() ?? "", "text/html")}
        >
          <Download /> Export
        </Button>

        {/* MJML source */}
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-panel-border bg-transparent text-panel-fg hover:bg-white/10 hover:text-panel-fg"
              onClick={() => setCode(api?.getMjml() ?? "")}
            >
              <Code2 /> MJML
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>MJML source</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh] rounded-md border bg-muted/40">
              <pre className="p-3 text-xs leading-relaxed break-words whitespace-pre-wrap">
                {code}
              </pre>
            </ScrollArea>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => download("email.mjml", code, "text/plain")}
              >
                <Download /> Download .mjml
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(code);
                  toast.success("MJML copied.");
                }}
              >
                <Copy /> Copy
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </header>
  );
}
