// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import type { CommentStore, DocumentStore } from "@mjml-agent-editor/core";

import { EditorStoreProvider, type ImageLibrary } from "../../stores.js";
import ImagePicker from "./ImagePicker.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const container = document.createElement("div");
document.body.append(container);
const root = createRoot(container);
afterEach(() => act(() => root.render(null)));

const stores = {
  documents: {} as DocumentStore,
  comments: {} as CommentStore,
};
const gallery = [{ id: "a", url: "https://img.test/a.png", name: "A" }];

async function open(images: ImageLibrary) {
  await act(async () =>
    root.render(
      <EditorStoreProvider stores={{ ...stores, images }}>
        <ImagePicker open onSelect={() => {}} onClose={() => {}} />
      </EditorStoreProvider>,
    ),
  );
  const dialog = document.querySelector('[role="dialog"]')!;
  return {
    fileInput: dialog.querySelector('input[type="file"]'),
    urlInput: dialog.querySelector('input:not([type="file"])'),
    images: dialog.querySelectorAll("img").length,
  };
}

describe("ImagePicker", () => {
  it("takes files and addresses next to the gallery by default", async () => {
    const picker = await open({
      list: async () => ({ images: gallery }),
      upload: async () => gallery[0]!,
    });
    expect(picker.fileInput).not.toBeNull();
    expect(picker.urlInput).not.toBeNull();
    expect(picker.images).toBe(1);
  });

  it("offers only the gallery without upload and with allowUrl false", async () => {
    const picker = await open({ list: async () => ({ images: gallery }), allowUrl: false });
    expect(picker.fileInput).toBeNull();
    expect(picker.urlInput).toBeNull();
    expect(picker.images).toBe(1);
  });
});
