"use client";

import grapesjs, { Component, Editor } from "grapesjs";
import GjsEditor, { Canvas, useEditorMaybe } from "@grapesjs/react";
import grapesjsMJML from "grapesjs-mjml";
import { useEffect, useRef, useState } from "react";

import { STARTER_MJML } from "@mjml-agent-editor/core";
import { useDocumentStore, useLabels, type CommentTarget, type EditorLabels } from "../../index.js";
import { refusal, saveToastId } from "../../lib/refusal.js";
import { createSaveQueue } from "../../lib/save-queue.js";
import { opensBlockSearch } from "../../lib/shortcuts.js";
import { useAgentTurn } from "../../stores.js";
import { cn } from "../../lib/utils";
import { toast } from "sonner";
import { ChevronRight, Mail, MousePointerClick } from "lucide-react";

import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { Switch } from "../ui/switch";
import { Input } from "../ui/input";
import { Search } from "lucide-react";
import CanvasComments from "../comments/CanvasComments.js";
import ImagePicker from "./ImagePicker.js";
import Inspector from "./inspector/Inspector.js";
import { registerBlocks, type SectionBlock } from "./blocks.js";
import { addIdClass, freshenCopiedIds, sectionIdOf } from "./ids.js";
import { badgeLabel, setupLayerNames } from "./layers.js";
import { fixPluginTypes } from "./plugin-types.js";
import { illegalAttributes, withClosedTags, withoutEditorProps } from "./mjml-attributes.js";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/** Snapshot of editor state pushed to the header (device, undo, save, zoom, width). */
export type EditorState = {
  device: string;
  canUndo: boolean;
  canRedo: boolean;
  saveStatus: SaveStatus;
  zoom: number;
  contentWidth: string;
  /** True during an agent turn, until its result is loaded. */
  readOnly: boolean;
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
  /**
   * Sections offered after the built-in blocks, read once when the editor starts. One that
   * `blockProblems` refuses is left out and reported in the console.
   */
  blocks?: readonly SectionBlock[];
};

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

// "Image up" icon (lucide ImageUp), the toolbar button that opens the image picker.
const IMAGE_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.814.014L6 21"/><path d="m14 19.5 3-3 3 3"/><path d="M17 22v-5.5"/><circle cx="9" cy="9" r="2"/></svg>';

// "Layout template" icon (lucide LayoutTemplate), the tile of a host's section without its own.
const SECTION_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="7" x="3" y="3" rx="1"/><rect width="9" height="7" x="3" y="14" rx="1"/><rect width="5" height="7" x="16" y="14" rx="1"/></svg>';

function isSection(c: Component): boolean {
  return tagOf(c) === "mj-section";
}

function isCommentable(c: Component): boolean {
  const t = tagOf(c);
  return t === "mj-section" || t in TYPE_LABEL;
}

function closestSection(c: Component | undefined): Component | null {
  let cur: Component | undefined = c;
  while (cur) {
    if (isSection(cur)) return cur;
    cur = cur.parent() ?? undefined;
  }
  return null;
}

function crumbName(c: Component, labels: EditorLabels): string {
  const t = tagOf(c);
  return labels.elementNames[t] ?? t.replace(/^mj-/, "");
}

// The palette. Social and navigation children are only valid inside their parent; hero and
// wrapper are banned from editable templates by agent-core (a hero gets no `sec-*` id, so the
// agent cannot address it); raw HTML is out of place for the people this editor serves.
const BLOCKS = [
  "mj-1-column",
  "mj-2-columns",
  "mj-3-columns",
  "mj-text",
  "mj-image",
  "mj-button",
  "mj-divider",
  "mj-spacer",
  "mj-social-group",
  "mj-navbar",
];
const LAYOUT_BLOCKS = new Set(["mj-1-column", "mj-2-columns", "mj-3-columns"]);

