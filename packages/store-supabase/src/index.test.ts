import { NotMjmlDocumentError } from "@mjml-agent-editor/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { createDocument, createDocumentStore } from "./index.js";

const DOCUMENT = "<mjml><mj-body></mj-body></mjml>";

/** A client whose stored row holds `stored`; records updates and inserts. */
function fakeClient(stored: string) {
  const row = { id: "doc-1", name: "x", mjml: stored, project_data: null, updated_at: "" };
  const update = vi.fn(() => ({ eq: async () => ({ error: null }) }));
  const insert = vi.fn(() => ({
    select: () => ({ single: async () => ({ data: { id: "doc-2" }, error: null }) }),
  }));
  const select = () => ({ eq: () => ({ single: async () => ({ data: row, error: null }) }) });
  const client = { from: () => ({ update, insert, select }) } as unknown as SupabaseClient;
  return { client, update, insert };
}

describe("createDocumentStore().save", () => {
  it("refuses to break a document, without writing", async () => {
    const { client, update } = fakeClient(DOCUMENT);
    const save = createDocumentStore(client).save("doc-1", { mjml: "<p>hi</p>" });
    await expect(save).rejects.toBeInstanceOf(NotMjmlDocumentError);
    expect(update).not.toHaveBeenCalled();
  });

  // Refusing here would leave the editor unable to save it ever again.
  it("writes over a document that was stored broken", async () => {
    const { client, update } = fakeClient("<mj-section></mj-section>");
    await createDocumentStore(client).save("doc-1", { mjml: "<mj-section></mj-section>" });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("writes a document, and a patch without markup", async () => {
    const { client, update } = fakeClient(DOCUMENT);
    const store = createDocumentStore(client);
    await store.save("doc-1", { mjml: DOCUMENT });
    await store.save("doc-1", { name: "Renamed" });
    expect(update).toHaveBeenCalledTimes(2);
  });
});

describe("createDocument", () => {
  it("refuses to create one that is not a document", async () => {
    const { client, insert } = fakeClient(DOCUMENT);
    await expect(createDocument(client, "x", "<p>hi</p>")).rejects.toBeInstanceOf(
      NotMjmlDocumentError,
    );
    expect(insert).not.toHaveBeenCalled();
  });
});
