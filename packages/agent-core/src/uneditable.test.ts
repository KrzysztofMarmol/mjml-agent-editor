import { describe, expect, it } from "vitest";

import { addedUneditableTags } from "./uneditable.js";

const doc = (body: string) => `<mjml><mj-body>${body}</mj-body></mjml>`;
const TABLE =
  "<mj-section><mj-column><mj-table><tr><td>1</td></tr></mj-table></mj-column></mj-section>";

describe("addedUneditableTags", () => {
  it("names a tag the write adds", () => {
    expect(addedUneditableTags(doc(""), doc(TABLE))).toEqual(["mj-table"]);
    expect(addedUneditableTags(doc(TABLE), doc(TABLE + TABLE))).toEqual(["mj-table"]);
    expect(addedUneditableTags(doc(""), doc('<mj-hero mode="fluid-height"></mj-hero>'))).toEqual([
      "mj-hero",
    ]);
  });

  it("lets a document keep one it already holds", () => {
    expect(addedUneditableTags(doc(TABLE), doc(TABLE.replace("1", "2")))).toEqual([]);
  });

  it("does not count a longer tag name", () => {
    expect(addedUneditableTags(doc(""), doc("<mj-table-of-contents>"))).toEqual([]);
  });
});
