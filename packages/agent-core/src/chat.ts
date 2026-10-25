/** What an agent backend attaches to an assistant message in the `/api/chat` stream. */
export interface AgentMessageMetadata {
  /**
   * The turn reached its step ceiling while still calling tools, so it ended without a
   * reply. Without a mark the panel shows finished steps and nothing after them, which
   * reads as an agent that hung.
   */
  readonly stepLimitReached?: true;
}