// The plugin's version links Google+ and shares the page: a bare network name makes the icon
// open a "share this link" dialog, while `-noshare` links to the profile a footer means.
const SOCIAL_BLOCK = `<mj-social icon-size="24px" mode="horizontal">
  <mj-social-element name="facebook-noshare" href="https://facebook.com/"></mj-social-element>
  <mj-social-element name="instagram-noshare" href="https://instagram.com/"></mj-social-element>
  <mj-social-element name="x-noshare" href="https://x.com/"></mj-social-element>
</mj-social>`;

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
function setupRichText(editor: Editor, labels: EditorLabels) {
  const rte = editor.RichTextEditor as any;
  if (!rte || rte.__customActions) return;
  rte.__customActions = true;
  const val = (action: any, sel: string) =>
    (action.btn?.querySelector(sel) as HTMLInputElement | HTMLSelectElement | null)?.value ?? "";

  rte.add("fontName", {
    icon: `<select class="gjs-rte-select" title="${labels.rteFont}"><option value="">${labels.rteFont}</option>${RTE_FONTS.map(
      (f) => `<option value="${f}">${f}</option>`,
    ).join("")}</select>`,
    event: "change",
    result: (r: any, action: any) => {
      const v = val(action, "select");
      if (v) r.exec("fontName", v);
    },
  });

  rte.add("fontSize", {
    icon: `<select class="gjs-rte-select" title="${labels.rteSize}"><option value="">${labels.rteSize}</option>${RTE_SIZES.map(
      (s) => `<option value="${s}px">${s}</option>`,
    ).join("")}</select>`,
    event: "change",
    result: (r: any, action: any) => {
      const v = val(action, "select");
      if (v) wrapSelectionStyle(r.el, { fontSize: v });
    },
  });

  rte.add("forecolor", {
    icon: `<input type="color" class="gjs-rte-color" title="${labels.rteTextColor}" value="#000000">`,
    event: "change",
    result: (r: any, action: any) => r.exec("foreColor", val(action, "input")),
  });

  rte.add("hilitecolor", {
    icon: `<input type="color" class="gjs-rte-color" title="${labels.rteBackgroundColor}" value="#ffff00">`,
    event: "change",
    result: (r: any, action: any) => r.exec("hiliteColor", val(action, "input")),
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export default function EmailEditor({
  docId,
  onReady,
  commentsRefresh,
  onOpenCountChange,
  blocks = [],
}: Props) {
  // Injected by the host rather than imported, so the editor carries no database.
  const documents = useDocumentStore();
  const labels = useLabels();
  // Refs instead of state — GrapesJS lives outside React's lifecycle.
  const loadingRef = useRef(false);
  const saveStatusRef = useRef<SaveStatus>("idle");
  const stateListeners = useRef(new Set<(s: EditorState) => void>());
  const [loading, setLoading] = useState(true);
  const [sidebarView, setSidebarView] = useState<SidebarView>("blocks");
  const blockSearchRef = useRef<HTMLInputElement>(null);
  // Bound to the editor and its canvas, not the host page, whose own keys a host keeps.
  const onBlockSearchKey = (e: KeyboardEvent) => {
    if (readOnlyRef.current || !opensBlockSearch(e)) return;
    e.preventDefault();
    setSidebarView("blocks");
    // The panel is hidden until the view switches, and a hidden input cannot take focus.
    requestAnimationFrame(() => blockSearchRef.current?.focus());
  };
  // Comment being composed (sparkles button) — opens the canvas popover.
  const [composeTarget, setComposeTarget] = useState<CommentTarget | null>(null);
  // Where the current selection came from — canvas click opens Settings,
  // selecting from the Layers tree does not (keeps you on Layers).
  const selectionSource = useRef<"canvas" | "layers" | "other">("other");
  // Breadcrumb of the selected component's ancestry (Section › Column › …).
  const editorRef = useRef<Editor | null>(null);
  // Read only from a turn's start until the document it left is loaded, not just until it
  // ends: an edit made before that final reload would be replaced by it.
  const { running: turnRunning, locked: readOnly, setLocked } = useAgentTurn();
  const readOnlyRef = useRef(false);
  const applyReadOnly = useRef<(on: boolean) => Promise<void>>(async () => {});
  useEffect(() => void applyReadOnly.current(turnRunning), [turnRunning]);
  useEffect(() => () => setLocked(false), [setLocked]);
  const [crumbs, setCrumbs] = useState<Component[]>([]);
  // The open picker: GrapesJS hands over how to apply a choice to the image being edited.
  const [picker, setPicker] = useState<{ current?: string; select: (url: string) => void } | null>(
    null,
  );

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
      canUndo: !readOnlyRef.current && editor.UndoManager.hasUndo(),
      canRedo: !readOnlyRef.current && editor.UndoManager.hasRedo(),
      saveStatus: saveStatusRef.current,
      zoom: Math.round((editor.Canvas.getZoom?.() as number | undefined) ?? 100),
      contentWidth: bodyWidth(),
      readOnly: readOnlyRef.current,
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
      if (tagOf(c) === "mj-image" && !toolbar.some((t) => t.command === "open-image-picker")) {
        toolbar.push({
          command: "open-image-picker",
          label: IMAGE_SVG,
          attributes: { title: labels.chooseImage },
        } as never);
        c.set("toolbar", toolbar as never);
      }
      // Comments are addressed by section; outside one (inside a hero) the button did nothing.
      if (closestSection(c) && !toolbar.some((t) => t.command === "open-comments")) {
        toolbar.push({
          command: "open-comments",
          label: SPARKLES_SVG,
          attributes: { title: labels.commentOnElement, "data-role": "sparkles" },
        } as never);
        c.set("toolbar", toolbar as never);
      }
    };

    // What a double-click on an image does in GrapesJS, reachable from a button.
    editor.Commands.add("open-image-picker", {
      run(ed: Editor) {
        const target = ed.getSelected();
        if (!target || tagOf(target) !== "mj-image") return;
        const am = ed.AssetManager;
        am.open({
          target,
          types: ["image"],
          select(asset: { getSrc: () => string }, complete?: boolean) {
            target.set({ src: asset.getSrc() });
            if (complete) am.close();
          },
        } as never);
      },
    });

    editor.Commands.add("open-comments", {
      run(ed: Editor) {
        const target = targetOf(ed.getSelected() ?? undefined);
        if (target) setComposeTarget(target);
      },
    });

    setupRichText(editor, labels);
    fixPluginTypes(editor);
    registerBlocks(editor, blocks, labels.blockCategorySections, SECTION_SVG);
    setupLayerNames(editor, labels);

    // The email starts at mj-body: above it are the GrapesJS root and <mjml>, and mj-head,
    // none of which anyone edits here. Sections and columns start open, as they are the
    // structure the rows below them make sense in.
    const STRUCTURE = new Set(["mj-wrapper", "mj-section", "mj-column"]);
    const showBodyInLayers = () => {
      const body = findByTag("mj-body");
      if (!body) return;
      editor.Layers.setRoot(body);
      body.onAll((c) => {
        if (STRUCTURE.has(tagOf(c))) editor.Layers.setOpen(c, true);
      });
    };
    // On each selection GrapesJS closes the rows it opened to show the last one, sections and
    // columns among them. Taken off its list, they stay open until the visitor closes them.
    // The list is internal, so a GrapesJS without it only brings the closing back.
    const keepStructureOpen = () => {
      const layers = editor.Layers as unknown as {
        model?: { get: (key: "opened") => Record<string, Component> | undefined };
      };
      const opened = layers.model?.get("opened") ?? {};
      for (const [cid, c] of Object.entries(opened)) {
        if (STRUCTURE.has(tagOf(c))) delete opened[cid];
      }
    };

    editor.on("component:add", (c: Component) => {
      // A load brings ids the store already uses; only copies made here are renamed.
      if (!loadingRef.current) freshenCopiedIds(editor.getWrapper(), c);
      decorate(c);
    });
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
      // The host document only gets a copy of these, aimed at the iframe (see opensBlockSearch).
      editor.Canvas.getDocument()?.addEventListener("keydown", onBlockSearchKey);
      // GrapesJS sets its configured root on load, which may come after the document did.
      showBodyInLayers();
    });
    // After GrapesJS's own listener, which was added when the editor was created.
    editor.on("component:selected", (c: Component) => {
      keepStructureOpen();
      if (selectionSource.current === "canvas") setSidebarView("settings");
      selectionSource.current = "other";
      buildCrumbs(c);
    });
    // With multi-select a deselection can leave something selected; follow what remains.
    editor.on("component:deselected", () => {
      buildCrumbs(editor.getSelected());
    });

    // The MJML the store holds, as far as this editor knows. A save writes only when the
    // canvas differs from it — the canvas is the truth, not the events that changed it.
    let stored = "";

    const save = async () => {
      // An open rich-text editor holds its text until editing ends.
      const view = editor.getEditing()?.getView() as
        { syncContent?: () => Promise<void> } | undefined;
      await view?.syncContent?.();
      const mjml = editor.getHtml();
      if (mjml === stored) return;
      setSave("saving");
      try {
        await documents.save(docId, { mjml, projectData: editor.getProjectData() });
        stored = mjml;
        setSave("saved");
      } catch (e) {
        setSave("error");
        toast.error(refusal(e) ?? labels.documentSaveFailed, { id: saveToastId(docId) });
        throw e;
      }
    };

    const queue = createSaveQueue(save, 1200);

    editor.on("update", () => {
      notifyState();
      if (!loadingRef.current && !readOnlyRef.current) queue.schedule();
    });
    editor.on("change:device", notifyState);

    // While a turn runs the agent writes the document, so the visitor cannot: edits made
    // meanwhile would be overwritten by the agent's next reload, or overwrite its work.
    const blocked = [
      "core:undo",
      "core:redo",
      "core:paste",
      "core:component-delete",
      "tlb-delete",
      "tlb-clone",
      "tlb-move",
      "open-assets",
      "open-image-picker",
    ];
    for (const id of blocked) {
      editor.on(`command:run:before:${id}`, ({ options }: { options: { abort?: boolean } }) => {
        if (readOnlyRef.current) options.abort = true;
      });
    }
    const lock = (on: boolean) => {
      readOnlyRef.current = on;
      setLocked(on);
      notifyState();
    };
    applyReadOnly.current = async (on) => {
      if (on) {
        lock(true);
        queue.cancel();
        editor.select([]);
        // Through GrapesJS, which otherwise keeps its asset command active and will not reopen.
        editor.AssetManager.close();
        setPicker(null);
        return;
      }
      try {
        await reload();
      } catch (e) {
        // Unlocking a stale canvas would let the next save overwrite what the agent wrote.
        console.error(e);
        toast.error(labels.documentLoadFailed, {
          id: `reload-${docId}`,
          duration: Infinity,
          action: { label: labels.retry, onClick: () => void applyReadOnly.current(false) },
        });
        return;
      }
      lock(false);
    };

    // Only the agent writes during a turn, so the store differs from `stored` exactly when it
    // changed something. Otherwise the canvas is kept, including edits a failed save left unsaved.
    // Queued behind saves and earlier reloads, so a slow one never lands over a newer one.
    const reload = () =>
      queue.run(async () => {
        const fresh = await documents.get(docId);
        if (fresh.mjml !== stored) loadMjml(fresh.mjml);
      });

    const loadMjml = (mjml: string) => {
      // Loading reports changes of its own. What it adds — ids, the starter body — is still
      // written by the next save, which compares against what the store returned.
      loadingRef.current = true;
      let repaired = false;
      try {
        queue.cancel();
        stored = mjml;
        const source = withClosedTags(withoutEditorProps(mjml || STARTER_MJML));
        repaired = source !== (mjml || STARTER_MJML);
        editor.setComponents(source);
        editor.getWrapper()?.find("mj-section").forEach(decorate);
        for (const t of Object.keys(TYPE_LABEL)) {
          editor.getWrapper()?.find(t).forEach(decorate);
        }
        // Attributes the sidebar used to write and MJML rejects. Rendering ignores them, so
        // removing them changes nothing visible, and leaving them fails every agent write.
        editor.getWrapper()?.onAll((c) => {
          const illegal = illegalAttributes(tagOf(c), c.getAttributes());
          if (illegal.length === 0) return;
          c.removeAttributes(illegal);
          repaired = true;
        });
        showBodyInLayers();
        // What was loaded is where undo stops: undoing the load emptied the canvas, or put
        // back what an agent turn had replaced, and the next save stored that.
        editor.UndoManager.clear();
      } finally {
        loadingRef.current = false;
      }
      notifyState();
      // Written now rather than with the next edit: the agent reads the stored copy.
      if (repaired && !readOnlyRef.current) queue.schedule();
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
      toast.error(labels.documentLoadFailed);
      console.error(e);
    } finally {
      setLoading(false);
    }

    onReady({
      getMjml: () => editor.getHtml(),
      getCompiledHtml: compiledHtml,
      flushSave: () => queue.flush(),
      reloadFromDb: reload,
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
        if (readOnlyRef.current) return;
        editor.UndoManager.undo();
        notifyState();
      },
      redo: () => {
        if (readOnlyRef.current) return;
        editor.UndoManager.redo();
        notifyState();
      },
      setZoom: (z) => {
        editor.Canvas.setZoom?.(Math.max(25, Math.min(200, z)));
        notifyState();
      },
      setContentWidth: (w) => {
        if (readOnlyRef.current) return;
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
        // On by default: every visitor's browser would post the host's domain to
        // app.grapesjs.com and leave a session-storage entry, which a host would then have
        // to disclose and, for the entry, ask consent for.
        telemetry: false,
        fromElement: false,
        panels: { defaults: [] },
        blockManager: { appendTo: "#gjs-blocks" },
        // The eye hides a layer by writing `display="none"` into the MJML, which is illegal.
        // The root row is mj-body, which the sidebar reaches as "Email settings" instead.
        layerManager: { appendTo: "#gjs-layers", hidable: false, showWrapper: false },
        assetManager: {
          // Never inline files: mail clients block `data:` images (see ImageLibrary).
          embedAsBase64: false,
          // Our own dialog instead of GrapesJS's modal. GrapesJS still decides when it opens
          // and what a choice applies to; `select(url, true)` sets the image and closes.
          custom: {
            open: (props: {
              select: (asset: string, complete?: boolean) => void;
              // `current` is ours, passed by style properties that have no target component.
              options?: { target?: Component; current?: string };
            }) =>
              setPicker({
                current:
                  props.options?.current ??
                  (String(props.options?.target?.get("src") ?? "") || undefined),
                select: (url) => props.select(url, true),
              }),
            close: () => setPicker(null),
          },
        },
        canvas: {
          customBadgeLabel: badgeLabel(labels),
          // A file or text dragged in from outside lands as `<img>` or `<div>`, which no MJML
          // validator accepts; drags from the palette are unaffected.
          allowExternalDrop: false,
        },
        deviceManager: {
          devices: [
            { id: "desktop", name: "Desktop", width: "" },
            { id: "mobile", name: "Mobile", width: "375px", widthMedia: "480px" },
          ],
        },
        plugins: [
          (editor: Editor) =>
            grapesjsMJML(editor, {
              blocks: BLOCKS,
              block: (id: string) => ({
                label: labels.blockLabels[id] ?? id,
                // By id: a regex on the label broke as soon as a host translated it.
                category: LAYOUT_BLOCKS.has(id)
                  ? labels.blockCategoryLayout
                  : labels.blockCategoryContent,
                ...(id === "mj-social-group" && { content: SOCIAL_BLOCK }),
              }),
            }),
        ],
      }}
      onEditor={onEditor}
    >
      {/* Inert as well as covered, so the keyboard cannot reach the controls either. */}
      <div
        className="relative flex h-full min-h-0 flex-1"
        inert={readOnly}
        onKeyDown={(e) => onBlockSearchKey(e.nativeEvent)}
      >
        {readOnly && (
          <div className="absolute inset-0 z-30 flex cursor-not-allowed items-start justify-center bg-white/20 pt-3">
            <span className="flex items-center gap-2 rounded-full bg-panel px-3 py-1 text-xs text-panel-fg shadow">
              <Spinner /> {labels.agentWorking}
            </span>
          </div>
        )}
        <LeftSidebar
          view={sidebarView}
          onViewChange={setSidebarView}
          markLayersSource={() => (selectionSource.current = "layers")}
          blockSearchRef={blockSearchRef}
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
            <ImagePicker
              open={picker !== null}
              currentUrl={picker?.current}
              onSelect={(url) => {
                // An upload that finished after a turn locked the canvas is not applied.
                if (!readOnlyRef.current) picker?.select(url);
                setPicker(null);
              }}
              // Closed here as well as through GrapesJS: its close() is a no-op whenever it
              // does not consider its asset command active, which left the dialog stuck open.
              onClose={() => {
                setPicker(null);
                editorRef.current?.AssetManager.close();
              }}
            />
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-white/70 text-sm text-zinc-500">
                <Spinner /> {labels.loadingEditor}
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

// Left sidebar (dark): Blocks / Settings / Layers. The block and layer managers are always
// mounted (appendTo targets for GrapesJS) — visibility toggled via `hidden`.
function LeftSidebar({
  view,
  onViewChange,
  markLayersSource,
  blockSearchRef,
}: {
  view: SidebarView;
  onViewChange: (v: SidebarView) => void;
  markLayersSource: () => void;
  blockSearchRef: React.Ref<HTMLInputElement>;
}) {
  const editor = useEditorMaybe();
  const labels = useLabels();
  const [layersExpanded, setLayersExpanded] = useState(false);
  const [blockSearch, setBlockSearch] = useState("");
  const [noBlockMatches, setNoBlockMatches] = useState(false);

  // A tree walk: `find("mj-body")` returns nothing, and falling back to the GrapesJS root
  // offered background fields that never reached the MJML.
  const selectBody = () => {
    let body: Component | undefined;
    editor?.getWrapper()?.onAll((c) => {
      if (!body && tagOf(c) === "mj-body") body = c;
    });
    if (body) editor?.select(body);
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
    setNoBlockMatches(
      [...root.querySelectorAll<HTMLElement>(".gjs-block")].every(
        (b) => b.style.display === "none",
      ),
    );
  };

  return (
    <div className="editor-dark flex w-64 shrink-0 flex-col border-r border-panel-border bg-panel text-panel-fg">
      <div className="flex border-b border-panel-border">
        {(
          [
            ["blocks", labels.tabBlocks],
            ["settings", labels.tabSettings],
            ["layers", labels.tabLayers],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onViewChange(value)}
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
            ref={blockSearchRef}
            value={blockSearch}
            onChange={(e) => filterBlocks(e.target.value)}
            placeholder={labels.searchBlocks}
            className="h-8 border-panel-border bg-panel-elevated pr-10 pl-7 text-sm text-panel-fg placeholder:text-panel-muted-fg"
          />
          <kbd className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 rounded border border-panel-border bg-panel px-1 py-0.5 font-mono text-[10px] text-panel-muted-fg">
            /
          </kbd>
        </div>
        {noBlockMatches && (
          <p className="px-3 py-6 text-center text-xs text-panel-muted-fg">
            {labels.noBlocksMatch}
          </p>
        )}
        <div id="gjs-blocks" className="min-h-0 flex-1 overflow-y-auto" />
      </div>

      <div className={cn("min-h-0 flex-1 overflow-y-auto", view !== "settings" && "hidden")}>
        <Inspector
          onEmailSettings={selectBody}
          empty={
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <MousePointerClick className="size-6 text-panel-muted-fg" />
              <p className="text-sm text-panel-muted-fg">{labels.settingsEmpty}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-panel-border bg-panel-elevated text-panel-fg hover:bg-panel-hover hover:text-panel-fg"
                onClick={selectBody}
              >
                <Mail />
                {labels.emailSettings}
              </Button>
            </div>
          }
        />
      </div>

      {/* Layers — with an expand/collapse-all switch. A pointer-down here marks
          the next selection as coming from the tree (→ do NOT open Settings). */}
      <div
        className={cn("flex min-h-0 flex-1 flex-col", view !== "layers" && "hidden")}
        onMouseDownCapture={markLayersSource}
      >
        <label className="flex items-center justify-between gap-2 border-b border-panel-border px-3 py-2 text-xs text-panel-muted-fg">
          <span>{labels.expandAll}</span>
          <Switch
            checked={layersExpanded}
            onCheckedChange={toggleLayers}
            className="data-[state=checked]:bg-brand data-[state=unchecked]:bg-panel-border"
          />
        </label>
        <div
          id="gjs-layers"
          className="min-h-0 flex-1 overflow-y-auto"
          // A double-click renames a row in GrapesJS, but rows are named by their content.
          onDoubleClickCapture={(e) => {
            if ((e.target as HTMLElement).closest("[data-name]")) e.stopPropagation();
          }}
        />
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
  const labels = useLabels();
  return (
    <div className="flex h-9 shrink-0 items-center gap-0.5 border-t border-border bg-surface px-3 text-xs text-muted-foreground">
      {crumbs.length === 0 ? (
        <span className="text-muted-foreground/60">{labels.selectAnElement}</span>
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
              {crumbName(c, labels)}
            </button>
          </span>
        ))
      )}
    </div>
  );
}
