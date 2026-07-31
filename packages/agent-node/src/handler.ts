/**
 * The `/api/chat` route handler, ported from the spike's `agent/main.py`.
 *
 * Speaks the UI Message Stream protocol that `ChatPanel`'s `useChat` already expects,
 * so the frontend needs no change to switch backends.
 *
 * Two things the FastAPI version needed and this one does not: a CORS middleware
 * pinned to `http://localhost:3000` (this runs same-origin inside the host app), and
 * a hand-rolled catch that emitted a synthetic error event because an exception
 * mid-stream truncated the chunked response and the browser only saw "network error".
 * The SDK's `onError` puts the failure into the stream as a first-class part instead.
 */

import type {
  CommentStore,
  DocumentStore,
  ImageProvider,
  MjmlCompiler,
} from "@mjml-agent-editor/core";
import {
  convertToModelMessages,
  generateId,
  stepCountIs,
  streamText,
  type LanguageModel,
  type LanguageModelUsage,
  type UIMessage,
} from "ai";

import { createMjmlCompiler } from "./mjml-compiler.js";
import { buildSystemPrompt, type SystemPromptOptions } from "./system-prompt.js";
import { createAgentTools } from "./tools.js";

/**
 * Ceiling on tool-call rounds in a single turn. The spike had none, so a confused
 * model could loop until the provider cut it off — and every round re-sends the whole
 * conversation, so the cost of a runaway turn grows quadratically.
 */
const DEFAULT_MAX_STEPS = 24;

/**
 * Server-side conversation storage.
 *
 * Deliberately not in `@mjml-agent-editor/core` alongside the other ports: `UIMessage`
 * is an AI SDK type, and that package stays free of the SDK so the Python backend's
 * contract has nothing framework-shaped in it.
 */
export interface ChatSession {
  /** Prior turns for this document, oldest first. */
  load(docId: string): Promise<UIMessage[]>;
  /** The whole conversation after this turn, including the assistant's reply. */
  save(docId: string, messages: UIMessage[]): Promise<void>;
}

/**
 * What one completed turn consumed.
 *
 * A turn is a whole tool-calling loop, not one model call, so these are totals across
 * every step — which is the number that matters for a budget, since the interesting cost
 * is a turn that took twenty rounds rather than one.
 */
export interface TurnUsage {
  /** The document the turn was about, so a ledger row can point at something. */
  readonly documentId: string;
  readonly modelId: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  readonly totalTokens: number;
  /** The SDK's own usage object, for anything the fields above flatten away. */
  readonly raw: LanguageModelUsage;
}

export interface ChatHandlerOptions extends SystemPromptOptions {
  readonly model: LanguageModel;
  readonly documents: DocumentStore;
  readonly comments: CommentStore;
  readonly images: ImageProvider;
  /** Defaults to the Node `mjml` compiler in strict mode. */
  readonly compiler?: MjmlCompiler;
  readonly maxSteps?: number;
  /** Maps a thrown error to the text shown in the chat panel. */
  readonly formatError?: (error: unknown) => string;
  /**
   * Runs before anything is sent to the model. Returning a `Response` stops the request
   * there — this is where a rate limit, a spend ceiling or a read-only switch belongs,
   * because every one of those has to decide *before* the expensive part happens.
   *
   * Returning nothing lets the request through.
   */
  readonly authorize?: (
    request: Request,
    body: ChatRequestBody,
  ) => Promise<Response | undefined | void> | Response | undefined | void;
  /**
   * When present, the conversation becomes server-authoritative: only the newest user
   * message is taken from the request and everything before it is loaded from here.
   *
   * Without it the client sends the entire history on every turn, which means a reload
   * loses the conversation, the token bill grows with the square of its length, and
   * anyone can put words in the assistant's mouth by editing the request body. That is
   * acceptable for a local example and not for anything reachable from the internet.
   */
  readonly session?: ChatSession;
  /**
   * Called once per completed turn with what it consumed. This is the other half of
   * `authorize`: the guard decides whether a turn may start, and this is where the number
   * it will decide on next time comes from.
   *
   * A rejection here is logged and swallowed. The turn has already happened and its
   * result is already streaming, so failing the response would lose work the user is
   * watching arrive — but a persistent failure means a spend ledger that undercounts, so
   * treat errors from it as something to alert on rather than something benign.
   */
  readonly onUsage?: (usage: TurnUsage) => void | Promise<void>;
}

