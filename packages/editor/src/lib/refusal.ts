/**
 * How a rejected save or a rejected turn reaches the visitor.
 *
 * Hosts refuse things the editor cannot know about — a document over a size cap, an
 * account out of messages, an agent already working on this email — and the sentence
 * explaining it is written for the person reading the panel. Falling back to a generic
 * "failed to save" throws away the only part they can act on.
 */

/**
 * The host's own sentence, when a refusal carried one.
 *
 * Two shapes reach us, because two layers refuse:
 *
 * - A rejected turn arrives as an `Error` whose message is the response body verbatim, and
 *   the agent contract says a refusal is `{"error": "..."}`.
 * - A rejected store call is the host's own exception. Its shape is the host's choice, so
 *   the one thing we can read is an HTTP `status`: in the 4xx range the request was turned
 *   down on purpose and the message was meant to be shown.
 *
 * A `status` outside 4xx settles it before the body is even looked at. That order matters:
 * the obvious way for a host to normalize a failure is
 * `throw Object.assign(new Error(await response.text()), { status })`, and an API that
 * answers its own errors as `{"error": "..."}` would otherwise have a 500 read as a
 * refusal and printed verbatim.
 *
 * Everything else — a network failure, a 500, an error part mid-stream — returns `null` and
 * keeps the caller's generic label, because a raw exception message is not something to put
 * in front of a visitor.
 */
export function refusal(error: unknown): string | null {
  if (!(error instanceof Error)) return null;

  const status = (error as { status?: unknown }).status;
  // `null` means the error carries no status at all, which is every turn rejection.
  const deliberate = typeof status === "number" ? status >= 400 && status < 500 : null;
  if (deliberate === false) return null;

  if (error.message.startsWith("{")) {
    try {
      const parsed = JSON.parse(error.message) as { error?: unknown };
      // A body that parses but holds no sentence is a shape we do not know. Showing it
      // would put `{"message":"Payload too large","requestId":"a1b2"}` in a toast, so it
      // stops here rather than falling through to the message below.
      return typeof parsed.error === "string" && parsed.error.trim() !== "" ? parsed.error : null;
    } catch {
      // A brace means a body either way, and an unparseable one holds no sentence.
      return null;
    }
  }

  // A proxy or platform answering for the host sends a page, not a sentence.
  const message = error.message.trim();
  if (deliberate && message !== "" && !message.startsWith("<")) return error.message;
  return null;
}

/**
 * One toast per failed save, however many places notice it.
 *
 * Autosave fires on a timer and a turn flushes before it starts, so the same refusal can
 * be reported twice within a second — and a host refusing every save would otherwise stack
 * one toast per attempt. Sonner collapses messages sharing an id, which only works while
 * both callers use the same one; it was a duplicated literal in two files until this.
 */
export function saveToastId(docId: string): string {
  return `document-save-${docId}`;
}
