/**
 * The host's own sentence when a save or a turn was refused, or null for anything else.
 *
 * A turn refusal is a `{"error": "..."}` body (the agent contract); a store refusal is the
 * host's exception with a 4xx `status`. A non-4xx status rules the message out first, so a
 * 500 whose body happens to be `{"error": ...}` is never shown verbatim.
 */
export function refusal(error: unknown): string | null {
  if (!(error instanceof Error)) return null;

  const status = (error as { status?: unknown }).status;
  // null: no status at all, which is every turn rejection.
  const deliberate = typeof status === "number" ? status >= 400 && status < 500 : null;
  if (deliberate === false) return null;

  if (error.message.startsWith("{")) {
    try {
      const parsed = JSON.parse(error.message) as { error?: unknown };
      return typeof parsed.error === "string" && parsed.error.trim() !== "" ? parsed.error : null;
    } catch {
      return null;
    }
  }

  // A proxy answering for the host sends an HTML page, not a sentence.
  const message = error.message.trim();
  return deliberate && message !== "" && !message.startsWith("<") ? error.message : null;
}

/** Shared by autosave and the pre-turn flush, so one failing save shows one toast. */
export function saveToastId(docId: string): string {
  return `document-save-${docId}`;
}
