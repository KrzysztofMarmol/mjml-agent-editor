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
});

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

  const render = (agentUnavailable?: boolean) =>
    act(() =>
      root!.render(
        createElement(ChatPanel, {
          docId: "doc-1",
          transport,
          agentUnavailable,
          onBeforeSend,
          onAgentFinish: () => {},
          onLiveUpdate: () => {},
          onSectionEditStart: () => {},
          onSectionEditEnd: () => {},
        }),
      ),
    );

  const button = (label: string) =>
    [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(label))!;
  const textarea = () => host.querySelector("textarea")!;

  return {
    host,
    render,
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
});

describe("ChatPanel without the prop", () => {
  it("works as before", async () => {
    const panel = mount();
    panel.render();

    expect(panel.apply().disabled).toBe(false);
    expect(panel.textarea().disabled).toBe(false);
    expect(panel.textarea().placeholder).toBe(DEFAULT_LABELS.chatPlaceholder);
    expect(panel.host.querySelector("[aria-describedby]")).toBeNull();

    panel.type("Make the hero blue");
    expect(panel.send().disabled).toBe(false);
    panel.pressEnter();
    await panel.finishSave();

    expect(panel.sendMessages).toHaveBeenCalledTimes(1);
  });
});
