/** What an agent backend attaches to an assistant message in the `/api/chat` stream. */
export interface AgentMessageMetadata {
  /**
   * The turn's last allowed step still called tools, so the turn was cut off there. Without
   * a mark the panel shows finished steps and nothing after them, which reads as an agent
   * that hung.
   */
  readonly stepLimitReached?: true;
}
