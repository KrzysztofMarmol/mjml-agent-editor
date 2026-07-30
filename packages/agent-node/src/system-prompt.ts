/**
 * System prompt assembly for the TypeScript backend.
 *
 * The prompt text itself lives in `@mjml-agent-editor/core` — it states the document
 * rules both backends enforce, so it is contract rather than implementation, and the
 * Python backend reads the same text out of `contract/tools.json`.
 */

import { LEGACY_JSON_ARGUMENT_HINT, SYSTEM_PROMPT } from "@mjml-agent-editor/core";

export { SYSTEM_PROMPT };

export interface SystemPromptOptions {
  /** Replaces the prompt entirely. */
  readonly systemPrompt?: string;
  /**
   * Appends instructions for SDKs that cannot carry multi-line tool arguments.
   *
   * Off by default: verified against Anthropic Haiku 4.5 through this SDK, a model
   * asked for multi-line MJML produced 14 newlines that arrived intact and compiled.
   * The Python backend still needs it.
   */
  readonly legacyJsonArgumentHint?: boolean;
}

export function buildSystemPrompt(options: SystemPromptOptions = {}): string {
  const base = options.systemPrompt ?? SYSTEM_PROMPT;
  if (!options.legacyJsonArgumentHint) return base;
  return `${base}\n\nMJML ARGUMENT FORMAT:\n- ${LEGACY_JSON_ARGUMENT_HINT}`;
}
