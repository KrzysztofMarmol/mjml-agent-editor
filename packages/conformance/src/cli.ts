/**
 * `pnpm test:conformance --url=http://localhost:8001/api/chat`
 *
 * Runs the shared scenarios against a live backend and exits non-zero on failure, so CI can
 * run it against both implementations and fail on divergence.
 */

import { createMjmlCompiler } from "@mjml-agent-editor/agent-node";
import {
  createDocument,
  createDocumentStore,
  createSupabaseClient,
  deleteDocument,
} from "@mjml-agent-editor/store-supabase";
import { config } from "dotenv";

import { runScenarios, type DocumentFixture } from "./runner.js";
import { SCENARIOS } from "./scenarios.js";

config();

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required environment variable ${name}`);
  return value;
}

const url = argument("url") ?? process.env["CONFORMANCE_URL"];
if (!url) {
  console.error("usage: conformance --url=<chat endpoint>   (or set CONFORMANCE_URL)");
  process.exit(2);
}

const supabase = createSupabaseClient(
  required("SUPABASE_URL"),
  required("SUPABASE_SERVICE_ROLE_KEY"),
);
const documents = createDocumentStore(supabase);

const fixture: DocumentFixture = {
  create: (name, mjml) => createDocument(supabase, name, mjml),
  read: async (documentId) => (await documents.get(documentId)).mjml,
  destroy: (documentId) => deleteDocument(supabase, documentId),
};

const label = argument("label") ?? url;
console.log(`conformance: ${label}\n`);

const results = await runScenarios(SCENARIOS, {
  url,
  fixture,
  compiler: createMjmlCompiler(),
});

for (const result of results) {
  const mark = result.passed ? "PASS" : "FAIL";
  const seconds = (result.durationMs / 1000).toFixed(1);
  console.log(`${mark}  ${result.scenario}  (${seconds}s)`);
  console.log(`      tools: ${result.toolCalls.join(" → ") || "(none)"}`);
  for (const failure of result.failures) console.log(`      ✗ ${failure}`);
}

const failed = results.filter((result) => !result.passed);
console.log(`\n${results.length - failed.length}/${results.length} scenarios passed`);
process.exit(failed.length === 0 ? 0 : 1);
