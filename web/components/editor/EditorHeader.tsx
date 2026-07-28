"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Undo2,
  Redo2,
  Code2,
  Copy,
  Eye,
  Download,
  MessageSquare,
  Mail,
  ChevronDown,
  Minus,
  Plus,
  Monitor,
  Smartphone,
  MoreVertical,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

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
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed",
};

const WIDTHS = ["600px", "640px", "680px", "720px"];

const DEVICE_ICON: Record<string, ReactNode> = {
  Desktop: <Monitor className="size-3.5" />,
  Mobile: <Smartphone className="size-3.5" />,
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
  return <span className="text-xs text-emerald-400">✓ {SAVE_LABEL.saved}</span>;
}

function slugify(name: string): string {
  return (
    name
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "email"
  );
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

const darkGhost = "text-panel-muted-fg hover:bg-panel-hover hover:text-panel-fg";

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
    zoom: 100,
    contentWidth: "600px",
  });
  const [code, setCode] = useState({ mjml: "", html: "" });
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
  const base = slugify(name);

  const openCode = () => setCode({ mjml: api?.getMjml() ?? "", html: api?.getCompiledHtml() ?? "" });

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-panel-border bg-panel px-3 text-panel-fg">
      {/* Logo + document name */}
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-fg">
        <Mail className="size-4" />
      </span>
      <span className="hidden text-sm font-semibold sm:inline">MJML Editor</span>
      <Separator orientation="vertical" className="mx-1 !h-5 bg-panel-border" />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void commitName()}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="h-8 w-44 border-transparent bg-transparent text-sm font-medium text-panel-fg hover:border-panel-border focus-visible:border-panel-border"
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
              className="gap-1.5 px-2.5 text-panel-muted-fg data-[state=on]:bg-panel-elevated data-[state=on]:text-panel-fg"
            >
              {DEVICE_ICON[d.name]}
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

      {/* Content width */}
      <Separator orientation="vertical" className="mx-1 !h-5 bg-panel-border max-xl:hidden" />
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(darkGhost, "gap-1.5 rounded-md border border-panel-border max-xl:hidden")}
          >
            <span className="text-panel-muted-fg">Content width</span>
            {state.contentWidth}
            <ChevronDown className="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-40 p-1">
          {WIDTHS.map((w) => (
            <button
              key={w}
              onClick={() => api?.setContentWidth(w)}
              className={cn(
                "flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-muted",
                state.contentWidth === w && "font-medium text-brand",
              )}
            >
              {w}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Zoom */}
      <div className="flex items-center gap-0.5 rounded-md border border-panel-border px-0.5 max-xl:hidden">
        <Button
          variant="ghost"
          size="icon"
          className={cn(darkGhost, "size-7")}
          onClick={() => api?.setZoom(state.zoom - 10)}
        >
          <Minus className="size-3.5" />
        </Button>
        <span className="w-10 text-center text-xs tabular-nums text-panel-muted-fg">
          {state.zoom}%
        </span>
        <Button
          variant="ghost"
          size="icon"
          className={cn(darkGhost, "size-7")}
          onClick={() => api?.setZoom(state.zoom + 10)}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      {/* Right group */}
      <div className="ml-auto flex items-center gap-2">
        {openCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-panel-muted-fg">
            <MessageSquare className="size-3.5" /> {openCount}
          </span>
        )}
        <SaveBadge status={state.saveStatus} />

        {/* Full-screen preview */}
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
          <DialogContent className="flex !max-w-none h-screen w-screen flex-col gap-0 rounded-none border-0 bg-zinc-100 p-0 sm:rounded-none">
            <div className="flex h-12 shrink-0 items-center justify-between border-b bg-white px-4">
              <DialogTitle className="text-sm">Preview — {name}</DialogTitle>
              <div className="flex items-center gap-2">
                {devices.length > 0 && (
                  <ToggleGroup
                    type="single"
                    size="sm"
                    value={state.device}
                    onValueChange={(v) => v && api?.setDevice(v)}
                    variant="outline"
                  >
                    {devices.map((d) => (
                      <ToggleGroupItem key={d.id} value={d.name} className="px-2.5">
                        {d.name}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => download(`${base}.html`, preview, "text/html")}
                >
                  <Download /> Export HTML
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-6">
              <iframe
                title="Email preview"
                srcDoc={preview}
                className={cn(
                  "mx-auto block h-full min-h-[80vh] rounded-md border bg-white shadow-sm",
                  state.device === "Mobile" ? "w-[375px]" : "w-full max-w-[720px]",
                )}
              />
            </div>
          </DialogContent>
        </Dialog>

        {/* Code (MJML + HTML) */}
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(darkGhost, "gap-1.5")}
              onClick={openCode}
            >
              <Code2 /> Code
            </Button>
          </DialogTrigger>
          <DialogContent className="flex !max-w-4xl flex-col">
            <DialogHeader>
              <DialogTitle>Source code</DialogTitle>
            </DialogHeader>
            <Tabs defaultValue="mjml" className="min-h-0 flex-1">
              <TabsList>
                <TabsTrigger value="mjml">MJML</TabsTrigger>
                <TabsTrigger value="html">HTML</TabsTrigger>
              </TabsList>
              {(["mjml", "html"] as const).map((kind) => (
                <TabsContent key={kind} value={kind} className="mt-2">
                  <pre className="max-h-[62vh] overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-relaxed break-all whitespace-pre-wrap">
                    {code[kind]}
                  </pre>
                  <div className="mt-2 flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        download(
                          `${base}.${kind}`,
                          code[kind],
                          kind === "html" ? "text/html" : "text/plain",
                        )
                      }
                    >
                      <Download /> Download .{kind}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        void navigator.clipboard?.writeText(code[kind]);
                        toast.success(`${kind.toUpperCase()} copied.`);
                      }}
                    >
                      <Copy /> Copy
                    </Button>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </DialogContent>
        </Dialog>

        {/* Export split-button (HTML / MJML), file named from the project */}
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" className="gap-1.5 bg-brand text-brand-fg hover:bg-brand/90">
              <Download /> Export
              <ChevronDown className="size-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-52 p-1">
            <button
              onClick={() => download(`${base}.html`, api?.getCompiledHtml() ?? "", "text/html")}
              className="flex w-full flex-col rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              <span className="font-medium">Export HTML</span>
              <span className="text-xs text-muted-foreground">{base}.html</span>
            </button>
            <button
              onClick={() => download(`${base}.mjml`, api?.getMjml() ?? "", "text/plain")}
              className="flex w-full flex-col rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              <span className="font-medium">Export MJML</span>
              <span className="text-xs text-muted-foreground">{base}.mjml</span>
            </button>
          </PopoverContent>
        </Popover>

        {/* Overflow menu */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className={darkGhost}>
              <MoreVertical />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1">
            <Link
              href="/"
              className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
            >
              <ArrowLeft className="size-4" /> All emails
            </Link>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}
