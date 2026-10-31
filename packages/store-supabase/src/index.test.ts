import { NotMjmlDocumentError } from "@mjml-agent-editor/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { createDocumentStore } from "./index.js";

function fakeClient() {
  const eq = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => ({ eq }));
  const client = { from: vi.fn(() => ({ update })) } as unknown as SupabaseClient;
  return { client, update };
}

describe("createDocumentStore().save", () => {
  it("refuses text that is not an MJML document without writing", async () => {
    const { client, update } = fakeClient();
    await expect(
      createDocumentStore(client).save("doc-1", { mjml: "<p>hi</p>" }),
    ).rejects.toBeInstanceOf(NotMjmlDocumentError);
    expect(update).not.toHaveBeenCalled();
  });

  it("writes a document, and a patch without markup", async () => {
    const { client, update } = fakeClient();
    const store = createDocumentStore(client);
    await store.save("doc-1", { mjml: "<mjml><mj-body></mj-body></mjml>" });
    await store.save("doc-1", { name: "Renamed" });
    expect(update).toHaveBeenCalledTimes(2);
  });
});
