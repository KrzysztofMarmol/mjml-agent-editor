"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import {
  ChatPanel,
  EditorHeader,
  EditorStoreProvider,
  type EditorApi,
} from "@mjml-agent-editor/editor";
import { Button, cn } from "@mjml-agent-editor/editor/ui";

import { editorStores } from "@/lib/stores";

// GrapesJS touches window at import time — client side only.
const EmailEditor = dynamic(
  () => import("@mjml-agent-editor/editor/canvas").then((m) => m.EmailEditor),
  { ssr: false },
);

export default function EditorWorkspace({ docId }: { docId: string }) {
  const editorApi = useRef<EditorApi | null>(null);
  const [api, setApi] = useState<EditorApi | null>(null);
  const [commentsRefresh, setCommentsRefresh] = useState(0);
  const [openCount, setOpenCount] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  // Refreshes the preview from the DB and the canvas comment pins live.
  const onLiveUpdate = useCallback(() => {
    void editorApi.current?.reloadFromDb();
    setCommentsRefresh((n) => n + 1);
  }, []);

  const onSectionEditStart = useCallback((sectionId: string) => {
    editorApi.current?.highlightSection(sectionId, true);
  }, []);
  const onSectionEditEnd = useCallback((sectionId: string) => {
    editorApi.current?.highlightSection(sectionId, false);
  }, []);

  return (
    // One place decides where the editor's data comes from.
    <EditorStoreProvider stores={editorStores}>
      <div className="flex h-screen flex-col">
        <EditorHeader
          docId={docId}
          api={api}
          openCount={openCount}
          homeLink={
            <Link
              href="/"
              className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
            >
              <ArrowLeft className="size-4" /> All emails
            </Link>
          }
        />

        <div className="relative flex min-h-0 flex-1">
          <div className="min-w-0 flex-1">
            <EmailEditor
              docId={docId}
              onReady={(a) => {
                editorApi.current = a;
                setApi(a);
              }}
              commentsRefresh={commentsRefresh}
              onOpenCountChange={setOpenCount}
            />
          </div>

          {/* Right panel — AI chat only. Stays mounted (w-0 collapsed) so chat state survives. */}
          <aside
            className={cn(
              "editor-dark flex shrink-0 flex-col border-l border-panel-border bg-panel text-panel-fg transition-[width] duration-200",
              "max-lg:absolute max-lg:top-0 max-lg:right-0 max-lg:z-30 max-lg:h-full max-lg:shadow-xl",
              collapsed ? "w-0 overflow-hidden border-l-0" : "w-[380px]",
            )}
          >
            <div className="flex min-w-[380px] items-center justify-between border-b border-panel-border px-3 py-2">
              <span className="text-sm font-medium">AI Agent</span>
              <Button
                variant="ghost"
                size="icon"
                className="text-panel-muted-fg hover:bg-white/10 hover:text-panel-fg"
                onClick={() => setCollapsed(true)}
                title="Collapse panel"
              >
                <PanelRightClose />
              </Button>
            </div>
            <div className="min-h-0 min-w-[380px] flex-1">
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
          </aside>

          {collapsed && (
            <Button
              variant="outline"
              size="icon"
              className="absolute top-2 right-2 z-20 shadow-sm"
              onClick={() => setCollapsed(false)}
              title="Expand panel"
            >
              <PanelRightOpen />
            </Button>
          )}
        </div>
      </div>
    </EditorStoreProvider>
  );
}
