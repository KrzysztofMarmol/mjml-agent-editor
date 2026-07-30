/**
 * The agent's tool surface — the contract every backend implementation must honour.
 *
 * Ported from the spike's `agent/tools.py`, where names, descriptions and argument
 * shapes lived inside Python decorators and were therefore invisible to the frontend.
 * `ChatPanel.tsx` had to re-declare `MUTATING_TOOLS` and `SECTION_ARG` by hand, so the
 * UI silently drifted from the backend whenever a tool changed. Both now derive from
 * the definitions below.
 *
 * Note on descriptions: these are the *contract*. The spike's prompts additionally
 * demanded single-line MJML with single-quoted attributes — that is a workaround for
 * the Python AI SDK replacing malformed tool-call JSON with `{}`, i.e. an
 * implementation quirk, not part of the contract. Implementations that need it append
 * `LEGACY_JSON_ARGUMENT_HINT` themselves; see `docs/agent-contract.md`.
 */

import { SYSTEM_PROMPT } from "./prompt.js";

/** Minimal JSON Schema shape used for tool arguments. */
export interface ToolInputSchema {
  readonly type: "object";
  readonly properties: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly required: readonly string[];
  readonly additionalProperties: false;
}

export interface ToolDefinition {
  readonly name: ToolName;
  readonly description: string;
  readonly inputSchema: ToolInputSchema;
}

export const TOOL_NAMES = [
  "get_document",
  "get_section",
  "set_document",
  "set_section",
  "insert_section",
  "remove_section",
  "generate_image",
  "list_open_comments",
  "resolve_comment",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

/** Sizes the image tool accepts, matching the aspect ratios the templates use. */
export const IMAGE_SIZES = ["1024x1024", "1536x1024", "1024x1536"] as const;
export type ImageSize = (typeof IMAGE_SIZES)[number];
export const DEFAULT_IMAGE_SIZE: ImageSize = "1536x1024";

const NO_ARGUMENTS: ToolInputSchema = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
};

export const TOOLS: Readonly<Record<ToolName, ToolDefinition>> = {
  get_document: {
    name: "get_document",
    description:
      "Returns the document's full MJML source together with the list of its sections " +
      "(section_id plus a short preview). Call this first to learn the current state.",
    inputSchema: NO_ARGUMENTS,
  },

  get_section: {
    name: "get_section",
    description: "Returns the MJML source of the single section with the given section_id.",
    inputSchema: {
      type: "object",
      properties: {
        section_id: { type: "string", description: "Identifier from the sec-<id> class." },
      },
      required: ["section_id"],
      additionalProperties: false,
    },
  },

  set_document: {
    name: "set_document",
    description:
      "Replaces the ENTIRE document with new MJML source. Use only when creating an email " +
      "from scratch; for targeted edits use set_section, insert_section or remove_section. " +
      "The document must be complete (<mjml><mj-body>...</mj-body></mjml>). Sections without " +
      "a sec-* class are assigned one automatically. Rejected if the MJML does not compile.",
    inputSchema: {
      type: "object",
      properties: {
        mjml: { type: "string", description: "Complete MJML document." },
      },
      required: ["mjml"],
      additionalProperties: false,
    },
  },

  set_section: {
    name: "set_section",
    description:
      "Replaces a single section. `mjml` is exactly one <mj-section>...</mj-section> element. " +
      "The section keeps its sec-<id> even if you supply a different one — that id anchors " +
      "existing comments. Rejected if the resulting document does not compile.",
    inputSchema: {
      type: "object",
      properties: {
        section_id: { type: "string", description: "Section to replace." },
        mjml: { type: "string", description: "One complete <mj-section> element." },
      },
      required: ["section_id", "mjml"],
      additionalProperties: false,
    },
  },

  insert_section: {
    name: "insert_section",
    description:
      "Inserts a new section (exactly one <mj-section> element) after after_section_id, " +
      "or at the end of the email when it is null. Returns the id assigned to the new section.",
    inputSchema: {
      type: "object",
      properties: {
        mjml: { type: "string", description: "One complete <mj-section> element." },
        after_section_id: {
          type: ["string", "null"],
          description: "Insert after this section, or null to append at the end of the body.",
        },
      },
      required: ["mjml", "after_section_id"],
      additionalProperties: false,
    },
  },

  remove_section: {
    name: "remove_section",
    description: "Removes the section with the given section_id.",
    inputSchema: {
      type: "object",
      properties: {
        section_id: { type: "string", description: "Section to remove." },
      },
      required: ["section_id"],
      additionalProperties: false,
    },
  },

  generate_image: {
    name: "generate_image",
    description:
      "Generates an image and returns a public URL to put into an mj-image src. " +
      "Never invent image URLs — always obtain them from this tool.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "English, descriptive: subject, style, composition, palette.",
        },
        size: {
          type: "string",
          enum: IMAGE_SIZES,
          description: "1536x1024 for heroes, 1024x1024 for products, 1024x1536 for portraits.",
        },
      },
      required: ["prompt", "size"],
      additionalProperties: false,
    },
  },

  list_open_comments: {
    name: "list_open_comments",
    description:
      "Returns the open comments on this document: id, section_id, object_id, object_label " +
      "and body. object_id null means the comment is about the whole section.",
    inputSchema: NO_ARGUMENTS,
  },

  resolve_comment: {
    name: "resolve_comment",
    description: "Marks a comment as resolved. Call only after applying the change it asked for.",
    inputSchema: {
      type: "object",
      properties: {
        comment_id: { type: "string", description: "Comment to resolve." },
      },
      required: ["comment_id"],
      additionalProperties: false,
    },
  },
};

export const TOOL_LIST: readonly ToolDefinition[] = TOOL_NAMES.map((name) => TOOLS[name]);

/**
 * Tools that change persisted state. The UI reloads the canvas after each of these
 * rather than waiting for the agent's turn to end.
 */
export const MUTATING_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>([
  "set_document",
  "set_section",
  "insert_section",
  "remove_section",
  "resolve_comment",
]);

/**
 * For tools that target one section, the argument carrying its id. The UI highlights
 * that section on the canvas while the call is in flight.
 */
export const SECTION_ID_ARGUMENT: Readonly<Partial<Record<ToolName, string>>> = {
  get_section: "section_id",
  set_section: "section_id",
  remove_section: "section_id",
  insert_section: "after_section_id",
};

export function isToolName(value: string): value is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(value);
}

/** Serialisable form of the contract, consumed by non-TypeScript implementations. */
export function toolsAsJson(): {
  version: number;
  system_prompt: string;
  tools: Array<{ name: string; description: string; input_schema: ToolInputSchema }>;
  mutating_tools: string[];
  section_id_argument: Record<string, string>;
} {
  return {
    version: 1,
    system_prompt: SYSTEM_PROMPT,
    tools: TOOL_LIST.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    })),
    mutating_tools: [...MUTATING_TOOLS],
    section_id_argument: { ...SECTION_ID_ARGUMENT } as Record<string, string>,
  };
}
