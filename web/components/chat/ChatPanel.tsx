"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type ToolUIPart } from "ai";
import { useRef, useState } from "react";
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
  get_document: "Czytam dokument",
  get_section: "Czytam sekcję",
  set_document: "Zapisuję cały mail",
  set_section: "Podmieniam sekcję",
  insert_section: "Dodaję sekcję",
  remove_section: "Usuwam sekcję",
  generate_image: "Generuję obraz",
  list_open_comments: "Czytam komentarze",
  resolve_comment: "Zamykam komentarz",
};

const APPLY_COMMENTS_PROMPT =
  "Wprowadź zmiany na podstawie wszystkich otwartych komentarzy do sekcji. " +
  "Po każdej udanej zmianie oznacz komentarz jako rozwiązany i podsumuj, co zmieniłeś.";

type Props = {
  docId: string;
  /** Zrzut niesapisanych zmian edytora przed startem agenta. */
  onBeforeSend: () => Promise<void>;
  /** Po zakończeniu tury agenta (odśwież edytor i komentarze). */
  onAgentFinish: () => void;
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

// Aktywność narzędzi: taski w toku widoczne; zakończone i błędne zwinięte pod spód.
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
                ? `Zakończone kroki (${finished.length}, ${failedCount} błąd)`
                : `Zakończone kroki (${finished.length})`}
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

export default function ChatPanel({ docId, onBeforeSend, onAgentFinish }: Props) {
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
      toast.error("Błąd czatu z agentem.");
    },
  });

  const busy = status === "submitted" || status === "streaming";

  // Czy jakieś narzędzie jest w toku (żeby nie dublować globalnego „Agent pracuje…").
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
                    <EmptyTitle>Zacznij rozmowę z agentem</EmptyTitle>
                    <EmptyDescription>
                      Opisz maila (cel, ton, treść) i wklej dane — agent zaprojektuje
                      sekcje i obrazy.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                messages.map((message) => {
                  const isUser = message.role === "user";
                  const toolParts = message.parts.filter((p) =>
                    p.type.startsWith("tool-"),
                  ) as ToolUIPart[];
                  const textParts = message.parts.filter((p) => p.type === "text");
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
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  );
                })
              )}
              {busy && !toolRunning && (
                <Marker className="text-foreground">
                  <MarkerIcon>
                    <Loader2 className="animate-spin" />
                  </MarkerIcon>
                  <MarkerContent>Agent pracuje…</MarkerContent>
                </Marker>
              )}
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
          <Sparkles /> Wprowadź zmiany z komentarzy
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
            placeholder="Napisz do agenta… (Enter = wyślij, Shift+Enter = nowa linia)"
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
              <Send /> Wyślij
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
