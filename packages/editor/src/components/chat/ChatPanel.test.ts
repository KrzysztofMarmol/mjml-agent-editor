// @vitest-environment jsdom
import type { ChatTransport, UIMessage } from "ai";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DEFAULT_LABELS } from "../../labels.js";
import ChatPanel from "./ChatPanel.js";

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  // jsdom has neither; the message scroller needs both.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
  // What a browser does to a focused control that becomes disabled, and when: after the
  // commit, before React's passive effects. jsdom leaves focus where it was, and its blur()
  // ignores a disabled element, so focus goes to <body> by way of a throwaway button.
  const toBody = document.documentElement.appendChild(document.createElement("button"));
  new MutationObserver(() => {
    if (!document.activeElement?.matches(":disabled")) return;
    toBody.focus();
    toBody.blur();
  }).observe(document.body, { subtree: true, attributeFilter: ["disabled"] });
});

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Lets React schedule work as it would in a browser. Inside `act` every update is flushed
 * with its effects in one go, which hides anything that depends on when they run.
 */
async function outsideAct(run: () => Promise<void>) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
  try {
    await run();
  } finally {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  }
}

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

/** A panel whose turns are counted instead of sent, and whose pre-turn save the test ends. */
function mount() {
  const sendMessages = vi.fn<ChatTransport<UIMessage>["sendMessages"]>(
    async () =>
      new ReadableStream({
        start: (controller) => controller.close(),
      }),
  );
  const transport: ChatTransport<UIMessage> = {
    sendMessages,
    reconnectToStream: async () => null,
  };
  let finishSave = () => {};
  const onBeforeSend = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finishSave = resolve;
      }),
  );
  const host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);

  const panel = (agentUnavailable?: boolean, docId = "doc-1") =>
    createElement(ChatPanel, {
      docId,
      transport,
      agentUnavailable,
      onBeforeSend,
      onAgentFinish: () => {},
      onLiveUpdate: () => {},
      onSectionEditStart: () => {},
      onSectionEditEnd: () => {},
    });
  const render = (agentUnavailable?: boolean, docId?: string) =>
    act(() => root!.render(panel(agentUnavailable, docId)));

  const button = (label: string) =>
    [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(label))!;
  const textarea = () => host.querySelector("textarea")!;

  return {
    host,
    render,
    /** Schedules a render the way a host's setState does; for use inside `outsideAct`. */
    schedule: (agentUnavailable?: boolean) => root!.render(panel(agentUnavailable)),
    sendMessages,
    onBeforeSend,
    finishSave: () => act(async () => finishSave()),
    textarea,
    apply: () => button(DEFAULT_LABELS.applyComments),
    send: () => button(DEFAULT_LABELS.send),
    type: (text: string) =>
      act(() => {
        // React tracks the value itself; only the native setter makes it see the change.
        const setValue = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )!.set!;
        setValue.call(textarea(), text);
        textarea().dispatchEvent(new Event("input", { bubbles: true }));
      }),
    pressEnter: () =>
      act(() => {
        textarea().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      }),
  };
}

describe("ChatPanel with the agent unavailable", () => {
  it("disables every way of starting a turn and describes them with the reason", () => {
    const panel = mount();
    panel.render(false);
    panel.type("Make the hero blue");
    panel.render(true);

    expect(panel.apply().disabled).toBe(true);
    expect(panel.send().disabled).toBe(true);
    expect(panel.textarea().disabled).toBe(true);
    expect(panel.textarea().value).toBe("Make the hero blue");
    expect(panel.textarea().placeholder).toBe("");

    const status = panel.host.querySelector('[role="status"]')!;
    expect(status.textContent).toBe(DEFAULT_LABELS.agentUnavailable);
    for (const control of [panel.apply(), panel.send(), panel.textarea()]) {
      expect(control.getAttribute("aria-describedby")).toBe(status.id);
    }
  });

  it("starts nothing when Enter reaches the box anyway", async () => {
    const panel = mount();
    panel.render(false);
    panel.type("Make the hero blue");
    panel.render(true);
    panel.pressEnter();
    await panel.finishSave();

    expect(panel.onBeforeSend).not.toHaveBeenCalled();
    expect(panel.sendMessages).not.toHaveBeenCalled();
  });

  it("drops a turn switched off during its pre-turn save, keeping the prompt", async () => {
    const panel = mount();
    panel.render(false);
    panel.type("Make the hero blue");
    act(() => panel.send().click());
    expect(panel.onBeforeSend).toHaveBeenCalledTimes(1);

    panel.render(true);
    await panel.finishSave();

    expect(panel.sendMessages).not.toHaveBeenCalled();
    expect(panel.textarea().value).toBe("Make the hero blue");
  });

  it("drops a turn the host switches off in the same tick its save resolves", async () => {
    const panel = mount();
    panel.render(false);
    panel.type("Make the hero blue");
    // A host whose save reports that the agent is now paused.
    panel.onBeforeSend.mockImplementation(async () => {
      await delay(5);
      panel.schedule(true);
    });

    await outsideAct(async () => {
      panel.send().click();
      await delay(50);
    });

    expect(panel.onBeforeSend).toHaveBeenCalledTimes(1);
    expect(panel.sendMessages).not.toHaveBeenCalled();
    expect(panel.textarea().disabled).toBe(true);
    expect(panel.textarea().value).toBe("Make the hero blue");
  });

  it("keeps focus on the reason while the agent is off, then returns it to the box", async () => {
    const panel = mount();
    panel.render(false);
    act(() => panel.textarea().focus());
    const status = panel.host.querySelector('[role="status"]');

    await outsideAct(async () => {
      panel.schedule(true);
      await delay(20);
    });
    expect(document.activeElement).toBe(status);

    await outsideAct(async () => {
      panel.schedule(false);
      await delay(20);
    });
    expect(document.activeElement).toBe(panel.textarea());
  });
});

describe("ChatPanel without the prop", () => {
  it("works as before, with the live region mounted empty", async () => {
    const panel = mount();
    panel.render();

    expect(panel.apply().disabled).toBe(false);
    expect(panel.textarea().disabled).toBe(false);
    expect(panel.textarea().placeholder).toBe(DEFAULT_LABELS.chatPlaceholder);
    expect(panel.host.querySelector("[aria-describedby]")).toBeNull();
    expect(panel.host.querySelector('[role="status"]')!.textContent).toBe("");

    panel.type("Make the hero blue");
    expect(panel.send().disabled).toBe(false);
    panel.pressEnter();
    await panel.finishSave();

    expect(panel.sendMessages).toHaveBeenCalledTimes(1);
    expect(panel.textarea().value).toBe("");
  });

  it("drops a prompt whose document was swapped out during its pre-turn save", async () => {
    const panel = mount();
    panel.render(false, "doc-A");
    panel.type("Make the hero blue");
    act(() => panel.send().click());

    panel.render(false, "doc-B");
    await panel.finishSave();

    expect(panel.sendMessages).not.toHaveBeenCalled();
    expect(panel.send().disabled).toBe(false);
  });
});
