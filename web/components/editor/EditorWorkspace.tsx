"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";

import ChatPanel from "@/components/chat/ChatPanel";
import CommentsPanel from "@/components/comments/CommentsPanel";
import type { EditorApi } from "@/components/editor/EmailEditor";
import type { CommentTarget } from "@/lib/documents";

// GrapesJS dotyka window przy imporcie — tylko po stronie klienta.
const EmailEditor = dynamic(() => import("@/components/editor/EmailEditor"), { ssr: false });

export default function EditorWorkspace({ docId }: { docId: string }) {
  const editorApi = useRef<EditorApi | null>(null);
  const [commentTarget, setCommentTarget] = useState<CommentTarget | null>(null);
  const [commentsRefresh, setCommentsRefresh] = useState(0);
  const [tab, setTab] = useState<"chat" | "comments">("chat");

  const openComments = useCallback((target: CommentTarget) => {
    setCommentTarget(target);
    setTab("comments");
  }, []);

  // Wołane po każdej pojedynczej edycji agenta (mutujący tool-call) oraz na
  // koniec tury — odświeża podgląd z bazy i listę komentarzy na żywo.
  const onLiveUpdate = useCallback(() => {
    void editorApi.current?.reloadFromDb();
    setCommentsRefresh((n) => n + 1);
  }, []);

  // Podświetlenie sekcji na czas jej edycji przez agenta (start/koniec tool-calla).
  const onSectionEditStart = useCallback((sectionId: string) => {
    editorApi.current?.highlightSection(sectionId, true);
  }, []);
  const onSectionEditEnd = useCallback((sectionId: string) => {
    editorApi.current?.highlightSection(sectionId, false);
  }, []);

  return (
    <div className="flex h-screen">
      <div className="min-w-0 flex-1">
        <EmailEditor
          docId={docId}
          onReady={(api) => (editorApi.current = api)}
          onSelectTarget={setCommentTarget}
          onOpenComments={openComments}
        />
      </div>

      <aside className="flex w-[420px] shrink-0 flex-col border-l border-zinc-200 bg-white">
        <div className="flex border-b border-zinc-200 text-sm">
          {(["chat", "comments"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 px-3 py-2 font-medium ${
                tab === t ? "border-b-2 border-blue-600 text-blue-600" : "text-zinc-500"
              }`}
            >
              {t === "chat" ? "Agent" : "Komentarze"}
            </button>
          ))}
        </div>
        <div className={`min-h-0 flex-1 ${tab === "chat" ? "" : "hidden"}`}>
          <ChatPanel
            docId={docId}
            onBeforeSend={async () => {
              await editorApi.current?.flushSave();
            }}
            onAgentFinish={onLiveUpdate}
            onLiveUpdate={onLiveUpdate}
            onSectionEditStart={onSectionEditStart}
            onSectionEditEnd={onSectionEditEnd}
          />
        </div>
        <div className={`min-h-0 flex-1 ${tab === "comments" ? "" : "hidden"}`}>
          <CommentsPanel
            docId={docId}
            target={commentTarget}
            refreshSignal={commentsRefresh}
          />
        </div>
      </aside>
    </div>
  );
}
