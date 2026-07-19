"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import ChatPanel from "@/components/chat/ChatPanel";
import CommentsPanel from "@/components/comments/CommentsPanel";
import type { EditorApi } from "@/components/editor/EmailEditor";

// GrapesJS dotyka window przy imporcie — tylko po stronie klienta.
const EmailEditor = dynamic(() => import("@/components/editor/EmailEditor"), { ssr: false });

const LS_WIDTH = "mjml.sidebar.width";
const MIN_W = 320;
const MAX_W = 640;
const DEFAULT_W = 400;

function clamp(w: number): number {
  return Math.min(MAX_W, Math.max(MIN_W, Math.round(w)));
}

export default function EditorWorkspace({ docId }: { docId: string }) {
  const editorApi = useRef<EditorApi | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [commentsRefresh, setCommentsRefresh] = useState(0);
  const [tab, setTab] = useState<"chat" | "comments">("chat");
  const [openCount, setOpenCount] = useState(0);
  const openSectionIdsRef = useRef<string[]>([]);

  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(DEFAULT_W);
  const widthRef = useRef(DEFAULT_W);

  const applyWidth = useCallback((w: number) => {
    const c = clamp(w);
    widthRef.current = c;
    setWidth(c);
  }, []);

  // Szerokość z localStorage po montażu (odczyt po hydracji — unikamy
  // niezgodności SSR; jednorazowa synchronizacja z zewnętrznym systemem).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LS_WIDTH);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) applyWidth(Number(raw));
    } catch {
      // ignore
    }
  }, [applyWidth]);

  const openComments = useCallback((sectionId: string) => {
    setSelectedSectionId(sectionId);
    setTab("comments");
    setCollapsed(false);
  }, []);

  const onAgentFinish = useCallback(() => {
    void editorApi.current?.reloadFromDb();
    setCommentsRefresh((n) => n + 1);
  }, []);

  const onOpenChange = useCallback((info: { count: number; sectionIds: string[] }) => {
    setOpenCount(info.count);
    openSectionIdsRef.current = info.sectionIds;
    editorApi.current?.setCommentedSections(info.sectionIds);
  }, []);

  const startResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const onMove = (ev: PointerEvent) => applyWidth(window.innerWidth - ev.clientX);
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        try {
          window.localStorage.setItem(LS_WIDTH, String(widthRef.current));
        } catch {
          // ignore
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [applyWidth],
  );

  const badge =
    openCount > 0 ? (
      <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white">
        {openCount}
      </span>
    ) : null;

  return (
    <div className="relative flex h-screen">
      <div className="min-w-0 flex-1">
        <EmailEditor
          docId={docId}
          onReady={(api) => {
            editorApi.current = api;
            // Edytor mógł być gotowy po wczytaniu komentarzy — dociągnij podświetlenia.
            api.setCommentedSections(openSectionIdsRef.current);
          }}
          onSelectSection={setSelectedSectionId}
          onOpenComments={openComments}
        />
      </div>

      {/* Tło na wąskich ekranach, gdy panel (overlay) jest otwarty. */}
      {!collapsed && (
        <button
          aria-label="Zamknij panel"
          onClick={() => setCollapsed(true)}
          className="fixed inset-0 z-20 hidden bg-black/20 max-lg:block"
        />
      )}

      {collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          className="flex w-10 shrink-0 flex-col items-center gap-2 border-l border-border bg-surface py-3 text-zinc-500 hover:text-zinc-800"
          title="Rozwiń panel"
        >
          <span aria-hidden>‹</span>
          {badge}
        </button>
      ) : (
        <aside
          style={{ width }}
          className="relative flex shrink-0 flex-col border-l border-border bg-surface max-lg:absolute max-lg:right-0 max-lg:top-0 max-lg:z-30 max-lg:h-full max-lg:shadow-xl"
        >
          <div
            onPointerDown={startResize}
            className="absolute left-0 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-brand/40"
            title="Przeciągnij, aby zmienić szerokość"
          />

          <div className="flex items-center border-b border-border text-sm">
            {(["chat", "comments"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 px-3 py-2 font-medium ${
                  tab === t ? "border-b-2 border-brand text-brand" : "text-zinc-500"
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  {t === "chat" ? "Agent" : "Komentarze"}
                  {t === "comments" ? badge : null}
                </span>
              </button>
            ))}
            <button
              onClick={() => setCollapsed(true)}
              className="px-2 text-zinc-400 hover:text-zinc-700"
              title="Zwiń panel"
            >
              ›
            </button>
          </div>

          <div className={`min-h-0 flex-1 ${tab === "chat" ? "" : "hidden"}`}>
            <ChatPanel
              docId={docId}
              onBeforeSend={async () => {
                await editorApi.current?.flushSave();
              }}
              onAgentFinish={onAgentFinish}
            />
          </div>
          <div className={`min-h-0 flex-1 ${tab === "comments" ? "" : "hidden"}`}>
            <CommentsPanel
              docId={docId}
              selectedSectionId={selectedSectionId}
              refreshSignal={commentsRefresh}
              onNavigate={(id) => editorApi.current?.selectSection(id)}
              onOpenChange={onOpenChange}
            />
          </div>
        </aside>
      )}
    </div>
  );
}
