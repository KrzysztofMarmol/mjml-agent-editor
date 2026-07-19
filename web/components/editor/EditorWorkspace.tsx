"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";

import { cn } from "@/lib/utils";
import ChatPanel from "@/components/chat/ChatPanel";
import CommentsPanel from "@/components/comments/CommentsPanel";
import type { EditorApi } from "@/components/editor/EmailEditor";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// GrapesJS dotyka window przy imporcie — tylko po stronie klienta.
const EmailEditor = dynamic(() => import("@/components/editor/EmailEditor"), { ssr: false });

export default function EditorWorkspace({ docId }: { docId: string }) {
  const editorApi = useRef<EditorApi | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [commentsRefresh, setCommentsRefresh] = useState(0);
  const [tab, setTab] = useState<"chat" | "comments">("chat");
  const [openCount, setOpenCount] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const openSectionIdsRef = useRef<string[]>([]);

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
          onReady={(api) => {
            editorApi.current = api;
            api.setCommentedSections(openSectionIdsRef.current);
          }}
          onSelectSection={setSelectedSectionId}
          onOpenComments={openComments}
        />
      </div>

      {/* Panel zostaje zamontowany (w-0 przy zwinięciu) — stan czatu przetrwa. */}
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
                Komentarze
                {badge}
              </TabsTrigger>
            </TabsList>
            <Button
              variant="ghost"
              size="icon"
              className="mr-1 shrink-0"
              onClick={() => setCollapsed(true)}
              title="Zwiń panel"
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
              onAgentFinish={onAgentFinish}
            />
          </TabsContent>
          <TabsContent
            value="comments"
            forceMount
            className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden"
          >
            <CommentsPanel
              docId={docId}
              selectedSectionId={selectedSectionId}
              refreshSignal={commentsRefresh}
              onNavigate={(id) => editorApi.current?.selectSection(id)}
              onOpenChange={onOpenChange}
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
          title="Rozwiń panel"
        >
          <PanelRightOpen />
        </Button>
      )}
    </div>
  );
}
