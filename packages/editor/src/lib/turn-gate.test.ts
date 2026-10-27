import { describe, expect, it } from "vitest";

import { canStartTurn, type TurnGate } from "./turn-gate.js";

const idle: TurnGate = { unavailable: false, busy: false, flushing: false, locked: false };

describe("canStartTurn", () => {
  it("starts a turn when the agent is idle and there is something to send", () => {
    expect(canStartTurn("Make the hero blue", idle)).toBe(true);
  });

  it("refuses every turn while the agent is unavailable", () => {
    expect(canStartTurn("Make the hero blue", { ...idle, unavailable: true })).toBe(false);
  });

  it("still refuses an empty prompt and a turn on top of another", () => {
    expect(canStartTurn("   ", idle)).toBe(false);
    expect(canStartTurn("x", { ...idle, busy: true })).toBe(false);
    expect(canStartTurn("x", { ...idle, flushing: true })).toBe(false);
    expect(canStartTurn("x", { ...idle, locked: true })).toBe(false);
  });
});
