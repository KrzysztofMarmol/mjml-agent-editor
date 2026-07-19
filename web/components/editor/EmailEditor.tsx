"use client";

import grapesjs, { Component, Editor } from "grapesjs";
import GjsEditor from "@grapesjs/react";
import grapesjsMJML from "grapesjs-mjml";
import "grapesjs/dist/css/grapes.min.css";
import { useRef } from "react";

import { getDocument, updateDocument, STARTER_MJML, type CommentTarget } from "@/lib/documents";

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
  onSelectTarget: (target: CommentTarget | null) => void;
  onOpenComments: (target: CommentTarget) => void;
};

const SEC_ID_RE = /\bsec-([A-Za-z0-9_-]+)\b/;
const OBJ_ID_RE = /\bobj-([A-Za-z0-9_-]+)\b/;

// Typy elementów, do których można dodać komentarz (poza sekcją).
const TYPE_LABEL: Record<string, string> = {
  "mj-text": "Tekst",
  "mj-button": "Przycisk",
  "mj-image": "Obraz",
  "mj-column": "Kolumna",
};

function tagOf(c: Component): string {
  return String(c.get("tagName") || c.get("type") || "");
}

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

function objectIdOf(c: Component): string | null {
  return classMatch(c, OBJ_ID_RE);
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

function objectLabel(c: Component): string {
  const base = TYPE_LABEL[tagOf(c)] ?? tagOf(c);
  const text = String((c.getEl?.() as HTMLElement | undefined)?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30);
  return text ? `${base}: „${text}”` : base;
}

export default function EmailEditor({ docId, onReady, onSelectTarget, onOpenComments }: Props) {
  // Refy zamiast state — GrapesJS żyje poza cyklem Reacta.
  const loadingRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onEditor = async (editor: Editor) => {
    // Cel komentarza dla komponentu: jego sekcja + (jeśli to nie sama sekcja)
    // konkretny element. Nadaje stabilne ID (sec-/obj-) w razie potrzeby.
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

    // Nadaje sekcji sec-<id> i dokleja przycisk 💬 do paska każdego elementu,
    // do którego można dodać komentarz (sekcja + tekst/przycisk/obraz/kolumna).
    const decorate = (c: Component) => {
      if (isSection(c)) addIdClass(c, "sec");
      if (!isCommentable(c)) return;
      const toolbar = [...((c.get("toolbar") as { command?: string }[]) ?? [])];
      if (!toolbar.some((t) => t.command === "open-comments")) {
        toolbar.push({
          command: "open-comments",
          label: "💬",
          attributes: { title: "Komentarz do elementu / sekcji" },
        } as never);
        c.set("toolbar", toolbar as never);
      }
    };

    editor.Commands.add("open-comments", {
      run(ed: Editor) {
        const target = targetOf(ed.getSelected() ?? undefined);
        if (target) onOpenComments(target);
      },
    });

    editor.on("component:add", decorate);
    editor.on("component:selected", (c: Component) => onSelectTarget(targetOf(c)));
    editor.on("component:deselected", () => onSelectTarget(null));

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
      // Nadaj sec-<id> sekcjom i przyciski 💬 wszystkim komentowalnym elementom.
      editor.getWrapper()?.find("mj-section").forEach(decorate);
      for (const t of Object.keys(TYPE_LABEL)) {
        editor.getWrapper()?.find(t).forEach(decorate);
      }
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
