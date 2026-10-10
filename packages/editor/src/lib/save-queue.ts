/** Debounced autosave, and the flush a turn waits on. Whether to write is `save`'s call. */
export interface SaveQueue {
  /** Restarts the debounce. */
  schedule(): void;
  /** Drops a scheduled autosave. */
  cancel(): void;
  /** Runs `save` after any work under way; rejects if it fails. */
  flush(): Promise<void>;
  /** Runs `task` after any work under way, such as a reload that must not race a save. */
  run<T>(task: () => Promise<T>): Promise<T>;
}

export function createSaveQueue(save: () => Promise<void>, delayMs: number): SaveQueue {
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Work runs one after another, so an older write or read can never land after a newer one.
  let tail: Promise<unknown> = Promise.resolve();

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const run = <T>(task: () => Promise<T>): Promise<T> => {
    const next = tail.then(task);
    tail = next.catch(() => {});
    return next;
  };

  return {
    schedule() {
      cancel();
      timer = setTimeout(() => void run(save).catch(() => {}), delayMs);
    },
    cancel,
    flush() {
      cancel();
      return run(save);
    },
    run,
  };
}
