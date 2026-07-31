"use client";

import grapesjs, { Component, Editor } from "grapesjs";
import GjsEditor, { Canvas, useEditorMaybe } from "@grapesjs/react";
import grapesjsMJML from "grapesjs-mjml";
import { useRef, useState, type ReactNode } from "react";

import { STARTER_MJML } from "@mjml-agent-editor/core";
import { useDocumentStore, type CommentTarget } from "../../index.js";
import { cn } from "../../lib/utils";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";

import { Spinner } from "../ui/spinner";
import { Switch } from "../ui/switch";
import { Input } from "../ui/input";
import { Search } from "lucide-react";
import CanvasComments from "../comments/CanvasComments.js";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/** Snapshot of editor state pushed to the header (device, undo, save, zoom, width). */
export type EditorState = {
  device: string;
  canUndo: boolean;
  canRedo: boolean;
  saveStatus: SaveStatus;
  zoom: number;
  contentWidth: string;
};

export type EditorApi = {
  /** Current MJML source from the editor. */
  getMjml: () => string;
  /** Compiled email HTML (via grapesjs-mjml's mjml-get-code). */
  getCompiledHtml: () => string;
  /** Immediately saves the editor state to the DB. */
  flushSave: () => Promise<void>;
  /** Reloads the document from the DB (after agent changes). */
  reloadFromDb: () => Promise<void>;
  /** Highlights a section in the canvas while the agent edits it. */
  highlightSection: (sectionId: string, on: boolean) => void;
  /** Device manager control (used by the top header). */
  getDevices: () => { id: string; name: string }[];
  setDevice: (name: string) => void;
  undo: () => void;
  redo: () => void;
  /** Canvas zoom (percentage). */
  setZoom: (z: number) => void;
  /** Email body width (mj-body width attribute, e.g. "600px"). */
  setContentWidth: (w: string) => void;
  /** Subscribe to editor state changes (device/undo/save/zoom/width). Returns unsubscribe. */
  onEditorState: (cb: (s: EditorState) => void) => () => void;
};

type Props = {
  docId: string;
  onReady: (api: EditorApi) => void;
  /** Bump to force the canvas comment layer to refetch (after agent turns). */
  commentsRefresh: number;
  /** Reports the number of open comments (for the header indicator). */
  onOpenCountChange: (n: number) => void;
};

const SEC_ID_RE = /\bsec-([A-Za-z0-9_-]+)\b/;
const OBJ_ID_RE = /\bobj-([A-Za-z0-9_-]+)\b/;

// Element types that can receive a comment (besides a section).
const TYPE_LABEL: Record<string, string> = {
  "mj-text": "Text",
  "mj-button": "Button",
  "mj-image": "Image",
  "mj-column": "Column",
};

function tagOf(c: Component): string {
  return String(c.get("tagName") || c.get("type") || "");
}

// "Sparkles" icon (lucide Sparkles) used as a label in the GrapesJS toolbar.
const SPARKLES_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>';

function isSection(c: Component): boolean {
  return tagOf(c) === "mj-section";
}

function isCommentable(c: Component): boolean {
  const t = tagOf(c);
  return t === "mj-section" || t in TYPE_LABEL;
}

function classMatch(c: Component, re: RegExp): string | null {
  const cssClass = String(c.getAttributes()["css-class"] ?? "");
  return cssClass.match(re)?.[1] ?? null;
}

function sectionIdOf(c: Component): string | null {
  return classMatch(c, SEC_ID_RE);
}

function addIdClass(c: Component, prefix: "sec" | "obj"): string {
  const existing = classMatch(c, prefix === "sec" ? SEC_ID_RE : OBJ_ID_RE);
  if (existing) return existing;
  const cssClass = String(c.getAttributes()["css-class"] ?? "");
  const id = Math.random().toString(36).slice(2, 10);
  c.addAttributes({ "css-class": `${cssClass} ${prefix}-${id}`.trim() });
  return id;
}

function closestSection(c: Component | undefined): Component | null {
  let cur: Component | undefined = c;
  while (cur) {
    if (isSection(cur)) return cur;
    cur = cur.parent() ?? undefined;
  }
  return null;
}

