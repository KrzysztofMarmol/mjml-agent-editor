/**
 * Reads an agent's UI Message Stream response into the facts the suite asserts on.
 *
 * Parsing is deliberately structural rather than textual. The two backends emit the same
 * protocol but not the same bytes: the Python implementation's `json.dumps` puts a space
 * after every separator, adds a `messageId` to the start event, and chunks
 * `tool-input-delta` far more finely (38 events where the TypeScript one sends 5). A
 * grep-based reader silently returns nothing for one of them — which is exactly what
 * happened the first time this was checked by hand.
 *
 * Tool calls are ordered by the first appearance of each `toolCallId`, so the sequence is
 * independent of which event types a backend chooses to emit and how it chunks them.
 */

export interface StreamFacts {
  /** Tool names in call order, deduplicated by tool call id. */
  readonly toolCalls: readonly string[];
  /** Concatenated assistant text. */
  readonly text: string;
  /** Error texts carried in the stream, if any. */
  readonly errors: readonly string[];
  /** Tool outputs that reported a failure, keyed by tool name. */
  readonly toolErrors: readonly { tool: string; output: string }[];
  readonly eventTypes: Readonly<Record<string, number>>;
}

interface StreamEvent {
  type?: string;
  toolName?: string;
  toolCallId?: string;
  delta?: string;
  text?: string;
  errorText?: string;
  output?: unknown;
}

function parseEvents(body: string): StreamEvent[] {
  const events: StreamEvent[] = [];
  for (const line of body.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (payload === "" || payload === "[DONE]") continue;
    try {
      events.push(JSON.parse(payload) as StreamEvent);
    } catch {
      // A truncated final chunk is not worth failing the whole run over.
    }
  }
  return events;
}

function outputText(output: unknown): string {
  if (typeof output === "string") return output;
  if (output && typeof output === "object") {
    const value = (output as { value?: unknown }).value;
    if (typeof value === "string") return value;
    return JSON.stringify(output);
  }
  return String(output ?? "");
}

export function readStream(body: string): StreamFacts {
  const events = parseEvents(body);

  const callOrder: string[] = [];
  const nameByCallId = new Map<string, string>();
  const eventTypes: Record<string, number> = {};
  const errors: string[] = [];
  const toolErrors: { tool: string; output: string }[] = [];
  let text = "";

  for (const event of events) {
    if (event.type) eventTypes[event.type] = (eventTypes[event.type] ?? 0) + 1;

    if (event.toolCallId && event.toolName && !nameByCallId.has(event.toolCallId)) {
      nameByCallId.set(event.toolCallId, event.toolName);
      callOrder.push(event.toolCallId);
    }

    if (event.type === "text-delta" && typeof event.delta === "string") text += event.delta;
    if (event.type === "error" && typeof event.errorText === "string") errors.push(event.errorText);

    if (event.type === "tool-output-available" && event.output !== undefined) {
      const rendered = outputText(event.output);
      if (rendered.startsWith("ERROR")) {
        const tool = event.toolCallId ? (nameByCallId.get(event.toolCallId) ?? "?") : "?";
        toolErrors.push({ tool, output: rendered });
      }
    }
  }

  return {
    toolCalls: callOrder.map((id) => nameByCallId.get(id) ?? "?"),
    text,
    errors,
    toolErrors,
    eventTypes,
  };
}
