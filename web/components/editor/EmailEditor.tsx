"use client";

import grapesjs, { Component, Editor } from "grapesjs";
import GjsEditor, {
  Canvas,
  WithEditor,
  DevicesProvider,
  useEditor,
  useEditorMaybe,
} from "@grapesjs/react";
import grapesjsMJML from "grapesjs-mjml";
import "grapesjs/dist/css/grapes.min.css";
import "./editor-theme.css";
import { useRef, useState, type ReactNode } from "react";

import { getDocument, updateDocument, STARTER_MJML } from "@/lib/documents";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Undo2, Redo2, Code2, Copy, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type EditorApi = {
  /** Aktualne źródło MJML z edytora. */
  getMjml: () => string;
  /** Natychmiastowy zapis stanu edytora do bazy. */
  flushSave: () => Promise<void>;
  /** Przeładowanie dokumentu z bazy (po zmianach agenta). */
  reloadFromDb: () => Promise<void>;
  /** Zaznacza i przewija do sekcji o danym sec-id. */
  selectSection: (sectionId: string) => void;
  /** Podświetla w kanwie sekcje o danych sec-id (reszta bez podświetlenia). */
  setCommentedSections: (sectionIds: string[]) => void;
};

type Props = {
  docId: string;
  onReady: (api: EditorApi) => void;
  onSelectSection: (sectionId: string | null) => void;
  onOpenComments: (sectionId: string) => void;
};

const SEC_ID_RE = /\bsec-([A-Za-z0-9_-]+)\b/;

// Ikona „gwiazdki" (lucide Sparkles) jako label w toolbarze GrapesJS.
const SPARKLES_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>';

function isSection(c: Component): boolean {
  return c.get("tagName") === "mj-section" || c.get("type") === "mj-section";
}

function sectionIdOf(c: Component): string | null {
  const cssClass = String(c.getAttributes()["css-class"] ?? "");
  return cssClass.match(SEC_ID_RE)?.[1] ?? null;
}

function closestSection(c: Component | undefined): Component | null {
  let cur: Component | undefined = c;
  while (cur) {
    if (isSection(cur)) return cur;
    cur = cur.parent() ?? undefined;
  }
  return null;
}

function findSection(editor: Editor, sectionId: string): Component | undefined {
  return editor
    .getWrapper()
    ?.find("mj-section")
    .find((c) => sectionIdOf(c) === sectionId);
}