// Friendly names for the canvas breadcrumb.
const CRUMB_NAME: Record<string, string> = {
  "mj-section": "Section",
  "mj-column": "Column",
  "mj-group": "Group",
  "mj-text": "Text",
  "mj-button": "Button",
  "mj-image": "Image",
  "mj-divider": "Divider",
  "mj-spacer": "Spacer",
  "mj-hero": "Hero",
  "mj-navbar": "Navbar",
  "mj-social": "Social",
  "mj-social-element": "Social",
  "mj-wrapper": "Wrapper",
};

function crumbName(c: Component): string {
  const t = tagOf(c);
  return CRUMB_NAME[t] ?? t.replace(/^mj-/, "") ?? "Element";
}

function objectLabel(c: Component): string {
  const base = TYPE_LABEL[tagOf(c)] ?? tagOf(c);
  const text = String((c.getEl?.() as HTMLElement | undefined)?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30);
  return text ? `${base}: “${text}”` : base;
}

const RTE_FONTS = [
  "Arial",
  "Helvetica",
  "Georgia",
  "Times New Roman",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Courier New",
];
const RTE_SIZES = [11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40];

// Wraps the current selection (in the canvas document) in a <span> with inline style.
function wrapSelectionStyle(el: HTMLElement | undefined, style: Partial<CSSStyleDeclaration>) {
  const doc = el?.ownerDocument;
  const sel = doc?.getSelection?.();
  if (!doc || !sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const span = doc.createElement("span");
  Object.assign(span.style, style);
  try {
    span.appendChild(range.extractContents());
    range.insertNode(span);
    sel.removeAllRanges();
    const nr = doc.createRange();
    nr.selectNodeContents(span);
    sel.addRange(nr);
  } catch {
    /* ignore */
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// Extends the default GrapesJS RTE (mjml-compatible) with font/size/colors.
function setupRichText(editor: Editor) {
  const rte = editor.RichTextEditor as any;
  if (!rte || rte.__customActions) return;
  rte.__customActions = true;
  const val = (action: any, sel: string) =>
    (action.btn?.querySelector(sel) as HTMLInputElement | HTMLSelectElement | null)?.value ?? "";

  rte.add("fontName", {
    icon: `<select class="gjs-rte-select" title="Font"><option value="">Font</option>${RTE_FONTS.map(
      (f) => `<option value="${f}">${f}</option>`,
    ).join("")}</select>`,
    event: "change",
    result: (r: any, action: any) => {
      const v = val(action, "select");
      if (v) r.exec("fontName", v);
    },
  });

  rte.add("fontSize", {
    icon: `<select class="gjs-rte-select" title="Size"><option value="">Size</option>${RTE_SIZES.map(
      (s) => `<option value="${s}px">${s}</option>`,
    ).join("")}</select>`,
    event: "change",
    result: (r: any, action: any) => {
      const v = val(action, "select");
      if (v) wrapSelectionStyle(r.el, { fontSize: v });
    },
  });

  rte.add("forecolor", {
    icon: `<input type="color" class="gjs-rte-color" title="Text color" value="#000000">`,
    event: "change",
    result: (r: any, action: any) => r.exec("foreColor", val(action, "input")),
  });

  rte.add("hilitecolor", {
    icon: `<input type="color" class="gjs-rte-color" title="Background color" value="#ffff00">`,
    event: "change",
    result: (r: any, action: any) => r.exec("hiliteColor", val(action, "input")),
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export default function EmailEditor({ docId, onReady, commentsRefresh, onOpenCountChange }: Props) {
  // Injected by the host rather than imported, so the editor carries no database.
  const documents = useDocumentStore();
  // Refs instead of state — GrapesJS lives outside React's lifecycle.
  const loadingRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatusRef = useRef<SaveStatus>("idle");
  const stateListeners = useRef(new Set<(s: EditorState) => void>());
  const [loading, setLoading] = useState(true);
  const [sidebarView, setSidebarView] = useState<SidebarView>("blocks");
  // Comment being composed (sparkles button) — opens the canvas popover.
  const [composeTarget, setComposeTarget] = useState<CommentTarget | null>(null);
  // Where the current selection came from — canvas click opens Settings,
  // selecting from the Layers tree does not (keeps you on Layers).
  const selectionSource = useRef<"canvas" | "layers" | "other">("other");
  // Breadcrumb of the selected component's ancestry (Section › Column › …).
  const editorRef = useRef<Editor | null>(null);
  const [crumbs, setCrumbs] = useState<Component[]>([]);

  const onEditor = async (editor: Editor) => {
    editorRef.current = editor;

    // Build the breadcrumb chain from a component up to (but excluding) mj-body.
    const buildCrumbs = (c: Component | undefined) => {
      const chain: Component[] = [];
      let cur: Component | undefined = c;
      while (cur) {
        const t = tagOf(cur);
        if (!t || t === "mj-body" || t === "wrapper" || t === "Wrapper") break;
        chain.unshift(cur);
        cur = cur.parent() ?? undefined;
      }
      setCrumbs(chain);
    };

    // GrapesJS find() by MJML tag is unreliable — walk the tree instead.
    const findByTag = (tag: string): Component | undefined => {
      let found: Component | undefined;
      editor.getWrapper()?.onAll((c) => {
        if (!found && (c.get("tagName") === tag || c.get("type") === tag)) found = c;
      });
      return found;
    };
    const bodyWidth = (): string => {
      const body = findByTag("mj-body");
      return String((body?.getAttributes?.() as Record<string, unknown>)?.width ?? "600px");
    };
    const snapshot = (): EditorState => ({
      device: editor.getDevice(),
      canUndo: editor.UndoManager.hasUndo(),
      canRedo: editor.UndoManager.hasRedo(),
      saveStatus: saveStatusRef.current,
      zoom: Math.round((editor.Canvas.getZoom?.() as number | undefined) ?? 100),
      contentWidth: bodyWidth(),
    });
    const notifyState = () => {
      const s = snapshot();
      stateListeners.current.forEach((l) => l(s));
    };
    const setSave = (s: SaveStatus) => {
      saveStatusRef.current = s;
      notifyState();
    };

    // Comment target for a component: its section + (if it's not the section
    // itself) the specific element. Assigns stable IDs (sec-/obj-) when needed.
    const targetOf = (c: Component | undefined): CommentTarget | null => {
      const section = closestSection(c);
      if (!section || !c) return null;
      const sectionId = addIdClass(section, "sec");
      if (isSection(c)) {
        return { sectionId, objectId: null, objectLabel: null };
      }
      const objectId = addIdClass(c, "obj");
      return { sectionId, objectId, objectLabel: objectLabel(c) };
    };

    // Gives the section a sec-<id> and adds a comment button to the toolbar of
    // every commentable element (section + text/button/image/column).
    const decorate = (c: Component) => {
      if (isSection(c)) addIdClass(c, "sec");
      if (!isCommentable(c)) return;
      const toolbar = [...((c.get("toolbar") as { command?: string }[]) ?? [])];
      if (!toolbar.some((t) => t.command === "open-comments")) {
        toolbar.push({
          command: "open-comments",
          label: SPARKLES_SVG,
          attributes: { title: "Comment on element / section", "data-role": "sparkles" },
        } as never);
        c.set("toolbar", toolbar as never);
      }
    };

    editor.Commands.add("open-comments", {
      run(ed: Editor) {
        const target = targetOf(ed.getSelected() ?? undefined);
        if (target) setComposeTarget(target);
      },
    });

    setupRichText(editor);

    // Group the palette blocks into categories (the plugin ships them flat).
    const blockCategory = (label: string): string => {
      const l = label.toLowerCase();
      if (/(column|section)/.test(l)) return "Layout";
      if (/(text|image|button|divider|spacer|social)/.test(l)) return "Basic";
      return "Advanced";
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bm = editor.BlockManager as any;
    bm.getAll().forEach(
      (b: { get: (k: string) => string; set: (k: string, v: unknown) => void }) => {
        b.set("category", blockCategory(b.get("label") || ""));
      },
    );
    bm.render();

    editor.on("component:add", decorate);
    // Track selection origin: a mousedown inside the canvas iframe marks the
    // next selection as coming from the canvas (→ open Settings). Selecting via
    // the Layers tree leaves the source as "layers" (set by the sidebar).
    editor.on("load", () => {
      const body = editor.Canvas.getBody();
      body?.addEventListener(
        "mousedown",
        () => {
          selectionSource.current = "canvas";
        },
        true,
      );
    });
    editor.on("component:selected", (c: Component) => {
      if (selectionSource.current === "canvas") setSidebarView("settings");
      selectionSource.current = "other";
      buildCrumbs(c);
      // mj-image has no src trait by default (src changes via the Asset
      // Manager) — add a URL field so the image can be set from the panel.
      if (c?.get("type") === "mj-image" && !c.getTrait("src")) {
        c.addTrait(
          {
            type: "text",
            name: "src",
            label: "Image (URL)",
            placeholder: "https://…",
            changeProp: true,
          } as never,
          { at: 0 },
        );
      }
    });
    editor.on("component:deselected", () => setCrumbs([]));

    const save = async () => {
      if (loadingRef.current) return;
      setSave("saving");
      try {
        await documents.save(docId, {
          mjml: editor.getHtml(),
          projectData: editor.getProjectData(),
        });
        setSave("saved");
      } catch (e) {
        setSave("error");
        toast.error("Failed to save changes.");
        throw e;
      }
    };

    editor.on("update", () => {
      notifyState();
      if (loadingRef.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void save().catch(console.error), 1200);
    });
    editor.on("change:device", notifyState);

    const loadMjml = (mjml: string) => {
      // Mute autosave during loading and for a moment after — setComponents
      // can fire the "update" event asynchronously, which would otherwise
      // overwrite the agent's fresh change with the editor's normalized version.
      loadingRef.current = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      editor.setComponents(mjml || STARTER_MJML);
      editor.getWrapper()?.find("mj-section").forEach(decorate);
      for (const t of Object.keys(TYPE_LABEL)) {
        editor.getWrapper()?.find(t).forEach(decorate);
      }
      setTimeout(() => {
        loadingRef.current = false;
      }, 400);
    };

    // Highlight for the section the agent is editing. The canvas is an iframe with its
    // own document, so the host's stylesheet does not reach it and these rules have to be
    // injected. The colour is still read from the shared token rather than written out
    // again — the literal that used to live here was the pre-redesign violet and had
    // silently drifted from the brand for as long as the redesign had been in place.
    const ensureHighlightStyles = () => {
      const cdoc = editor.Canvas.getDocument();
      if (!cdoc || cdoc.getElementById("agent-edit-style")) return;

      const accent =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--mjml-editor-accent")
          .trim() || "#7c5cfc";

      const style = cdoc.createElement("style");
      style.id = "agent-edit-style";
      style.textContent = `
        @keyframes agentEditPulse {
          0%, 100% { outline-color: color-mix(in srgb, ${accent} 25%, transparent); }
          50%      { outline-color: color-mix(in srgb, ${accent} 95%, transparent); }
        }
        .agent-editing {
          outline: 3px solid color-mix(in srgb, ${accent} 90%, transparent) !important;
          outline-offset: -3px;
          animation: agentEditPulse 1s ease-in-out infinite;
          transition: outline-color 0.2s;
        }`;
      cdoc.head.appendChild(style);
    };

    const sectionEl = (sectionId: string): HTMLElement | undefined => {
      const comp = editor
        .getWrapper()
        ?.find("mj-section")
        .find((c) => sectionIdOf(c) === sectionId);
      return (comp?.getEl?.() as HTMLElement | undefined) ?? undefined;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const compiledHtml = (): string => {
      try {
        // grapesjs-mjml compiles MJML → email HTML via this command ({ html, errors }).
        const res = editor.runCommand("mjml-code-to-html") as { html?: string } | undefined;
        return res?.html ?? editor.getHtml();
      } catch {
        return editor.getHtml();
      }
    };

    try {
      const doc = await documents.get(docId);
      loadMjml(doc.mjml);
    } catch (e) {
      toast.error("Failed to load the document.");
      console.error(e);
    } finally {
      setLoading(false);
    }

    onReady({
      getMjml: () => editor.getHtml(),
      getCompiledHtml: compiledHtml,
      flushSave: async () => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        await save();
      },
      reloadFromDb: async () => {
        const fresh = await documents.get(docId);
        if (fresh.mjml !== editor.getHtml()) loadMjml(fresh.mjml);
      },
      highlightSection: (sectionId, on) => {
        ensureHighlightStyles();
        const el = sectionEl(sectionId);
        if (!el) return;
        el.classList.toggle("agent-editing", on);
      },
      getDevices: () =>
        editor.Devices.getDevices().map((d) => ({
          id: String(d.id),
          name: d.getName() || String(d.id),
        })),
      setDevice: (name) => {
        editor.setDevice(name);
        notifyState();
      },
      undo: () => {
        editor.UndoManager.undo();
        notifyState();
      },
      redo: () => {
        editor.UndoManager.redo();
        notifyState();
      },
      setZoom: (z) => {
        editor.Canvas.setZoom?.(Math.max(25, Math.min(200, z)));
        notifyState();
      },
      setContentWidth: (w) => {
        findByTag("mj-body")?.addAttributes({ width: w });
        notifyState();
      },
      onEditorState: (cb) => {
        stateListeners.current.add(cb);
        cb(snapshot());
        return () => stateListeners.current.delete(cb);
      },
    });
  };

  return (
    <GjsEditor
      grapesjs={grapesjs}
      className="h-full"
      options={{
        height: "100%",
        storageManager: false,
        fromElement: false,
        panels: { defaults: [] },
        blockManager: { appendTo: "#gjs-blocks" },
        styleManager: { appendTo: "#gjs-styles" },
        traitManager: { appendTo: "#gjs-traits" },
        layerManager: { appendTo: "#gjs-layers" },
        deviceManager: {
          devices: [
            { id: "desktop", name: "Desktop", width: "" },
            { id: "mobile", name: "Mobile", width: "375px", widthMedia: "480px" },
          ],
        },
        plugins: [grapesjsMJML],
      }}
      onEditor={onEditor}
    >
      <div className="flex h-full min-h-0 flex-1">
        <LeftSidebar
          view={sidebarView}
          onViewChange={setSidebarView}
          markLayersSource={() => (selectionSource.current = "layers")}
        />
        <div className="flex min-w-0 flex-1 flex-col bg-surface-muted">
          <div className="relative min-h-0 flex-1">
            <Canvas className="h-full" />
            {/* Canvas comment layer (pins + thread popovers) overlays the canvas. */}
            <CanvasComments
              docId={docId}
              composeTarget={composeTarget}
              onComposeConsumed={() => setComposeTarget(null)}
              refreshSignal={commentsRefresh}
              onOpenCountChange={onOpenCountChange}
            />
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-white/70 text-sm text-zinc-500">
                <Spinner /> Loading editor…
              </div>
            )}
          </div>
          <Breadcrumb crumbs={crumbs} onSelect={(c) => editorRef.current?.select(c)} />
        </div>
      </div>
    </GjsEditor>
  );
}

type SidebarView = "blocks" | "settings" | "layers";

// Collapsible section — content ALWAYS mounted (appendTo target), hidden via `hidden`.
function CollapseSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-panel-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-semibold tracking-wide text-panel-muted-fg uppercase hover:text-panel-fg"
      >
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        {title}
      </button>
      <div className={cn(!open && "hidden")}>{children}</div>
    </div>
  );
}

// Left sidebar (dark): Blocks / Settings / Layers. All managers are always
// mounted (appendTo targets for GrapesJS) — visibility toggled via `hidden`.
function LeftSidebar({
  view,
  onViewChange,
  markLayersSource,
}: {
  view: SidebarView;
  onViewChange: (v: SidebarView) => void;
  markLayersSource: () => void;
}) {
  const editor = useEditorMaybe();
  const [layersExpanded, setLayersExpanded] = useState(false);
  const [blockSearch, setBlockSearch] = useState("");

  const changeView = (v: SidebarView) => {
    if (v === "settings" && editor && !editor.getSelected()) {
      const wrapper = editor.getWrapper();
      const body = wrapper?.find("mj-body")[0] ?? wrapper;
      if (body) editor.select(body);
    }
    onViewChange(v);
  };

  const toggleLayers = (expand: boolean) => {
    setLayersExpanded(expand);
    editor?.getWrapper()?.onAll((c) => c.set("open", expand));
  };

  // Filter the GrapesJS-rendered blocks (DOM lives outside React) by label;
  // hide category groups that end up empty.
  const filterBlocks = (q: string) => {
    setBlockSearch(q);
    const root = document.getElementById("gjs-blocks");
    if (!root) return;
    const term = q.trim().toLowerCase();
    root.querySelectorAll<HTMLElement>(".gjs-block").forEach((b) => {
      const label = (b.querySelector(".gjs-block-label")?.textContent ?? b.textContent ?? "")
        .toLowerCase()
        .trim();
      b.style.display = !term || label.includes(term) ? "" : "none";
    });
    root.querySelectorAll<HTMLElement>(".gjs-block-category").forEach((cat) => {
      const anyVisible = [...cat.querySelectorAll<HTMLElement>(".gjs-block")].some(
        (b) => b.style.display !== "none",
      );
      cat.style.display = anyVisible ? "" : "none";
    });
  };

  return (
    <div className="editor-dark flex w-64 shrink-0 flex-col border-r border-panel-border bg-panel text-panel-fg">
      <div className="flex border-b border-panel-border">
        {(
          [
            ["blocks", "Blocks"],
            ["settings", "Settings"],
            ["layers", "Layers"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => changeView(value)}
            className={cn(
              "relative flex-1 px-3 py-2.5 text-sm transition-colors",
              "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:transition-colors",
              view === value
                ? "font-medium text-panel-fg after:bg-brand"
                : "text-panel-muted-fg after:bg-transparent hover:text-panel-fg",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Blocks: search + categorized block palette */}
      <div className={cn("flex min-h-0 flex-1 flex-col", view !== "blocks" && "hidden")}>
        <div className="relative border-b border-panel-border p-2">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-panel-muted-fg" />
          <Input
            value={blockSearch}
            onChange={(e) => filterBlocks(e.target.value)}
            placeholder="Search blocks…"
            className="h-8 border-panel-border bg-panel-elevated pr-10 pl-7 text-sm text-panel-fg placeholder:text-panel-muted-fg"
          />
          <kbd className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 rounded border border-panel-border bg-panel px-1 py-0.5 font-mono text-[10px] text-panel-muted-fg">
            ⌘K
          </kbd>
        </div>
        <div id="gjs-blocks" className="min-h-0 flex-1 overflow-y-auto" />
      </div>

      {/* Settings: Attributes + Style (collapsible, stacked) */}
      <div className={cn("min-h-0 flex-1 overflow-y-auto", view !== "settings" && "hidden")}>
        <CollapseSection title="Attributes">
          <div id="gjs-traits" />
        </CollapseSection>
        <CollapseSection title="Style">
          <div id="gjs-styles" />
        </CollapseSection>
      </div>

      {/* Layers — with an expand/collapse-all switch. A pointer-down here marks
          the next selection as coming from the tree (→ do NOT open Settings). */}
      <div
        className={cn("flex min-h-0 flex-1 flex-col", view !== "layers" && "hidden")}
        onMouseDownCapture={markLayersSource}
      >
        <label className="flex items-center justify-between gap-2 border-b border-panel-border px-3 py-2 text-xs text-panel-muted-fg">
          <span>Expand all</span>
          <Switch
            checked={layersExpanded}
            onCheckedChange={toggleLayers}
            className="data-[state=checked]:bg-brand data-[state=unchecked]:bg-panel-border"
          />
        </label>
        <div id="gjs-layers" className="min-h-0 flex-1 overflow-y-auto" />
      </div>
    </div>
  );
}

// Breadcrumb under the canvas: the selected component's ancestry (clickable).
function Breadcrumb({
  crumbs,
  onSelect,
}: {
  crumbs: Component[];
  onSelect: (c: Component) => void;
}) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-0.5 border-t border-border bg-surface px-3 text-xs text-muted-foreground">
      {crumbs.length === 0 ? (
        <span className="text-muted-foreground/60">Select an element…</span>
      ) : (
        crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-0.5">
            {i > 0 && <ChevronRight className="size-3 opacity-40" />}
            <button
              type="button"
              onClick={() => onSelect(c)}
              className={cn(
                "rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground",
                i === crumbs.length - 1 && "font-medium text-brand",
              )}
            >
              {crumbName(c)}
            </button>
          </span>
        ))
      )}
    </div>
  );
}
