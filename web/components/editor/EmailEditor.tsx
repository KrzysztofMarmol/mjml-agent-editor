"use client";

import grapesjs, { Component, Editor } from "grapesjs";
import GjsEditor from "@grapesjs/react";
import grapesjsMJML from "grapesjs-mjml";
import "grapesjs/dist/css/grapes.min.css";
import { useRef } from "react";

import { getDocument, updateDocument, STARTER_MJML } from "@/lib/documents";

export type EditorApi = {
  /** Aktualne źródło MJML z edytora. */
  getMjml: () => string;
  /** Natychmiastowy zapis stanu edytora do bazy. */
  flushSave: () => Promise<void>;
  /** Przeładowanie dokumentu z bazy (po zmianach agenta). */
  reloadFromDb: () => Promise<void>;
  /** Podświetla sekcję w canvasie na czas edycji przez agenta. */
  highlightSection: (sectionId: string, on: boolean) => void;
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

export default function EmailEditor({ docId, onReady, onSelectSection, onOpenComments }: Props) {
  // Refy zamiast state — GrapesJS żyje poza cyklem Reacta.
  const loadingRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onEditor = async (editor: Editor) => {
    const ensureSectionId = (c: Component) => {
      if (!isSection(c)) return;
      if (!sectionIdOf(c)) {
        const cssClass = String(c.getAttributes()["css-class"] ?? "");
        const id = Math.random().toString(36).slice(2, 10);
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
      await updateDocument(docId, {
        mjml: editor.getHtml(),
        project_data: editor.getProjectData(),
      });
    };

    editor.on("update", () => {
      if (loadingRef.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void save().catch(console.error), 1200);
    });

    const loadMjml = (mjml: string) => {
      // Wygłuszamy autosave na czas ładowania i chwilę po nim — setComponents
      // potrafi odpalić event "update" asynchronicznie, co bez tego nadpisałoby
      // w bazie świeżą zmianę agenta znormalizowaną wersją z edytora.
      loadingRef.current = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      editor.setComponents(mjml || STARTER_MJML);
      editor.getWrapper()?.find("mj-section").forEach(ensureSectionId);
      setTimeout(() => {
        loadingRef.current = false;
      }, 400);
    };

    // Podświetlenie sekcji edytowanej przez agenta — animacja wstrzykiwana do
    // dokumentu canvasu (iframe GrapesJS).
    const ensureHighlightStyles = () => {
      const cdoc = editor.Canvas.getDocument();
      if (!cdoc || cdoc.getElementById("agent-edit-style")) return;
      const style = cdoc.createElement("style");
      style.id = "agent-edit-style";
      style.textContent = `
        @keyframes agentEditPulse {
          0%, 100% { outline-color: rgba(37, 99, 235, 0.25); }
          50%      { outline-color: rgba(37, 99, 235, 0.95); }
        }
        .agent-editing {
          outline: 3px solid rgba(37, 99, 235, 0.9) !important;
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

    const doc = await getDocument(docId);
    loadMjml(doc.mjml);

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
      highlightSection: (sectionId, on) => {
        ensureHighlightStyles();
        const el = sectionEl(sectionId);
        if (!el) return;
        el.classList.toggle("agent-editing", on);
      },
    });
  };

  return (
    <GjsEditor
      grapesjs={grapesjs}
      options={{
        height: "100%",
        storageManager: false,
        fromElement: false,
        plugins: [grapesjsMJML],
      }}
      onEditor={onEditor}
    />
  );
}
