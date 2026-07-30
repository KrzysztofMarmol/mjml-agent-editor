/**
 * The agent endpoint.
 *
 * `createChatHandler` returns a plain `(Request) => Promise<Response>`, which is exactly
 * Next.js's route handler shape, so wiring it up is one line. Until this app absorbed the
 * frontend the agent ran as a separate process on its own port, which meant CORS
 * configuration, a second deployment target, and — on Vercel — a 120 s ceiling on proxied
 * requests that a long agent turn can exceed. Same-origin removes all three.
 */

import { createChatHandler, resolveModelFromEnv } from "@mjml-agent-editor/agent-node";
import {
  createCommentStore,
  createDocumentStore,
  createPlaceholderImageProvider,
  createSupabaseClient,
} from "@mjml-agent-editor/store-supabase";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required environment variable ${name}`);
  return value;
}

/**
 * Built once per server instance rather than per request. The service-role key never
 * reaches the browser — this module only ever runs on the server.
 */
const supabase = createSupabaseClient(
  required("SUPABASE_URL"),
  required("SUPABASE_SERVICE_ROLE_KEY"),
);

/**
 * `AGENT_PROVIDER` picks the backend — Anthropic by default, DeepSeek or Gemini for a
 * demo that has to cost nothing. Resolved once at module scope, so a misconfigured
 * deployment fails at boot rather than on the first visitor's message.
 */
const handleChat = createChatHandler({
  model: resolveModelFromEnv(process.env),
  documents: createDocumentStore(supabase),
  comments: createCommentStore(supabase),
  images: createPlaceholderImageProvider(),
});

export const POST = handleChat;

// The agent streams for as long as a turn takes; the default serverless ceiling is far
// shorter than a multi-tool turn.
export const maxDuration = 300;
