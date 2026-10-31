import { describe, expect, it, vi } from "vitest";

import { createTurnFollower } from "./turn-follower.js";

describe("createTurnFollower", () => {
  it("locks a canvas that becomes ready during a turn", () => {
    const follower = createTurnFollower();
    follower.turn(true);
    const apply = vi.fn();
    follower.ready(apply);
    expect(apply).toHaveBeenCalledWith(true);
    follower.turn(false);
    expect(apply.mock.calls).toEqual([[true], [false]]);
  });

  it("does not reload a canvas that becomes ready after a turn ended", () => {
    const follower = createTurnFollower();
    follower.turn(true);
    follower.turn(false);
    const apply = vi.fn();
    follower.ready(apply);
    expect(apply).not.toHaveBeenCalled();
  });

  it("passes on each change once", () => {
    const follower = createTurnFollower();
    const apply = vi.fn();
    follower.ready(apply);
    follower.turn(false);
    follower.turn(true);
    follower.turn(true);
    expect(apply.mock.calls).toEqual([[true]]);
  });
});
