import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSaveQueue } from "./save-queue.js";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createSaveQueue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("autosaves once after the debounce", async () => {
    const save = vi.fn(() => Promise.resolve());
    const queue = createSaveQueue(save, 1000);

    queue.schedule();
    queue.schedule();
    await vi.advanceTimersByTimeAsync(1000);

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flushes a scheduled save at once instead of waiting for the debounce", async () => {
    const save = vi.fn(() => Promise.resolve());
    const queue = createSaveQueue(save, 1000);

    queue.schedule();
    await queue.flush();

    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("writes nothing when nothing is owed", async () => {
    const save = vi.fn(() => Promise.resolve());

    await createSaveQueue(save, 1000).flush();

    expect(save).not.toHaveBeenCalled();
  });

  it("waits for an autosave already under way before resolving", async () => {
    const inFlight = deferred();
    const save = vi.fn(() => inFlight.promise);
    const queue = createSaveQueue(save, 1000);

    queue.schedule();
    await vi.advanceTimersByTimeAsync(1000);
    let flushed = false;
    const flush = queue.flush().then(() => (flushed = true));
    await vi.advanceTimersByTimeAsync(0);

    expect(flushed).toBe(false);
    inFlight.resolve();
    await flush;
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("retries an autosave that failed while the flush waited, and rejects if it fails again", async () => {
    const first = deferred();
    const save = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => Promise.reject(new Error("too large")));
    const queue = createSaveQueue(save, 1000);

    queue.schedule();
    await vi.advanceTimersByTimeAsync(1000);
    const flush = queue.flush();
    first.reject(new Error("network"));

    await expect(flush).rejects.toThrow("too large");
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("owes the changes of a failed save until one succeeds", async () => {
    const save = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValue(undefined);
    const queue = createSaveQueue(save, 1000);

    queue.schedule();
    await vi.advanceTimersByTimeAsync(1000);
    await queue.flush();
    await queue.flush();

    expect(save).toHaveBeenCalledTimes(2);
  });

  it("never runs two saves at once, so an older one cannot land last", async () => {
    const first = deferred();
    let active = 0;
    let overlapped = false;
    const save = vi.fn(async () => {
      active++;
      if (active > 1) overlapped = true;
      if (save.mock.calls.length === 1) await first.promise;
      active--;
    });
    const queue = createSaveQueue(save, 1000);

    queue.schedule();
    await vi.advanceTimersByTimeAsync(1000);
    queue.schedule();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);

    first.resolve();
    await queue.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(overlapped).toBe(false);
  });

  it("also stores an edit made while the flush was waiting", async () => {
    const first = deferred();
    const save = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(undefined);
    const queue = createSaveQueue(save, 1000);

    queue.schedule();
    await vi.advanceTimersByTimeAsync(1000);
    const flush = queue.flush();
    queue.schedule();
    first.resolve();
    await flush;

    expect(save).toHaveBeenCalledTimes(2);
  });

  it("forgets edits on reset", async () => {
    const save = vi.fn(() => Promise.resolve());
    const queue = createSaveQueue(save, 1000);

    queue.schedule();
    queue.reset();
    await queue.flush();
    await vi.advanceTimersByTimeAsync(1000);

    expect(save).not.toHaveBeenCalled();
  });
});
