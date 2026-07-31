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
  stepCountIs,
  streamText,
  type LanguageModel,
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
}

/** Request body the frontend sends. Matches the spike's `ChatRequest`. */
export interface ChatRequestBody {
  readonly messages: UIMessage[];
  readonly docId: string;
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
 * Authorization is intentionally not handled here. `docId` arrives from the client, so
 * a host that serves more than one user must pass stores that are already scoped —
 * e.g. a `DocumentStore` bound to the caller's session that rejects foreign ids. The
 * spike had no such scoping at all, which is how any visitor could read and delete any
 * document.
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

    const result = streamText({
      model: options.model,
      system,
      // Async in AI SDK v6 — it may need to fetch file/image parts referenced by URL.
      messages: await convertToModelMessages(body.messages),
      tools: createAgentTools({
        documentId: body.docId,
        documents: options.documents,
        comments: options.comments,
        images: options.images,
        compiler,
      }),
      stopWhen: stepCountIs(maxSteps),
    });

    return result.toUIMessageStreamResponse({
      onError: (error) => formatError(error),
    });
  };
}
