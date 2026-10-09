/**
 * The host's own sentence, when a refusal carried one.
 *
 * Hosts refuse things the editor cannot know about — a document over a size cap, an
 * account out of messages, an agent already working on this email — and the sentence
 * explaining it is written for the person reading the panel. Falling back to a generic
 * "failed to save" throws away the only part they can act on.
 *
 * Two shapes reach us, because two layers refuse:
 *
 * - A rejected turn arrives as an `Error` whose message is the response body verbatim, and
 *   the agent contract says a refusal is `{"error": "..."}`.
 * - A rejected store call is the host's own exception. Its shape is the host's choice, so
 *   the one thing we can read is an HTTP `status`: in the 4xx range the request was turned
 *   down on purpose and the message was meant to be shown.
 *
 * Anything else — a network failure, a 500, an error part mid-stream — returns `null` and
 * keeps the caller's generic label, because a raw exception message is not something to
 * put in front of a visitor.
 */
export function refusal(error: unknown): string | null {
  if (!(error instanceof Error)) return null;

  if (error.message.startsWith("{")) {
    try {
      const parsed = JSON.parse(error.message) as { error?: unknown };
      if (typeof parsed.error === "string" && parsed.error.trim() !== "") return parsed.error;
    } catch {
      // Not the contract's shape after all; fall through to the status check.
    }
  }

  const status = (error as { status?: unknown }).status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return error.message.trim() === "" ? null : error.message;
  }

  return null;
}
