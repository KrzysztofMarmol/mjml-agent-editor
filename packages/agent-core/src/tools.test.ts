import { describe, expect, it } from "vitest";

// Imported statically rather than read via `node:fs` so this package stays free of
// Node type dependencies — it also runs in the browser, inside the editor.
import committedContract from "../contract/tools.json";
import {
  MUTATING_TOOLS,
  SECTION_ID_ARGUMENT,
  TOOLS,
  TOOL_LIST,
  TOOL_NAMES,
  isToolName,
  toolsAsJson,
} from "./tools.js";

describe("tool definitions", () => {
  it("keys every entry by its own name", () => {
    for (const name of TOOL_NAMES) expect(TOOLS[name].name).toBe(name);
  });

  it("exposes one definition per name", () => {
    expect(TOOL_LIST).toHaveLength(TOOL_NAMES.length);
  });

  it("gives every tool a non-trivial description", () => {
    for (const tool of TOOL_LIST) expect(tool.description.length).toBeGreaterThan(30);
  });

  it("declares every property as required and forbids extras, as strict tool use needs", () => {
    for (const tool of TOOL_LIST) {
      const properties = Object.keys(tool.inputSchema.properties);
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect([...tool.inputSchema.required].sort()).toEqual(properties.sort());
    }
  });

  it("describes every argument", () => {
    for (const tool of TOOL_LIST) {
      for (const [argument, schema] of Object.entries(tool.inputSchema.properties)) {
        expect(schema["description"], `${tool.name}.${argument}`).toBeTruthy();
      }
    }
  });
});

describe("UI-facing derivations", () => {
  it("lists only known tools as mutating", () => {
    for (const name of MUTATING_TOOLS) expect(isToolName(name)).toBe(true);
  });

  it("points every section-id argument at a real argument of that tool", () => {
    for (const [name, argument] of Object.entries(SECTION_ID_ARGUMENT)) {
      expect(isToolName(name)).toBe(true);
      expect(TOOLS[name as keyof typeof TOOLS].inputSchema.properties).toHaveProperty(argument!);
    }
  });

  it("treats every write tool as mutating", () => {
    for (const name of [
      "set_document",
      "set_section",
      "insert_section",
      "remove_section",
    ] as const) {
      expect(MUTATING_TOOLS.has(name)).toBe(true);
    }
    expect(MUTATING_TOOLS.has("get_document")).toBe(false);
    expect(MUTATING_TOOLS.has("get_section")).toBe(false);
    expect(MUTATING_TOOLS.has("list_open_comments")).toBe(false);
  });
});

describe("isToolName", () => {
  it("accepts known names and rejects others", () => {
    expect(isToolName("set_section")).toBe(true);
    expect(isToolName("drop_database")).toBe(false);
  });
});

describe("committed contract artifact", () => {
  it("matches the TypeScript source", () => {
    expect(committedContract).toEqual(toolsAsJson());
  });

  it("carries the system prompt, so both backends share one copy", () => {
    const prompt = toolsAsJson().system_prompt;
    expect(prompt.length).toBeGreaterThan(500);
    // The invariant every backend enforces; if it ever leaves the prompt, say so loudly.
    expect(prompt).toContain("sec-");
  });

  it("keeps the Python-only argument workaround out of the shared prompt", () => {
    expect(toolsAsJson().system_prompt).not.toContain("SINGLE line");
  });
});
