"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type ChatTransport, type ToolUIPart, type UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Brain,
  Check,
  Loader2,
  TriangleAlert,
  Send,
  Square,
  Sparkles,
  MessageSquare,
  ChevronRight,
} from "lucide-react";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "../ui/empty";
import { Message, MessageContent } from "../ui/message";
import { Bubble, BubbleContent } from "../ui/bubble";
import { Markdown } from "../chat/Markdown.js";
import { Marker, MarkerIcon, MarkerContent } from "../ui/marker";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "../ui/collapsible";
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from "../ui/message-scroller";

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

/**
 * One rendered unit of a message, in the order it happened.
 *
 * A multi-step turn interleaves narration and tool calls — "I'll check the document",
 * `get_document`, "now I'll write the hero", `set_section`. `message.parts` records that
 * order faithfully; this preserves it.
 *
 * The panel used to filter the same array twice, once for tools and once for text, and
 * render the two results as separate blocks. Every tool call therefore appeared above every
 * sentence, so a reader saw "Saving whole email" before the sentence that preceded it by
 * three steps — effects before their causes, in a product whose whole promise is watching
 * the agent work. With one text part and a couple of tools that reads as a deliberate
 * summary, which is why it survived this long.
 */
type MessageBlock =
  | { readonly kind: "tools"; readonly tools: ToolUIPart[] }
  | { readonly kind: "text"; readonly text: string; readonly narration: boolean }
  | { readonly kind: "reasoning"; readonly text: string };

/**
 * Groups a message's parts into consecutive runs.
 *
 * Adjacent tool calls collapse into one activity block — a turn that generates three images
 * back to back should not produce three boxes — but a run that is interrupted by text
 * starts a new one, which is what restores the sequence.
 *
 * Reasoning parts were previously dropped on the floor. No model in the template's default
 * configuration emits them, so nothing was visibly wrong; point the host at a reasoning
 * model and half of every answer would vanish with no error. Silence is the worst way for a
 * UI to be wrong.
 *
 * Text is also marked narration or answer. The SDK offers nothing to distinguish them —
 * `TextUIPart` carries `state?: "streaming" | "done"`, which is a lifecycle and not a role,
 * and `step-start` is a marker with no fields — but the structure decides it: a sentence with
 * another tool call after it was introducing that call, and the last one is the reply. Four
 * identical bubbles per turn buried the answer among the commentary.
 */
function toBlocks(parts: UIMessage["parts"]): MessageBlock[] {
  const blocks: MessageBlock[] = [];

  for (const part of parts) {
    if (part.type.startsWith("tool-")) {
      const last = blocks[blocks.length - 1];
      if (last?.kind === "tools") last.tools.push(part as ToolUIPart);
      else blocks.push({ kind: "tools", tools: [part as ToolUIPart] });
      continue;
    }

    if (part.type === "reasoning") {
      const text = part.text;
      if (!text.trim()) continue;
      const last = blocks[blocks.length - 1];
      if (last?.kind === "reasoning")
        blocks[blocks.length - 1] = { kind: "reasoning", text: `${last.text}${text}` };
      else blocks.push({ kind: "reasoning", text });
      continue;
    }

    if (part.type === "text") {
      // While streaming, the SDK appends an empty text part; rendering it produced an empty
      // bubble above "Agent is working…".
      if (!part.text.trim()) continue;
      blocks.push({ kind: "text", text: part.text, narration: false });
    }
  }

  // One backward pass: everything before the last tool call was leading up to it.
  let seenTools = false;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]!;
    if (block.kind === "tools") seenTools = true;
    else if (block.kind === "text" && seenTools) {
      blocks[i] = { kind: "text", text: block.text, narration: true };
    }
  }

  return blocks;
}