/** Elementy sekcji w dokumencie kanwy (mj-section kompiluje się do <div class="sec-…">). */
function secEls(editor: Editor, sectionId: string): HTMLElement[] {
  const doc = editor.Canvas.getDocument();
  if (!doc) return [];
  return [...doc.querySelectorAll<HTMLElement>(`.sec-${CSS.escape(sectionId)}`)];
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

// Opakowuje bieżące zaznaczenie (w dokumencie kanwy) w <span> z inline-stylem.
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
// Rozszerza domyślny RTE GrapesJS (zgodny z mjml) o czcionkę/rozmiar/kolory.
function setupRichText(editor: Editor) {
  const rte = editor.RichTextEditor as any;
  const val = (action: any, sel: string) =>
    (action.btn?.querySelector(sel) as HTMLInputElement | HTMLSelectElement | null)?.value ?? "";

  rte.add("fontName", {
    icon: `<select class="gjs-rte-select" title="Czcionka"><option value="">Czcionka</option>${RTE_FONTS.map(
      (f) => `<option value="${f}">${f}</option>`,
    ).join("")}</select>`,
    event: "change",
    result: (r: any, action: any) => {
      const v = val(action, "select");
      if (v) r.exec("fontName", v);
    },
  });

  rte.add("fontSize", {
    icon: `<select class="gjs-rte-select" title="Rozmiar"><option value="">Rozmiar</option>${RTE_SIZES.map(
      (s) => `<option value="${s}px">${s}</option>`,
    ).join("")}</select>`,
    event: "change",
    result: (r: any, action: any) => {
      const v = val(action, "select");
      if (v) wrapSelectionStyle(r.el, { fontSize: v });
    },
  });

  rte.add("forecolor", {
    icon: `<input type="color" class="gjs-rte-color" title="Kolor tekstu" value="#000000">`,
    event: "change",
    result: (r: any, action: any) => r.exec("foreColor", val(action, "input")),
  });

  rte.add("hilitecolor", {
    icon: `<input type="color" class="gjs-rte-color" title="Kolor tła" value="#ffff00">`,
    event: "change",
    result: (r: any, action: any) => r.exec("hiliteColor", val(action, "input")),
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export default function EmailEditor({ docId, onReady, onSelectSection, onOpenComments }: Props) {
  // Refy zamiast state — GrapesJS żyje poza cyklem Reacta.
  const loadingRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commentedRef = useRef<Set<string>>(new Set());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [loading, setLoading] = useState(true);
  const [sidebarView, setSidebarView] = useState<SidebarView>("blocks");

  const onEditor = async (editor: Editor) => {
    const ensureSectionId = (c: Component) => {
      if (!isSection(c)) return;
      if (!sectionIdOf(c)) {
        const cssClass = String(c.getAttributes()["css-class"] ?? "");
        const id = crypto.randomUUID().slice(0, 8);
        c.addAttributes({ "css-class": `${cssClass} sec-${id}`.trim() });
      }
      const toolbar = [...((c.get("toolbar") as { command?: string }[]) ?? [])];
      if (!toolbar.some((t) => t.command === "section-comments")) {
        toolbar.push({
          command: "section-comments",
          label: SPARKLES_SVG,
          attributes: { title: "Komentarze do sekcji", "data-role": "sparkles" },
        } as never);
        c.set("toolbar", toolbar as never);
      }
    };

    // Podświetlenie sekcji z komentarzem — inline outline na elemencie w
    // dokumencie kanwy (.sec-<id>). NIE dotykamy modelu/MJML (css-class
    // zostaje czyste dla sec-id i agenta); znacznik data-* do czyszczenia.
    const applyCommentHighlights = () => {
      const doc = editor.Canvas.getDocument();
      if (!doc) return;
      doc.querySelectorAll<HTMLElement>("[data-sec-commented]").forEach((el) => {
        el.style.outline = "";
        el.style.outlineOffset = "";
        el.removeAttribute("data-sec-commented");
      });
      commentedRef.current.forEach((id) => {
        secEls(editor, id).forEach((el) => {
          el.style.outline = "2px solid #f59e0b";
          el.style.outlineOffset = "-2px";
          el.setAttribute("data-sec-commented", "");
        });
      });
    };

    editor.Commands.add("section-comments", {
      run(ed: Editor) {
        const section = closestSection(ed.getSelected() ?? undefined);
        const id = section ? sectionIdOf(section) : null;
        if (id) onOpenComments(id);
      },
    });

    setupRichText(editor);

    editor.on("component:add", ensureSectionId);
    editor.on("component:selected", (c: Component) => {
      const section = closestSection(c);
      onSelectSection(section ? sectionIdOf(section) : null);
      setSidebarView("settings");
      // mj-image nie ma domyślnie traita src (src zmienia się przez Asset
      // Manager) — dodaj pole URL, żeby dało się ustawić obraz w panelu.
      if (c?.get("type") === "mj-image" && !c.getTrait("src")) {
        // src to WŁAŚCIWOŚĆ modelu obrazu (get('src')), nie atrybut — stąd
        // changeProp, żeby wpisany URL od razu przeładował obraz w kanwie.
        c.addTrait(
          {
            type: "text",
            name: "src",
            label: "Obraz (URL)",
            placeholder: "https://…",
            changeProp: true,
          } as never,
          { at: 0 },
        );
      }
    });
    editor.on("component:deselected", () => onSelectSection(null));

    const save = async () => {
      if (loadingRef.current) return;
      setSaveStatus("saving");
      try {
        await updateDocument(docId, {
          mjml: editor.getHtml(),
          project_data: editor.getProjectData(),
        });
        setSaveStatus("saved");
      } catch (e) {
        setSaveStatus("error");
        toast.error("Nie udało się zapisać zmian.");
        throw e;
      }
    };

    editor.on("update", () => {
      if (loadingRef.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void save().catch(console.error), 1200);
    });

    const loadMjml = (mjml: string) => {
      loadingRef.current = true;
      try {
        editor.setComponents(mjml || STARTER_MJML);
        editor.getWrapper()?.find("mj-section").forEach(ensureSectionId);
        applyCommentHighlights();
      } finally {
        loadingRef.current = false;
      }
    };

    try {
      const doc = await getDocument(docId);
      loadMjml(doc.mjml);
    } catch (e) {
      toast.error("Nie udało się wczytać dokumentu.");
      console.error(e);
    } finally {
      setLoading(false);
    }

    onReady({
      getMjml: () => editor.getHtml(),
      flushSave: async () => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        await save();
      },
      reloadFromDb: async () => {
        const fresh = await getDocument(docId);
        if (fresh.mjml !== editor.getHtml()) loadMjml(fresh.mjml);
      },
      selectSection: (sectionId: string) => {
        const c = findSection(editor, sectionId);
        if (c) editor.select(c);
        secEls(editor, sectionId)[0]?.scrollIntoView({ behavior: "smooth", block: "center" });
      },
      setCommentedSections: (sectionIds: string[]) => {
        commentedRef.current = new Set(sectionIds);
        applyCommentHighlights();
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
        // Natywne managery renderują się wprost do naszych doków (id poniżej).
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
      <div className="flex h-full min-h-0 flex-col bg-surface-muted text-foreground">
        <WithEditor>
          <TopBar saveStatus={saveStatus} />
        </WithEditor>
        <div className="flex min-h-0 flex-1">
          {/* Sidebar renderuje się od razu (poza WithEditor) — cele appendTo
              natywnych managerów muszą istnieć w DOM przed inicjalizacją. */}
          <LeftSidebar view={sidebarView} onViewChange={setSidebarView} />
          <div className="relative min-w-0 flex-1">
            <Canvas className="h-full" />
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-white/70 text-sm text-zinc-500">
                <Spinner /> Wczytywanie edytora…
              </div>
            )}
          </div>
        </div>
      </div>
    </GjsEditor>
  );
}

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: "",
  saving: "Zapisywanie…",
  saved: "Zapisano",
  error: "Błąd zapisu",
};

function SaveBadge({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  if (status === "saving") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Spinner className="size-3" /> {SAVE_LABEL.saving}
      </Badge>
    );
  }
  if (status === "error") return <Badge variant="destructive">{SAVE_LABEL.error}</Badge>;
  return (
    <Badge variant="outline" className="border-emerald-300 text-emerald-600">
      {SAVE_LABEL.saved}
    </Badge>
  );
}

function TopBar({ saveStatus }: { saveStatus: SaveStatus }) {
  const editor = useEditor();
  const [code, setCode] = useState("");

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
      <span className="text-sm font-semibold text-zinc-800">MJML Editor</span>

      <Separator orientation="vertical" className="mx-1 !h-5" />

      <DevicesProvider>
        {({ devices, selected, select }) => (
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={selected}
            onValueChange={(v) => v && select(v)}
          >
            {devices.map((d) => (
              <ToggleGroupItem key={String(d.id)} value={String(d.id)}>
                {d.getName() || String(d.id)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </DevicesProvider>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={() => editor.UndoManager.undo()}>
            <Undo2 />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Cofnij</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={() => editor.UndoManager.redo()}>
            <Redo2 />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Ponów</TooltipContent>
      </Tooltip>

      <div className="ml-auto flex items-center gap-2">
        <SaveBadge status={saveStatus} />
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" onClick={() => setCode(editor.getHtml())}>
              <Code2 /> Kod MJML
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Kod MJML</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh] rounded-md border bg-muted/40">
              <pre className="p-3 text-xs leading-relaxed break-words whitespace-pre-wrap">
                {code}
              </pre>
            </ScrollArea>
            <Button
              variant="secondary"
              size="sm"
              className="self-end"
              onClick={() => {
                void navigator.clipboard?.writeText(code);
                toast.success("Skopiowano kod MJML.");
              }}
            >
              <Copy /> Kopiuj
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

type SidebarView = "blocks" | "settings" | "layers";

// Zwijana sekcja — treść ZAWSZE zamontowana (cel appendTo), chowana przez hidden.
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
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase hover:text-zinc-800"
      >
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        {title}
      </button>
      <div className={cn(!open && "hidden")}>{children}</div>
    </div>
  );
}

// Lewy sidebar: Bloki / Ustawienia / Warstwy. Wszystkie managery są zawsze
// zamontowane (cele appendTo dla GrapesJS) — przełączamy widoczność przez hidden.
function LeftSidebar({
  view,
  onViewChange,
}: {
  view: SidebarView;
  onViewChange: (v: SidebarView) => void;
}) {
  const editor = useEditorMaybe();
  const [layersExpanded, setLayersExpanded] = useState(false);

  // Klik „Ustawienia" bez zaznaczonego obiektu → pokaż ustawienia całego body.
  const changeView = (v: SidebarView) => {
    if (v === "settings" && editor && !editor.getSelected()) {
      const wrapper = editor.getWrapper();
      const body = wrapper?.find("mj-body")[0] ?? wrapper;
      if (body) editor.select(body);
    }
    onViewChange(v);
  };

  // Rozwiń/zwiń wszystkie warstwy naraz.
  const toggleLayers = (expand: boolean) => {
    setLayersExpanded(expand);
    editor?.getWrapper()?.onAll((c) => c.set("open", expand));
  };

  return (
    <div className="flex w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex border-b border-border">
        {(
          [
            ["blocks", "Bloki"],
            ["settings", "Ustawienia"],
            ["layers", "Warstwy"],
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
                ? "font-medium text-foreground after:bg-brand"
                : "text-muted-foreground after:bg-transparent hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Bloki */}
      <div
        id="gjs-blocks"
        className={cn("min-h-0 flex-1 overflow-y-auto", view !== "blocks" && "hidden")}
      />

      {/* Ustawienia: Atrybuty + Styl (zwijane, jedno pod drugim) */}
      <div className={cn("min-h-0 flex-1 overflow-y-auto", view !== "settings" && "hidden")}>
        <CollapseSection title="Atrybuty">
          <div id="gjs-traits" />
        </CollapseSection>
        <CollapseSection title="Styl">
          <div id="gjs-styles" />
        </CollapseSection>
      </div>

      {/* Warstwy — z przełącznikiem rozwiń/zwiń wszystko */}
      <div className={cn("flex min-h-0 flex-1 flex-col", view !== "layers" && "hidden")}>
        <label className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs text-zinc-600">
          <span>Rozwiń wszystkie</span>
          <Switch checked={layersExpanded} onCheckedChange={toggleLayers} />
        </label>
        <div id="gjs-layers" className="min-h-0 flex-1 overflow-y-auto" />
      </div>
    </div>
  );
}
