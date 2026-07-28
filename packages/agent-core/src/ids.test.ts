import { describe, expect, it } from "vitest";

import {
  OBJECT_PREFIX,
  SECTION_PREFIX,
  ensureIdInClassList,
  newId,
  readIdFromClassList,
  setIdInClassList,
} from "./ids.js";

describe("newId", () => {
  it("produces 8 lowercase hex characters", () => {
    for (let i = 0; i < 50; i++) expect(newId()).toMatch(/^[0-9a-f]{8}$/);
  });

  it("does not repeat across a sample", () => {
    const ids = new Set(Array.from({ length: 500 }, newId));
    expect(ids.size).toBe(500);
  });
});

describe("readIdFromClassList", () => {
  it("reads the id for its own prefix", () => {
    expect(readIdFromClassList("sec-a1b2c3d4", SECTION_PREFIX)).toBe("a1b2c3d4");
    expect(readIdFromClassList("obj-deadbeef", OBJECT_PREFIX)).toBe("deadbeef");
  });

  it("ignores the other prefix", () => {
    expect(readIdFromClassList("obj-deadbeef", SECTION_PREFIX)).toBeNull();
  });

  it("finds the id among unrelated classes", () => {
    expect(readIdFromClassList("hero  dark sec-a1b2c3d4 rounded", SECTION_PREFIX)).toBe("a1b2c3d4");
  });

  it("does not match a prefix embedded in a longer class name", () => {
    expect(readIdFromClassList("mysec-a1b2c3d4", SECTION_PREFIX)).toBeNull();
  });

  it("rejects a bare prefix with no id", () => {
    expect(readIdFromClassList("sec-", SECTION_PREFIX)).toBeNull();
  });

  it("tolerates null and empty input", () => {
    expect(readIdFromClassList(null, SECTION_PREFIX)).toBeNull();
    expect(readIdFromClassList(undefined, SECTION_PREFIX)).toBeNull();
    expect(readIdFromClassList("   ", SECTION_PREFIX)).toBeNull();
  });
});

describe("setIdInClassList", () => {
  it("appends when the class list carries no id", () => {
    expect(setIdInClassList("hero dark", SECTION_PREFIX, "abc")).toBe("hero dark sec-abc");
  });

  it("replaces an existing id of the same prefix", () => {
    expect(setIdInClassList("hero sec-old dark", SECTION_PREFIX, "new")).toBe("hero dark sec-new");
  });

  it("leaves the other prefix untouched", () => {
    expect(setIdInClassList("obj-keep sec-old", SECTION_PREFIX, "new")).toBe("obj-keep sec-new");
  });

  it("produces no leading whitespace for an empty class list", () => {
    expect(setIdInClassList("", SECTION_PREFIX, "abc")).toBe("sec-abc");
    expect(setIdInClassList(null, SECTION_PREFIX, "abc")).toBe("sec-abc");
  });
});

describe("ensureIdInClassList", () => {
  it("keeps an id that already exists and does not call the generator", () => {
    let calls = 0;
    const result = ensureIdInClassList("hero sec-existing", SECTION_PREFIX, () => {
      calls++;
      return "generated";
    });
    expect(result).toEqual({ cssClass: "hero sec-existing", id: "existing" });
    expect(calls).toBe(0);
  });

  it("assigns a generated id when none is present", () => {
    expect(ensureIdInClassList("hero", SECTION_PREFIX, () => "abc")).toEqual({
      cssClass: "hero sec-abc",
      id: "abc",
    });
  });
});