type Props = {
  docId: string;
  /**
   * Conversation to start from, oldest first.
   *
   * Only useful to a host that stores the conversation server-side. Without it the panel
   * mounts empty, which is right when the browser is the only place the history ever
   * lived — and wrong, invisibly, when it is not: the agent still receives the stored
   * history on the next turn, so the model remembers a conversation the visitor is
   * looking at an empty panel for.
   */
  initialMessages?: UIMessage[];
  /**
   * Where the panel sends turns. Defaults to `POST /api/chat` in this application.
   *
   * Supplying one replaces the endpoint entirely, which is how a host reaches an agent that
   * is not a same-origin route — and how the scripted demo drives this panel from a
   * recorded transcript without making any request at all.
   *
   * Memoize it. A transport carrying state — a playback position, an open connection —
   * restarts if it is rebuilt on every render.
   */
  transport?: ChatTransport<UIMessage>;
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
    <Marker className={cn(failed ? "text-destructive" : "text-panel-fg")}>
      <MarkerIcon>
        {failed ? (
          <TriangleAlert />
        ) : done ? (
          <Check className="text-emerald-400" />
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
    <Marker className="text-panel-fg">
      <MarkerIcon>
        <Loader2 className="animate-spin" />
      </MarkerIcon>
      <MarkerContent>Agent is working…</MarkerContent>
    </Marker>
  );
}

// Tool activity: in-progress tasks visible; finished and failed ones collapsed underneath.
function ToolActivity({ tools }: { tools: ToolUIPart[] }) {
  const running = tools.filter((t) => t.state !== "output-available" && t.state !== "output-error");
  const finished = tools.filter(
    (t) => t.state === "output-available" || t.state === "output-error",
  );
  const failedCount = finished.filter((t) => t.state === "output-error").length;

  return (
    <div className="space-y-1 rounded-lg border border-panel-border bg-panel-elevated/60 p-2">
      {/* Collapsed by default. Finished steps are history — worth being able to check, not
      worth occupying the panel above every answer. What is still running stays visible
      below, outside this. */}
      {finished.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="group/col flex w-full items-center gap-1.5 text-left text-xs font-medium text-panel-fg hover:text-panel-fg">
            <ChevronRight className="size-3.5 shrink-0 transition-transform group-data-[state=open]/col:rotate-90" />
            <span>
              {failedCount > 0
                ? `Completed steps (${finished.length}, ${failedCount} failed)`
                : `Completed steps (${finished.length})`}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 space-y-0.5 pl-1">
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

/**
 * The model's own reasoning, collapsed.
 *
 * Shown rather than hidden, because a turn that spends thirty seconds thinking and says
 * nothing looks broken. Collapsed rather than expanded, because it is not the answer.
 */
function ReasoningBlock({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-panel-border bg-panel-elevated/60 p-2">
      <Collapsible>
        <CollapsibleTrigger className="group/col flex w-full items-center gap-1.5 text-left text-xs font-medium text-panel-muted-fg hover:text-panel-fg">
          <ChevronRight className="size-3.5 shrink-0 transition-transform group-data-[state=open]/col:rotate-90" />
          <Brain className="size-3.5 shrink-0" />
          <span>Reasoning</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-1.5 pl-1 text-xs whitespace-pre-wrap text-panel-muted-fg">
          {text}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export default function ChatPanel({
  docId,
  initialMessages,
  transport,
  onBeforeSend,
  onAgentFinish,
  onLiveUpdate,
  onSectionEditStart,
  onSectionEditEnd,
}: Props) {
  const [input, setInput] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Per-message timestamp, stamped when the message first renders.
  const times = useRef<Map<string, string>>(new Map());
  const timeFor = (id: string) => {
    if (!times.current.has(id)) {
      times.current.set(
        id,
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      );
    }
    return times.current.get(id)!;
  };
  const { messages, sendMessage, status, stop } = useChat({
    messages: initialMessages,
    transport:
      transport ??
      new DefaultChatTransport({
        // Same-origin: the agent is a route handler in this app, not a separate service.
        api: "/api/chat",
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
                      Describe the email (goal, tone, content) and paste your data — the agent will
                      design the sections and images.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                messages.map((message, mi) => {
                  const isUser = message.role === "user";
                  const isLast = mi === messages.length - 1;
                  const blocks = toBlocks(message.parts);
                  const hasText = blocks.some((block) => block.kind === "text");
                  return (
                    <MessageScrollerItem key={message.id} messageId={message.id}>
                      <div className={cn("flex w-full gap-2", isUser && "flex-row-reverse")}>
                        {!isUser && (
                          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
                            <Sparkles className="size-3.5" />
                          </span>
                        )}
                        <div
                          className={cn(
                            "flex min-w-0 flex-1 flex-col gap-1",
                            isUser ? "items-end" : "items-start",
                          )}
                        >
                          <Message align={isUser ? "end" : "start"}>
                            <MessageContent>
                              {/* In the order they happened, so narration stays attached to
                              the step it introduced. */}
                              {blocks.map((block, i) => {
                                if (block.kind === "tools") {
                                  return <ToolActivity key={i} tools={block.tools} />;
                                }
                                if (block.kind === "reasoning") {
                                  return <ReasoningBlock key={i} text={block.text} />;
                                }
                                // Narration gets no bubble. It is the trail of what the agent
                                // was doing, and giving it the same weight as the reply is
                                // what made the reply hard to find.
                                if (block.narration && !isUser) {
                                  return (
                                    <div
                                      key={i}
                                      data-slot="narration"
                                      className="px-1 text-xs leading-relaxed text-panel-muted-fg [&_a]:text-brand [&_code]:!bg-white/10 [&_p]:my-0.5"
                                    >
                                      <Markdown>{block.text}</Markdown>
                                    </div>
                                  );
                                }
                                return (
                                  <Bubble
                                    key={i}
                                    variant={isUser ? "default" : "muted"}
                                    align={isUser ? "end" : "start"}
                                    className={cn(
                                      isUser
                                        ? "[&_[data-slot=bubble-content]]:bg-brand [&_[data-slot=bubble-content]]:text-brand-fg"
                                        : "[&_[data-slot=bubble-content]]:border [&_[data-slot=bubble-content]]:border-panel-border [&_[data-slot=bubble-content]]:bg-panel-elevated [&_[data-slot=bubble-content]]:text-panel-fg [&_code]:!bg-white/12 [&_pre]:!bg-white/10 [&_a]:text-brand",
                                    )}
                                  >
                                    <BubbleContent
                                      className={isUser ? "whitespace-pre-wrap" : undefined}
                                    >
                                      {isUser ? block.text : <Markdown>{block.text}</Markdown>}
                                    </BubbleContent>
                                  </Bubble>
                                );
                              })}
                              {/* Busy indicator as part of the assistant's current turn —
                              tight spacing (gap-2.5). Hidden once text is already
                              streaming — keeps things clean. */}
                              {isLast && !isUser && busy && !toolRunning && !hasText && (
                                <BusyMarker />
                              )}
                            </MessageContent>
                          </Message>
                          {blocks.length > 0 && (
                            <span className="px-1 text-[10px] text-panel-muted-fg">
                              {timeFor(message.id)}
                            </span>
                          )}
                        </div>
                      </div>
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

      <div className="border-t border-panel-border p-3">
        <Button
          className="mb-2 w-full bg-brand text-brand-fg hover:bg-brand/90"
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
          className="rounded-xl border border-panel-border bg-panel-elevated transition-colors focus-within:border-brand/60"
        >
          <Textarea
            ref={taRef}
            rows={2}
            className="max-h-40 min-h-14 resize-none border-0 bg-transparent px-3 pt-2.5 text-panel-fg shadow-none placeholder:text-panel-muted-fg focus-visible:ring-0"
            placeholder="Describe what you want to change… (Enter = send, Shift+Enter = new line)"
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
          <div className="flex items-center justify-end gap-2 px-2 pb-2">
            {busy && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-panel-border bg-transparent text-panel-fg hover:bg-panel-hover hover:text-panel-fg"
                onClick={() => void stop()}
              >
                <Square /> Stop
              </Button>
            )}
            <Button
              type="submit"
              size="sm"
              disabled={busy || !input.trim()}
              className="bg-brand text-brand-fg hover:bg-brand/90"
            >
              <Send /> Send
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
