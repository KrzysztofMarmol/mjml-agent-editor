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

  it("flushes at once and drops the scheduled autosave", async () => {
    const save = vi.fn(() => Promise.resolve());
    const queue = createSaveQueue(save, 1000);

    queue.schedule();
    await queue.flush();
    await vi.advanceTimersByTimeAsync(1000);

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("never runs two saves at once", async () => {
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
    const flush = queue.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);

    first.resolve();
    await flush;
    expect(save).toHaveBeenCalledTimes(2);
    expect(overlapped).toBe(false);
  });

  it("rejects the flush when its save fails, after an autosave that failed", async () => {
    const first = deferred();
    const save = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => first.promise)
      .mockRejectedValueOnce(new Error("too large"));
    const queue = createSaveQueue(save, 1000);

    queue.schedule();
    await vi.advanceTimersByTimeAsync(1000);
    const flush = queue.flush();
    first.reject(new Error("network"));

    await expect(flush).rejects.toThrow("too large");
  });

  it("runs a task after the save under way", async () => {
    const first = deferred();
    const order: string[] = [];
    const save = vi.fn(async () => {
      await first.promise;
      order.push("save");
    });
    const queue = createSaveQueue(save, 1000);

    queue.schedule();
    await vi.advanceTimersByTimeAsync(1000);
    const task = queue.run(async () => void order.push("task"));
    first.resolve();
    await task;

    expect(order).toEqual(["save", "task"]);
  });

  it("drops a scheduled autosave on cancel", async () => {
    const save = vi.fn(() => Promise.resolve());
    const queue = createSaveQueue(save, 1000);

    queue.schedule();
    queue.cancel();
    await vi.advanceTimersByTimeAsync(1000);

    expect(save).not.toHaveBeenCalled();
  });
});
