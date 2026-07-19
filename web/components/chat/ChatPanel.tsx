"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type ToolUIPart } from "ai";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  Loader2,
  TriangleAlert,
  Send,
  Square,
  Sparkles,
  MessageSquare,
  ChevronRight,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Message, MessageContent } from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Markdown } from "@/components/chat/Markdown";
import { Marker, MarkerIcon, MarkerContent } from "@/components/ui/marker";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from "@/components/ui/message-scroller";

const TOOL_LABELS: Record<string, string> = {
  get_document: "Reading document",
  get_section: "Reading section",
  set_document: "Saving whole email",
  set_section: "Replacing section",
  insert_section: "Adding section",
  remove_section: "Removing section",
  generate_image: "Generating image",
  list_open_comments: "Reading comments",
  resolve_comment: "Resolving comment",
};

const APPLY_COMMENTS_PROMPT =
  "Apply changes based on all open section comments. " +
  "After each successful change mark the comment as resolved and summarize what you changed.";

// Tools that mutate the document or comments — after each of them we refresh
// the preview/panel live, without waiting for the agent's turn to finish.
const MUTATING_TOOLS = new Set([
  "set_document",
  "set_section",
  "insert_section",
  "remove_section",
  "resolve_comment",
]);

// Tools that edit a specific section → name of the argument holding its section_id.
// Used to highlight that section while it is being edited.
const SECTION_ARG: Record<string, string> = {
  set_section: "section_id",
  remove_section: "section_id",
  insert_section: "after_section_id",
};

type Props = {
  docId: string;
  /** Flushes unsaved editor changes before the agent starts. */
  onBeforeSend: () => Promise<void>;
  /** After the agent's turn finishes (refresh the editor and comments). */
  onAgentFinish: () => void;
  /** After each single agent edit (mutating tool call) — live reload. */
  onLiveUpdate: () => void;
  /** Agent started editing a section (highlight it). */
  onSectionEditStart: (sectionId: string) => void;
  /** Agent finished editing a section (remove the highlight). */
  onSectionEditEnd: (sectionId: string) => void;
};

function ToolMarker({ tool }: { tool: ToolUIPart }) {
  const name = tool.type.slice(5);
  const done = tool.state === "output-available";
  const failed = tool.state === "output-error";
  return (
    <Marker className={cn(failed ? "text-destructive" : done ? "" : "text-foreground")}>
      <MarkerIcon>
        {failed ? (
          <TriangleAlert />
        ) : done ? (
          <Check className="text-emerald-600" />
        ) : (
          <Loader2 className="animate-spin" />
        )}
      </MarkerIcon>
      <MarkerContent>
        {TOOL_LABELS[name] ?? name}
        {failed && tool.errorText ? `: ${tool.errorText}` : ""}
      </MarkerContent>
    </Marker>
  );
}

// "Agent is working…" indicator — rendered either inside the current assistant
// message (tight under the steps) or standalone when the assistant hasn't started writing yet.
function BusyMarker() {
  return (
    <Marker className="text-foreground">
      <MarkerIcon>
        <Loader2 className="animate-spin" />
      </MarkerIcon>
      <MarkerContent>Agent is working…</MarkerContent>
    </Marker>
  );
}

