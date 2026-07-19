"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";

import { cn } from "@/lib/utils";
import ChatPanel from "@/components/chat/ChatPanel";
import CommentsPanel from "@/components/comments/CommentsPanel";
import type { EditorApi } from "@/components/editor/EmailEditor";
import type { CommentTarget } from "@/lib/documents";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// GrapesJS touches window at import time — client side only.
const EmailEditor = dynamic(() => import("@/components/editor/EmailEditor"), { ssr: false });

export default function EditorWorkspace({ docId }: { docId: string }) {
  const editorApi = useRef<EditorApi | null>(null);
  const [commentTarget, setCommentTarget] = useState<CommentTarget | null>(null);
  const [commentsRefresh, setCommentsRefresh] = useState(0);
  const [tab, setTab] = useState<"chat" | "comments">("chat");
  const [openCount, setOpenCount] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  const openComments = useCallback((target: CommentTarget) => {
    setCommentTarget(target);
    setTab("comments");
    setCollapsed(false);
  }, []);

  // Called after each single agent edit (mutating tool call) and at the end
  // of the turn — refreshes the preview from the DB and the comment list live.
  const onLiveUpdate = useCallback(() => {
    void editorApi.current?.reloadFromDb();
    setCommentsRefresh((n) => n + 1);
  }, []);

  // Section highlight while the agent edits it (tool call start/end).
  const onSectionEditStart = useCallback((sectionId: string) => {
    editorApi.current?.highlightSection(sectionId, true);
  }, []);
  const onSectionEditEnd = useCallback((sectionId: string) => {
    editorApi.current?.highlightSection(sectionId, false);
  }, []);

  const badge =
    openCount > 0 ? (
      <Badge variant="secondary" className="ml-1.5">
        {openCount}
      </Badge>
    ) : null;

  return (
    <div className="relative flex h-screen">
      <div className="min-w-0 flex-1">
        <EmailEditor
          docId={docId}
          onReady={(api) => (editorApi.current = api)}
          onSelectTarget={setCommentTarget}
          onOpenComments={openComments}
        />
      </div>

      {/* The panel stays mounted (w-0 when collapsed) — chat state survives. */}
      <aside
        className={cn(
          "flex shrink-0 flex-col border-l border-border bg-surface transition-[width] duration-200",
          "max-lg:absolute max-lg:top-0 max-lg:right-0 max-lg:z-30 max-lg:h-full max-lg:shadow-xl",
          collapsed ? "w-0 overflow-hidden border-l-0" : "w-[380px]",
        )}
      >
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "chat" | "comments")}
          className="flex h-full min-w-[380px] flex-col gap-0"
        >
          <div className="flex items-center border-b border-border">
            <TabsList className="flex-1 justify-start rounded-none bg-transparent p-0">
              <TabsTrigger value="chat" className="flex-1">
                Agent
              </TabsTrigger>
              <TabsTrigger value="comments" className="flex-1">
                Comments
                {badge}
              </TabsTrigger>
            </TabsList>
            <Button
              variant="ghost"
              size="icon"
              className="mr-1 shrink-0"
              onClick={() => setCollapsed(true)}
              title="Collapse panel"
            >
              <PanelRightClose />
            </Button>
          </div>
          <TabsContent
            value="chat"
            forceMount
            className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden"
          >
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
          </TabsContent>
          <TabsContent
            value="comments"
            forceMount
            className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden"
          >
            <CommentsPanel
              docId={docId}
              target={commentTarget}
              refreshSignal={commentsRefresh}
              onOpenCountChange={setOpenCount}
            />
          </TabsContent>
        </Tabs>
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
  );
}
