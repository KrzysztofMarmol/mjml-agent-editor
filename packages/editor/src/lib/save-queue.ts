/**
 * Autosave, and the flush a turn waits on before the agent reads the stored document.
 *
 * Kept apart from the canvas so the part that decides whether the agent sees the visitor's
 * latest edit can be tested without GrapesJS.
 */

export interface SaveQueue {
  /** Restarts the debounce; called on every edit. */
  schedule(): void;
  /** Drops a scheduled save without running it. */
  cancel(): void;
  /**
   * Resolves once everything the visitor has done is stored, and rejects if it could not
   * be. Waits for a save already under way rather than reporting nothing owed while it
   * runs, and writes nothing when the store already matches.
   */
  flush(force?: boolean): Promise<void>;
}

export function createSaveQueue(save: () => Promise<void>, delayMs: number): SaveQueue {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;
  // The last attempt failed, so its changes are still owed.
  let owed = false;

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const run = (): Promise<void> => {
    cancel();
    const attempt = save().then(
      () => {
        owed = false;
      },
      (error: unknown) => {
        owed = true;
        throw error;
      },
    );
    running = attempt;
    void attempt
      .catch(() => {})
      .finally(() => {
        if (running === attempt) running = null;
      });
    return attempt;
  };

  return {
    schedule() {
      cancel();
      timer = setTimeout(() => void run().catch(() => {}), delayMs);
    },
    cancel,
    async flush(force = false) {
      const scheduled = timer !== null;
      cancel();
      if (running) await running.catch(() => {});
      if (force || scheduled || owed) await run();
    },
  };
}
