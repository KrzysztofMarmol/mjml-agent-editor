/** Debounced autosave, and the flush a turn waits on. Whether to write is `save`'s call. */
export interface SaveQueue {
  /** Restarts the debounce. */
  schedule(): void;
  /** Drops a scheduled autosave. */
  cancel(): void;
  /** Runs `save` after any save under way; rejects if it fails. */
  flush(): Promise<void>;
}

export function createSaveQueue(save: () => Promise<void>, delayMs: number): SaveQueue {
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Saves run one after another, so an older one can never land after a newer one.
  let tail: Promise<void> = Promise.resolve();

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const run = () => {
    const next = tail.then(save);
    tail = next.catch(() => {});
    return next;
  };

  return {
    schedule() {
      cancel();
      timer = setTimeout(() => void run().catch(() => {}), delayMs);
    },
    cancel,
    flush() {
      cancel();
      return run();
    },
  };
}
