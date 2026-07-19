"use client";

import grapesjs, { Component, Editor } from "grapesjs";
import GjsEditor, { Canvas, WithEditor, DevicesProvider, useEditor } from "@grapesjs/react";
import grapesjsMJML from "grapesjs-mjml";
import "grapesjs/dist/css/grapes.min.css";
import "./editor-theme.css";
import { useRef, useState } from "react";

import { getDocument, updateDocument, STARTER_MJML } from "@/lib/documents";
import { useToast } from "@/components/ui/toast";

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

export default function EmailEditor({ docId, onReady, onSelectSection, onOpenComments }: Props) {
  const { toast } = useToast();
  // Refy zamiast state — GrapesJS żyje poza cyklem Reacta.
  const loadingRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commentedRef = useRef<Set<string>>(new Set());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [loading, setLoading] = useState(true);

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
          label: "💬",
          attributes: { title: "Komentarze do sekcji" },
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

    editor.on("component:add", ensureSectionId);
    editor.on("component:selected", (c: Component) => {
      const section = closestSection(c);
      onSelectSection(section ? sectionIdOf(section) : null);
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
        selectorManager: { appendTo: "#gjs-selectors" },
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
          {/* Doki renderują się od razu (poza WithEditor) — cele appendTo dla
              natywnych managerów muszą istnieć w DOM przed inicjalizacją. */}
          <LeftDock />
          <div className="relative min-w-0 flex-1">
            <Canvas className="h-full" />
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-sm text-zinc-500">
                Wczytywanie edytora…
              </div>
            )}
          </div>
          <RightDock />
        </div>
      </div>
    </GjsEditor>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: "",
  saving: "Zapisywanie…",
  saved: "Zapisano",
  error: "Błąd zapisu",
};
const SAVE_COLOR: Record<SaveStatus, string> = {
  idle: "text-zinc-400",
  saving: "text-zinc-500",
  saved: "text-emerald-600",
  error: "text-red-600",
};

function TopBar({ saveStatus }: { saveStatus: SaveStatus }) {
  const editor = useEditor();

  const showCode = () => {
    const mjml = escapeHtml(editor.getHtml());
    editor.Modal.open({
      title: "Kod MJML",
      content: `<pre style="max-height:60vh;overflow:auto;white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.5;margin:0;padding:12px;background:#fafafa;border-radius:8px;color:#18181b">${mjml}</pre>`,
    });
  };

  const btn =
    "inline-flex h-8 items-center gap-1 rounded-md border border-border bg-white px-2.5 text-sm text-zinc-700 hover:bg-zinc-50";

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
      <span className="text-sm font-semibold text-zinc-800">MJML Editor</span>

      <div className="mx-1 h-5 w-px bg-border" />

      <DevicesProvider>
        {({ devices, selected, select }) => (
          <div className="inline-flex overflow-hidden rounded-md border border-border">
            {devices.map((d) => (
              <button
                key={String(d.id)}
                onClick={() => select(String(d.id))}
                className={`h-8 px-2.5 text-sm ${
                  selected === d.id
                    ? "bg-brand text-brand-fg"
                    : "bg-white text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                {d.getName() || String(d.id)}
              </button>
            ))}
          </div>
        )}
      </DevicesProvider>

      <button className={btn} onClick={() => editor.UndoManager.undo()} title="Cofnij">
        ↶
      </button>
      <button className={btn} onClick={() => editor.UndoManager.redo()} title="Ponów">
        ↷
      </button>

      <div className="ml-auto flex items-center gap-3">
        <span className={`text-xs ${SAVE_COLOR[saveStatus]}`}>{SAVE_LABEL[saveStatus]}</span>
        <button className={btn} onClick={showCode} title="Pokaż kod MJML">
          Kod MJML
        </button>
      </div>
    </div>
  );
}

function LeftDock() {
  return (
    <div className="flex w-52 shrink-0 flex-col overflow-hidden border-r border-border bg-surface">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        Bloki
      </div>
      <div id="gjs-blocks" className="min-h-0 flex-1 overflow-y-auto" />
    </div>
  );
}

type RightTab = "settings" | "style" | "layers";

function RightDock() {
  const [tab, setTab] = useState<RightTab>("settings");
  const tabs: { id: RightTab; label: string }[] = [
    { id: "settings", label: "Ustawienia" },
    { id: "style", label: "Styl" },
    { id: "layers", label: "Warstwy" },
  ];
  return (
    <div className="flex w-64 shrink-0 flex-col border-l border-border bg-surface">
      <div className="flex border-b border-border text-xs">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-2 py-2 font-medium ${
              tab === t.id ? "border-b-2 border-brand text-brand" : "text-zinc-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={tab === "settings" ? "" : "hidden"}>
          <div id="gjs-traits" />
        </div>
        <div className={tab === "style" ? "" : "hidden"}>
          <div id="gjs-selectors" />
          <div id="gjs-styles" />
        </div>
        <div className={tab === "layers" ? "" : "hidden"}>
          <div id="gjs-layers" />
        </div>
      </div>
    </div>
  );
}
