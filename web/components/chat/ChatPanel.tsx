"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type ToolUIPart } from "ai";
import { useEffect, useRef, useState } from "react";

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

// Narzędzia, które zmieniają dokument lub komentarze — po każdym z nich
// odświeżamy podgląd/panel na żywo, nie czekając na koniec tury agenta.
const MUTATING_TOOLS = new Set([
  "set_document",
  "set_section",
  "insert_section",
  "remove_section",
  "resolve_comment",
]);

type Props = {
  docId: string;
  /** Zrzut niesapisanych zmian edytora przed startem agenta. */
  onBeforeSend: () => Promise<void>;
  /** Po zakończeniu tury agenta (odśwież edytor i komentarze). */
  onAgentFinish: () => void;
  /** Po każdej pojedynczej edycji agenta (mutujący tool-call) — reload na żywo. */
  onLiveUpdate: () => void;
};

export default function ChatPanel({ docId, onBeforeSend, onAgentFinish, onLiveUpdate }: Props) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({
      api: `${process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:8000"}/api/chat`,
      body: { docId },
    }),
    onFinish: onAgentFinish,
    onError: (e) => console.error("chat error:", e),
  });

  // Odświeżanie live: gdy mutujący tool-call osiągnie stan "output-available",
  // wołamy onLiveUpdate raz na dany tool-call (dedup po kluczu wiadomość:część).
  const firedTools = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      message.parts.forEach((part, i) => {
        if (!part.type.startsWith("tool-")) return;
        const tool = part as ToolUIPart;
        if (tool.state !== "output-available") return;
        const name = tool.type.slice(5);
        if (!MUTATING_TOOLS.has(name)) return;
        const key = `${message.id}:${i}`;
        if (firedTools.current.has(key)) return;
        firedTools.current.add(key);
        onLiveUpdate();
      });
    }
  }, [messages, onLiveUpdate]);

  const busy = status === "submitted" || status === "streaming";

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    await onBeforeSend().catch(console.error);
    void sendMessage({ text: trimmed });
    setInput("");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="text-sm text-zinc-500">
            Opisz maila (cel, ton, treść) i wklej dane — np. listę produktów w
            JSON. Agent zaprojektuje sekcje i obrazy.
          </p>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === "user"
                ? "ml-6 rounded-lg bg-blue-600 p-2 text-sm text-white"
                : "mr-2 space-y-1 rounded-lg bg-zinc-100 p-2 text-sm text-zinc-900"
            }
          >
            {message.parts.map((part, i) => {
              if (part.type === "text") {
                return (
                  <p key={i} className="whitespace-pre-wrap">
                    {part.text}
                  </p>
                );
              }
              if (part.type.startsWith("tool-")) {
                const tool = part as ToolUIPart;
                const name = tool.type.slice(5);
                const done = tool.state === "output-available";
                const failed = tool.state === "output-error";
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600"
                  >
                    <span>{failed ? "⚠️" : done ? "✅" : "⏳"}</span>
                    <span>{TOOL_LABELS[name] ?? name}</span>
                    {failed && <span className="text-red-600">{String(tool.errorText ?? "")}</span>}
                  </div>
                );
              }
              return null;
            })}
          </div>
        ))}
        {busy && <p className="text-xs text-zinc-400">Agent pracuje…</p>}
      </div>

      <div className="border-t border-zinc-200 p-3">
        <button
          className="mb-2 w-full rounded bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
          disabled={busy}
          onClick={() => void send(APPLY_COMMENTS_PROMPT)}
        >
          Wprowadź zmiany z komentarzy
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <textarea
            className="h-24 w-full resize-none rounded border border-zinc-300 p-2 text-sm"
            placeholder="Napisz do agenta… (Enter = wyślij, Shift+Enter = nowa linia)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
          />
          <div className="mt-1 flex justify-end gap-2">
            {busy && (
              <button
                type="button"
                onClick={() => void stop()}
                className="rounded border border-zinc-300 px-3 py-1 text-sm"
              >
                Stop
              </button>
            )}
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
            >
              Wyślij
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
