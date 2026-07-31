import { describe, expect, it } from "vitest";

import { readStream } from "./stream.js";

/**
 * Both fragments are trimmed captures from real runs. The formatting difference is the
 * point: `json.dumps` in the Python backend spaces its separators, so a reader that
 * pattern-matches on `"type":"` sees nothing there. That is not hypothetical — it is what
 * a first hand-check of these two streams actually did.
 */
const TYPESCRIPT_STREAM = [
  `data: {"type":"start"}`,
  `data: {"type":"start-step"}`,
  `data: {"type":"tool-input-start","toolCallId":"call_1","toolName":"get_document"}`,
  `data: {"type":"tool-input-available","toolCallId":"call_1","toolName":"get_document","input":{}}`,
  `data: {"type":"tool-output-available","toolCallId":"call_1","output":"SECTIONS: []"}`,
  `data: {"type":"tool-input-start","toolCallId":"call_2","toolName":"set_section"}`,
  `data: {"type":"tool-output-available","toolCallId":"call_2","output":"OK, saved."}`,
  `data: {"type":"text-start","id":"t1"}`,
  `data: {"type":"text-delta","id":"t1","delta":"Done"}`,
  `data: {"type":"text-delta","id":"t1","delta":" now."}`,
  `data: {"type":"finish"}`,
  `data: [DONE]`,
].join("\n");

const PYTHON_STREAM = [
  `data: {"type": "start", "messageId": "msg_9551db9077fc"}`,
  `data: {"type": "start-step"}`,
  `data: {"type": "tool-input-start", "toolCallId": "call_1", "toolName": "get_document"}`,
  `data: {"type": "tool-input-delta", "toolCallId": "call_1", "inputTextDelta": "{"}`,
  `data: {"type": "tool-input-delta", "toolCallId": "call_1", "inputTextDelta": "}"}`,
  `data: {"type": "tool-output-available", "toolCallId": "call_1", "output": "SECTIONS: []"}`,
  `data: {"type": "tool-input-start", "toolCallId": "call_2", "toolName": "set_section"}`,
  `data: {"type": "tool-output-available", "toolCallId": "call_2", "output": "OK, saved."}`,
  `data: {"type": "text-start", "id": "t1"}`,
  `data: {"type": "text-delta", "id": "t1", "delta": "Done now."}`,
  `data: {"type": "finish"}`,
  `data: [DONE]`,
].join("\n");

describe("readStream", () => {
  it("extracts the same tool sequence from both backends' formatting", () => {
    expect(readStream(TYPESCRIPT_STREAM).toolCalls).toEqual(["get_document", "set_section"]);
    expect(readStream(PYTHON_STREAM).toolCalls).toEqual(["get_document", "set_section"]);
  });

  it("assembles assistant text regardless of how finely it is chunked", () => {
    expect(readStream(TYPESCRIPT_STREAM).text).toBe("Done now.");
    expect(readStream(PYTHON_STREAM).text).toBe("Done now.");
  });

  it("counts a tool once however many events carry its id", () => {
    const noisy = [
      `data: {"type":"tool-input-start","toolCallId":"c1","toolName":"set_document"}`,
      `data: {"type":"tool-input-delta","toolCallId":"c1","toolName":"set_document"}`,
      `data: {"type":"tool-input-delta","toolCallId":"c1","toolName":"set_document"}`,
      `data: {"type":"tool-output-available","toolCallId":"c1","toolName":"set_document","output":"OK"}`,
    ].join("\n");
    expect(readStream(noisy).toolCalls).toEqual(["set_document"]);
  });

  it("keeps repeated calls to the same tool as separate entries", () => {
    const retried = [
      `data: {"type":"tool-input-start","toolCallId":"c1","toolName":"set_document"}`,
      `data: {"type":"tool-input-start","toolCallId":"c2","toolName":"set_document"}`,
    ].join("\n");
    expect(readStream(retried).toolCalls).toEqual(["set_document", "set_document"]);
  });

  it("surfaces tool outputs that reported a failure", () => {
    const rejected = [
      `data: {"type":"tool-input-start","toolCallId":"c1","toolName":"set_document"}`,
      `data: {"type":"tool-output-available","toolCallId":"c1","output":"ERROR: MJML validation failed"}`,
    ].join("\n");
    const facts = readStream(rejected);
    expect(facts.toolErrors).toEqual([
      { tool: "set_document", output: "ERROR: MJML validation failed" },
    ]);
  });

  it("collects stream-level errors", () => {
    const failed = `data: {"type":"error","errorText":"Rate limit reached (429)"}`;
    expect(readStream(failed).errors).toEqual(["Rate limit reached (429)"]);
  });

  it("survives a truncated final chunk", () => {
    const truncated = `data: {"type":"start"}\ndata: {"type":"text-delta","delta":"hi`;
    expect(() => readStream(truncated)).not.toThrow();
    expect(readStream(truncated).eventTypes["start"]).toBe(1);
  });

  it("returns empty facts for a response that is not a stream at all", () => {
    const facts = readStream(`{"status":"ok"}`);
    expect(facts.toolCalls).toEqual([]);
    expect(facts.text).toBe("");
  });
});
