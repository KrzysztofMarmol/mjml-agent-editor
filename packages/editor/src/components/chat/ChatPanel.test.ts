import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DEFAULT_LABELS } from "../../labels.js";
import ChatPanel from "./ChatPanel.js";

function render(unavailable?: boolean): string {
  const noop = () => {};
  return renderToStaticMarkup(
    createElement(ChatPanel, {
      docId: "doc-1",
      unavailable,
      onBeforeSend: async () => {},
      onAgentFinish: noop,
      onLiveUpdate: noop,
      onSectionEditStart: noop,
      onSectionEditEnd: noop,
    }),
  );
}

/** The opening tag of the element containing `marker`, or of the first `tag` after it. */
function tagWith(html: string, tag: string, marker: string): string {
  const at = html.indexOf(marker);
  expect(at).toBeGreaterThan(-1);
  const start = html.lastIndexOf(`<${tag}`, at);
  return html.slice(start, html.indexOf(">", start) + 1);
}

const isDisabled = (openingTag: string) => /\sdisabled=""/.test(openingTag);

describe("ChatPanel", () => {
  it("disables every way of starting a turn while the agent is unavailable", () => {
    const html = render(true);
    const apply = tagWith(html, "button", DEFAULT_LABELS.applyComments);
    const send = tagWith(html, "button", DEFAULT_LABELS.send);
    const box = tagWith(html, "textarea", 'data-slot="textarea"');

    expect(isDisabled(apply)).toBe(true);
    expect(isDisabled(send)).toBe(true);
    expect(isDisabled(box)).toBe(true);

    const reason = tagWith(html, "p", DEFAULT_LABELS.agentUnavailable);
    const id = /id="([^"]+)"/.exec(reason)?.[1];
    expect(id).toBeTruthy();
    for (const control of [apply, send, box]) {
      expect(control).toContain(`aria-describedby="${id}"`);
    }
    expect(box).not.toContain("placeholder=");
  });

  it("renders as before when the prop is absent", () => {
    const html = render();
    const apply = tagWith(html, "button", DEFAULT_LABELS.applyComments);
    const box = tagWith(html, "textarea", 'data-slot="textarea"');

    expect(isDisabled(apply)).toBe(false);
    expect(isDisabled(box)).toBe(false);
    expect(box).toContain(`placeholder="${DEFAULT_LABELS.chatPlaceholder}"`);
    expect(html).not.toContain(DEFAULT_LABELS.agentUnavailable);
    expect(html).not.toContain("aria-describedby");
  });
});
