import { describe, expect, it } from "vitest";

import { reloadsAfter } from "./live-update.js";

describe("reloadsAfter", () => {
  it("reloads after a built-in tool that writes", () => {
    for (const name of ["set_document", "set_section", "insert_section", "remove_section"]) {
      expect(reloadsAfter(name), name).toBe(true);
    }
    expect(reloadsAfter("resolve_comment")).toBe(true);
  });

  it("skips a built-in tool that only reads", () => {
    for (const name of ["get_document", "get_section", "list_open_comments", "generate_image"]) {
      expect(reloadsAfter(name), name).toBe(false);
    }
  });

  it("reloads after a host's own tool, which may have written", () => {
    expect(reloadsAfter("apply_template")).toBe(true);
  });
});
