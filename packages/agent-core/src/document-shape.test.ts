import { describe, expect, it } from "vitest";

import { isMjmlDocument } from "./document-shape.js";
import { STARTER_MJML } from "./starter.js";

const BODY = "<mj-body><mj-section></mj-section></mj-body>";

describe("isMjmlDocument", () => {
  it("accepts the starter", () => {
    expect(isMjmlDocument(STARTER_MJML)).toBe(true);
  });

  // What strict compilation lets an agent store, and the editor then saves back unchanged.
  it.each([
    [
      "a declaration and a comment before the root",
      `<?xml version="1.0"?>\n<!-- a -->\n<mjml>${BODY}</mjml>`,
    ],
    ["a comment after the root", `<mjml>${BODY}</mjml>\n<!-- end -->`],
    ["a code fence around the root", "```xml\n<mjml>" + BODY + "</mjml>\n```"],
    [
      "attributes, a head and a self-closed body",
      `<mjml lang="en"><mj-head></mj-head><mj-body/></mjml>`,
    ],
    ["upper case", `<MJML><MJ-BODY></MJ-BODY></MJML >`],
  ])("accepts %s", (_, source) => {
    expect(isMjmlDocument(source)).toBe(true);
  });

  it.each([
    ["plain text", "hello"],
    ["HTML", "<html><body><p>hi</p></body></html>"],
    ["a root with no body", "<mjml><mj-head></mj-head></mjml>"],
    ["a body outside the root", "<mj-body></mj-body><mjml></mjml>"],
    // Strict compilation accepts this one.
    ["a root never closed", `<mjml>${BODY}`],
    ["a tag that only starts like the root", `<mjmlx>${BODY}</mjmlx>`],
  ])("refuses %s", (_, source) => {
    expect(isMjmlDocument(source)).toBe(false);
  });
});
