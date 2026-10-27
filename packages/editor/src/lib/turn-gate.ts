/** What decides whether the chat may start a turn. */
export interface TurnGate {
  /** The host has switched the agent off. */
  readonly unavailable: boolean;
  /** A turn is streaming. */
  readonly busy: boolean;
  /** The pre-turn save is running. */
  readonly flushing: boolean;
  /** The canvas has not loaded what the last turn wrote yet. */
  readonly locked: boolean;
}

/**
 * Send, Enter and "Apply changes from comments" all ask this, so switching the agent off
 * cannot miss one of them.
 */
export function canStartTurn(text: string, gate: TurnGate): boolean {
  return !gate.unavailable && !gate.busy && !gate.flushing && !gate.locked && text.trim() !== "";
}