/** Request body the frontend sends. Matches the spike's `ChatRequest`. */
export interface ChatRequestBody {
  readonly messages: UIMessage[];
  readonly docId: string;
}

/**
 * The newest user message — the only part of a client-sent history that is trustworthy,
 * because it is the only part the client is entitled to author.
 */
function newestUserMessage(messages: UIMessage[]): UIMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === "user") return message;
  }
  return undefined;
}

function defaultFormatError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/rate.?limit|\b429\b/i.test(message)) {
    return "Rate limit reached (429) — wait a moment and try again.";
  }
  if (/authentication|\b401\b/i.test(message)) {
    return "Authentication failed (401) — the API key was not accepted.";
  }
  return `Agent error: ${message.slice(0, 300)}`;
}

/**
 * Builds a `(Request) => Promise<Response>` suitable for a Next.js route handler.
 *
 * Row-level authorization is intentionally not handled here. `docId` arrives from the
 * client, so a host that serves more than one user must pass stores that are already
 * scoped — e.g. a `DocumentStore` bound to the caller's session that rejects foreign
 * ids. The spike had no such scoping at all, which is how any visitor could read and
 * delete any document.
 *
 * What `authorize` covers is the other half: decisions about the request as a whole
 * (rate limit, spend ceiling, read-only mode) that have to be made before the model is
 * called, not per row.
 */
export function createChatHandler(options: ChatHandlerOptions) {
  const compiler = options.compiler ?? createMjmlCompiler();
  const system = buildSystemPrompt(options);
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const formatError = options.formatError ?? defaultFormatError;

  return async function handleChat(request: Request): Promise<Response> {
    let body: ChatRequestBody;
    try {
      body = (await request.json()) as ChatRequestBody;
    } catch {
      return Response.json({ error: "invalid JSON body" }, { status: 400 });
    }

    if (typeof body.docId !== "string" || body.docId.length === 0) {
      return Response.json({ error: "`docId` is required" }, { status: 400 });
    }
    if (!Array.isArray(body.messages)) {
      return Response.json({ error: "`messages` is required" }, { status: 400 });
    }

    if (options.authorize) {
      const rejection = await options.authorize(request, body);
      if (rejection) return rejection;
    }

    let conversation = body.messages;
    if (options.session) {
      const latest = newestUserMessage(body.messages);
      if (!latest) {
        return Response.json({ error: "no user message in `messages`" }, { status: 400 });
      }
      conversation = [...(await options.session.load(body.docId)), latest];
    }

    const result = streamText({
      model: options.model,
      system,
      // Async in AI SDK v6 — it may need to fetch file/image parts referenced by URL.
      messages: await convertToModelMessages(conversation),
      tools: createAgentTools({
        documentId: body.docId,
        documents: options.documents,
        comments: options.comments,
        images: options.images,
        compiler,
      }),
      stopWhen: stepCountIs(maxSteps),
      ...(options.onUsage
        ? {
            onFinish: async ({ usage }) => {
              try {
                await options.onUsage?.({
                  documentId: body.docId,
                  modelId:
                    typeof options.model === "string" ? options.model : options.model.modelId,
                  // Every field is optional on the SDK type — a provider that reports no
                  // usage produces zeros rather than NaN in someone's ledger.
                  inputTokens: usage.inputTokens ?? 0,
                  outputTokens: usage.outputTokens ?? 0,
                  cachedInputTokens: usage.cachedInputTokens ?? 0,
                  totalTokens: usage.totalTokens ?? 0,
                  raw: usage,
                });
              } catch (error) {
                console.error("onUsage failed", error);
              }
            },
          }
        : {}),
    });

    const session = options.session;
    return result.toUIMessageStreamResponse({
      onError: (error) => formatError(error),
      // `originalMessages` is what puts the SDK into persistence mode: it gives the
      // response message an id and hands `onFinish` the whole updated conversation
      // rather than just the new part.
      ...(session
        ? {
            originalMessages: conversation,
            // Without this the assistant's message is stored with no id. The SDK only
            // assigns one when `originalMessages` is given *and* the last of them is
            // already an assistant message — which it never is here, because the turn
            // starts from the user. Every stored reply then shares the same absent id, and
            // a UI that keys by it collides: React reports "two children with the same
            // key" and may drop or duplicate messages. Silent, and only visible after a
            // reload.
            generateMessageId: generateId,
            onFinish: ({ messages }) => session.save(body.docId, messages),
          }
        : {}),
    });
  };
}