// Tool activity: in-progress tasks visible; finished and failed ones collapsed underneath.
function ToolActivity({ tools }: { tools: ToolUIPart[] }) {
  const running = tools.filter(
    (t) => t.state !== "output-available" && t.state !== "output-error",
  );
  const finished = tools.filter(
    (t) => t.state === "output-available" || t.state === "output-error",
  );
  const failedCount = finished.filter((t) => t.state === "output-error").length;

  return (
    <div className="space-y-1">
      {finished.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="group/col flex w-full items-center gap-1.5 text-left text-xs text-muted-foreground hover:text-foreground">
            <ChevronRight className="size-3.5 shrink-0 transition-transform group-data-[state=open]/col:rotate-90" />
            <span>
              {failedCount > 0
                ? `Finished steps (${finished.length}, ${failedCount} failed)`
                : `Finished steps (${finished.length})`}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 space-y-0.5 border-l border-border pl-3">
            {finished.map((t, i) => (
              <ToolMarker key={`f${i}`} tool={t} />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
      {running.map((t, i) => (
        <ToolMarker key={`r${i}`} tool={t} />
      ))}
    </div>
  );
}

export default function ChatPanel({
  docId,
  onBeforeSend,
  onAgentFinish,
  onLiveUpdate,
  onSectionEditStart,
  onSectionEditEnd,
}: Props) {
  const [input, setInput] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const { messages, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({
      api: `${process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:8000"}/api/chat`,
      body: { docId },
    }),
    onFinish: onAgentFinish,
    onError: (e) => {
      console.error("chat error:", e);
      toast.error("Agent chat error.");
    },
  });

  // Reactions to the agent's tool calls (deduped by message:part key):
  //  - section edit started (section_id known, tool not finished yet) → highlight
  //  - mutating tool call finished → live-reload the preview + remove the highlight
  const firedTools = useRef<Set<string>>(new Set());
  const highlightStarted = useRef<Map<string, string>>(new Map());
  const highlightEnded = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      message.parts.forEach((part, i) => {
        if (!part.type.startsWith("tool-")) return;
        const tool = part as ToolUIPart;
        const name = tool.type.slice(5);
        const key = `${message.id}:${i}`;
        const done = tool.state === "output-available" || tool.state === "output-error";

        // start the highlight — when we know the section_id and the tool is still running
        const argName = SECTION_ARG[name];
        if (argName && !done && !highlightStarted.current.has(key)) {
          const sid = (tool.input as Record<string, unknown> | undefined)?.[argName];
          if (typeof sid === "string" && sid) {
            highlightStarted.current.set(key, sid);
            onSectionEditStart(sid);
          }
        }

        if (!done) return;

        // remove the section highlight (before the reload, which rebuilds the canvas anyway)
        const startedSid = highlightStarted.current.get(key);
        if (startedSid && !highlightEnded.current.has(key)) {
          highlightEnded.current.add(key);
          onSectionEditEnd(startedSid);
        }
        // mutating tool call finished → live reload
        if (MUTATING_TOOLS.has(name) && !firedTools.current.has(key)) {
          firedTools.current.add(key);
          onLiveUpdate();
        }
      });
    }
  }, [messages, onLiveUpdate, onSectionEditStart, onSectionEditEnd]);

  const busy = status === "submitted" || status === "streaming";

  // Whether any tool is in progress (to avoid duplicating the global "Agent is working…").
  const lastMsg = messages[messages.length - 1];
  const toolRunning =
    lastMsg?.role === "assistant" &&
    lastMsg.parts.some((p) => {
      if (!p.type.startsWith("tool-")) return false;
      const s = (p as ToolUIPart).state;
      return s !== "output-available" && s !== "output-error";
    });

  const grow = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    await onBeforeSend().catch(console.error);
    void sendMessage({ text: trimmed });
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
  };

  return (
    <div className="flex h-full flex-col">
      <MessageScrollerProvider autoScroll>
        <MessageScroller className="flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="p-3">
              {messages.length === 0 ? (
                <Empty className="h-full">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <MessageSquare />
                    </EmptyMedia>
                    <EmptyTitle>Start a conversation with the agent</EmptyTitle>
                    <EmptyDescription>
                      Describe the email (goal, tone, content) and paste your data —
                      the agent will design the sections and images.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                messages.map((message, mi) => {
                  const isUser = message.role === "user";
                  const isLast = mi === messages.length - 1;
                  const toolParts = message.parts.filter((p) =>
                    p.type.startsWith("tool-"),
                  ) as ToolUIPart[];
                  // Skip empty text parts — while streaming, the SDK appends an
                  // empty text part that used to render as an empty bubble
                  // (an unwanted gap above "Agent is working…").
                  const textParts = message.parts.filter(
                    (p) => p.type === "text" && p.text.trim() !== "",
                  );
                  return (
                    <MessageScrollerItem key={message.id} messageId={message.id}>
                      <Message align={isUser ? "end" : "start"}>
                        <MessageContent>
                          {toolParts.length > 0 && <ToolActivity tools={toolParts} />}
                          {textParts.map((part, i) => (
                            <Bubble
                              key={i}
                              variant={isUser ? "default" : "muted"}
                              align={isUser ? "end" : "start"}
                            >
                              <BubbleContent
                                className={isUser ? "whitespace-pre-wrap" : undefined}
                              >
                                {isUser && part.type === "text" ? (
                                  part.text
                                ) : part.type === "text" ? (
                                  <Markdown>{part.text}</Markdown>
                                ) : null}
                              </BubbleContent>
                            </Bubble>
                          ))}
                          {/* Busy indicator as part of the assistant's current turn —
                              tight spacing (gap-2.5). Hidden once text is already
                              streaming (textParts not empty) — keeps things clean. */}
                          {isLast &&
                            !isUser &&
                            busy &&
                            !toolRunning &&
                            textParts.length === 0 && <BusyMarker />}
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  );
                })
              )}
              {/* Fallback: the agent hasn't created a message yet (last one is the user's). */}
              {busy && !toolRunning && lastMsg?.role !== "assistant" && <BusyMarker />}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton direction="end" />
        </MessageScroller>
      </MessageScrollerProvider>

      <div className="border-t border-border p-3">
        <Button
          variant="secondary"
          className="mb-2 w-full"
          disabled={busy}
          onClick={() => void send(APPLY_COMMENTS_PROMPT)}
        >
          <Sparkles /> Apply changes from comments
        </Button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <Textarea
            ref={taRef}
            rows={2}
            className="max-h-40 min-h-14 resize-none"
            placeholder="Message the agent… (Enter = send, Shift+Enter = new line)"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              grow();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
          />
          <div className="mt-2 flex justify-end gap-2">
            {busy && (
              <Button type="button" variant="outline" size="sm" onClick={() => void stop()}>
                <Square /> Stop
              </Button>
            )}
            <Button type="submit" size="sm" disabled={busy || !input.trim()}>
              <Send /> Send
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
