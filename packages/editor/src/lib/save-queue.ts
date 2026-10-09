/** Autosave, and the flush a turn waits on before the agent reads the stored document. */
export interface SaveQueue {
  /** Records an edit and restarts the debounce. */
  schedule(): void;
  /** Forgets unsaved edits, for when the document is replaced from the store. */
  reset(): void;
  /** Resolves once every edit so far is stored; rejects if one could not be. */
  flush(): Promise<void>;
}

export function createSaveQueue(save: () => Promise<void>, delayMs: number): SaveQueue {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  // Writes run one at a time, so an older one can never land after a newer one.
  let running: Promise<void> | null = null;

  const stopTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const write = async (): Promise<void> => {
    while (running) await running.catch(() => {});
    if (!dirty) return;
    dirty = false;
    const attempt = save();
    running = attempt;
    try {
      await attempt;
    } catch (error) {
      dirty = true;
      throw error;
    } finally {
      running = null;
    }
  };

  return {
    schedule() {
      dirty = true;
      stopTimer();
      timer = setTimeout(() => void write().catch(() => {}), delayMs);
    },
    reset() {
      stopTimer();
      dirty = false;
    },
    async flush() {
      stopTimer();
      while (dirty || running) await write();
    },
  };
}
