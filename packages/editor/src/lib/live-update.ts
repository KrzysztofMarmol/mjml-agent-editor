import { isToolName, MUTATING_TOOLS } from "@mjml-agent-editor/core";

/**
 * Whether a finished tool call may have changed the document or its comments, so the
 * preview reloads.
 *
 * A host's own tools are unknown here, so they count as writes: a reload too many costs
 * nothing, while a missed one leaves the old email on the canvas for the next autosave to
 * put back over the agent's.
 */
export function reloadsAfter(toolName: string): boolean {
  return !isToolName(toolName) || MUTATING_TOOLS.has(toolName);
}
