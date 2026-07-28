/**
 * Development server exposing the TypeScript agent on the same endpoint the spike's
 * FastAPI service used, so the existing frontend can talk to it without any change.
 *
 * This is a standalone server only because `web/` has not been folded into the
 * monorepo yet. Once it becomes a Next.js app, `createChatHandler` moves into a route
 * handler and this file goes away — the handler is already a plain
 * `(Request) => Promise<Response>` for exactly that reason.
 *
 * CORS lives here rather than in the handler: it is a property of running the agent on
 * a separate origin during development, not of the agent itself.
 */

import { createServer } from "node:http";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createChatHandler } from "@mjml-agent-editor/agent-node";
import { config } from "dotenv";

import {
  createCommentStore,
  createDocumentStore,
  createPlaceholderImageProvider,
  createSupabaseClient,
} from "./supabase-adapters.js";

config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required environment variable ${name}`);
  return value;
}

const PORT = Number(process.env["PORT"] ?? 8000);
const ALLOWED_ORIGIN = process.env["ALLOWED_ORIGIN"] ?? "http://localhost:3000";
const MODEL_ID = process.env["AGENT_MODEL"] ?? "claude-haiku-4-5";

const supabase = createSupabaseClient(
  required("SUPABASE_URL"),
  required("SUPABASE_SERVICE_ROLE_KEY"),
);

const anthropic = createAnthropic({ apiKey: required("ANTHROPIC_API_KEY") });

const handleChat = createChatHandler({
  model: anthropic(MODEL_ID),
  documents: createDocumentStore(supabase),
  comments: createCommentStore(supabase),
  images: createPlaceholderImageProvider(),
});

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": ALLOWED_ORIGIN,
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

/** Bridges Node's IncomingMessage/ServerResponse to the WHATWG Request/Response pair. */
const server = createServer((incoming, outgoing) => {
  void (async () => {
    const url = new URL(incoming.url ?? "/", `http://${incoming.headers.host ?? "localhost"}`);

    if (incoming.method === "OPTIONS") {
      outgoing.writeHead(204, CORS_HEADERS).end();
      return;
    }

    if (url.pathname === "/api/health") {
      outgoing.writeHead(200, { "content-type": "application/json", ...CORS_HEADERS });
      outgoing.end(JSON.stringify({ status: "ok", model: MODEL_ID }));
      return;
    }

    if (url.pathname !== "/api/chat" || incoming.method !== "POST") {
      outgoing.writeHead(404, CORS_HEADERS).end();
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(chunk as Buffer);

    const response = withCors(
      await handleChat(
        new Request(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: Buffer.concat(chunks).toString("utf8"),
        }),
      ),
    );

    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        outgoing.write(chunk);
      }
    }
    outgoing.end();
  })().catch((error: unknown) => {
    console.error("[server]", error);
    if (!outgoing.headersSent) outgoing.writeHead(500, CORS_HEADERS);
    outgoing.end();
  });
});

server.listen(PORT, () => {
  console.log(`agent listening on http://localhost:${PORT} (model: ${MODEL_ID})`);
});
