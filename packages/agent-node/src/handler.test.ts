import type { LanguageModelV3StreamPart, LanguageModelV3Usage } from "@ai-sdk/provider";
import type {
  CommentStore,
  DocumentPatch,
  DocumentStore,
  EmailDocument,
  ImageProvider,
} from "@mjml-agent-editor/core";
import type { UIMessage } from "ai";
import { MockLanguageModelV3, convertArrayToReadableStream } from "ai/test";
import { describe, expect, it } from "vitest";

import { createChatHandler } from "./handler.js";

const DOCUMENT: EmailDocument = {
  id: "doc-1",
  name: "Test",
  mjml: `<mjml><mj-body><mj-section css-class="sec-aaa"><mj-column><mj-text>Hi</mj-text></mj-column></mj-section></mj-body></mjml>`,
  projectData: null,
  updatedAt: "2026-01-01T00:00:00Z",
};

const documents: DocumentStore = {
  get: () => Promise.resolve(DOCUMENT),
  save: () => Promise.resolve(),
};

/** Records writes so a test can assert the tool chain reached storage. */
function recordingDocuments(): DocumentStore & { saved: DocumentPatch[] } {
  const saved: DocumentPatch[] = [];
  let current = DOCUMENT;
  return {
    saved,
    get: () => Promise.resolve(current),
    save: (_id, patch) => {
      saved.push(patch);
      current = { ...current, ...patch };
      return Promise.resolve();
    },
  };
}

const comments: CommentStore = {
  list: () => Promise.resolve([]),
  listOpen: () => Promise.resolve([]),
  add: () => Promise.resolve(),
  resolve: () => Promise.resolve(),
};

const images: ImageProvider = {
  generate: () => Promise.resolve("https://images.test/x.png"),
};

const USAGE: LanguageModelV3Usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

function textTurn(text: string): LanguageModelV3StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "t1" },
    { type: "text-delta", id: "t1", delta: text },
    { type: "text-end", id: "t1" },
    { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: USAGE },
  ];
}

function toolCallTurn(toolName: string, input: unknown): LanguageModelV3StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    { type: "tool-call", toolCallId: "call-1", toolName, input: JSON.stringify(input) },
    { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_use" }, usage: USAGE },
  ];
}

/** Replays the given turns in order, so no provider credentials are needed. */
function modelReplaying(...turns: LanguageModelV3StreamPart[][]) {
  let call = 0;
  const model = new MockLanguageModelV3({
    doStream: () => {
      const parts = turns[Math.min(call, turns.length - 1)]!;
      call++;
      return Promise.resolve({ stream: convertArrayToReadableStream(parts) });
    },
  });
  return { model, calls: () => call };
}

function post(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const USER_MESSAGE: UIMessage = {
  id: "m1",
  role: "user",
  parts: [{ type: "text", text: "Make the header green" }],
};

function handlerSaying(text: string) {
  return createChatHandler({
    model: modelReplaying(textTurn(text)).model,
    documents,
    comments,
    images,
  });
}

describe("createChatHandler", () => {
  it("rejects a body that is not JSON", async () => {
    const response = await handlerSaying("ok")(post("not json"));
    expect(response.status).toBe(400);
  });

  it("rejects a missing docId", async () => {
    const response = await handlerSaying("ok")(post({ messages: [USER_MESSAGE] }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "`docId` is required" });
  });

  it("rejects an empty docId", async () => {
    const response = await handlerSaying("ok")(post({ messages: [USER_MESSAGE], docId: "" }));
    expect(response.status).toBe(400);
  });

  it("rejects missing messages", async () => {
    const response = await handlerSaying("ok")(post({ docId: "doc-1" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "`messages` is required" });
  });

  it("streams the assistant reply as a UI message stream", async () => {
    const response = await handlerSaying("Done — header is green now.")(
      post({ messages: [USER_MESSAGE], docId: "doc-1" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const body = await response.text();
    expect(body).toContain("Done — header is green now.");
    expect(body).toContain("[DONE]");
  });

  it("executes a tool call end to end and persists the validated result", async () => {
    const store = recordingDocuments();
    const replacement = `<mj-section css-class="sec-aaa"><mj-column><mj-text>Green header</mj-text></mj-column></mj-section>`;

    // First turn asks for the edit; the second reports it, which is what ends the loop.
    const { model, calls } = modelReplaying(
      toolCallTurn("set_section", { section_id: "aaa", mjml: replacement }),
      textTurn("Header updated."),
    );

    const handler = createChatHandler({ model, documents: store, comments, images });
    const body = await handler(post({ messages: [USER_MESSAGE], docId: "doc-1" })).then((r) =>
      r.text(),
    );

    expect(store.saved).toHaveLength(1);
    expect(store.saved[0]!.mjml).toContain("Green header");
    // The id anchors comments; replacing a section must not change it.
    expect(store.saved[0]!.mjml).toContain("sec-aaa");
    expect(body).toContain("Header updated.");
    expect(calls()).toBe(2);
  });

  it("does not persist a document the compiler rejects", async () => {
    const store = recordingDocuments();

    const { model } = modelReplaying(
      toolCallTurn("set_document", { mjml: `<mjml><mj-body><mj-bogus /></mj-body></mjml>` }),
      textTurn("That markup was invalid."),
    );

    const handler = createChatHandler({ model, documents: store, comments, images });
    await handler(post({ messages: [USER_MESSAGE], docId: "doc-1" })).then((r) => r.text());

    expect(store.saved).toEqual([]);
  });
});
