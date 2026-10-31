// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_LABELS } from "../../labels.js";
import { EditorStoreProvider, type EditorStores } from "../../stores.js";
import EditorHeader from "./EditorHeader.js";
import type { EditorApi } from "./EmailEditor.js";
import { TooltipProvider } from "../ui/tooltip";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const container = document.createElement("div");
document.body.append(container);
const root = createRoot(container);
afterEach(() => act(() => root.render(null)));

const stores = {
  documents: { get: async () => ({ name: "Launch" }) },
} as unknown as EditorStores;

const api = {
  onEditorState: () => () => {},
  getDevices: () => [],
  getCompiledHtml: () => '<img src="x" onerror="fetch(\'/api/documents\')">',
} as unknown as EditorApi;

describe("EditorHeader preview", () => {
  it("renders the email in a frame that runs no script and has no origin", async () => {
    await act(async () =>
      root.render(
        <EditorStoreProvider stores={stores}>
          <TooltipProvider>
            <EditorHeader docId="doc" api={api} openCount={0} />
          </TooltipProvider>
        </EditorStoreProvider>,
      ),
    );
    const open = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes(DEFAULT_LABELS.preview),
    );
    await act(async () => open!.click());

    const frame = document.querySelector<HTMLIFrameElement>("iframe[srcdoc]");
    expect(frame?.getAttribute("srcdoc")).toContain("onerror");
    // Links in the email still open, in a tab of their own.
    expect(frame?.getAttribute("sandbox")?.split(" ").sort()).toEqual([
      "allow-popups",
      "allow-popups-to-escape-sandbox",
    ]);
  });
});
