import { describe, expect, it } from "vitest";

import { DocumentTooLargeError, assertDocumentSize, documentSizeBytes } from "./document-size.js";

describe("document size guard", () => {
  it("counts UTF-8 bytes", () => {
    expect(documentSizeBytes("abc")).toBe(3);
    expect(documentSizeBytes("zażółć")).toBeGreaterThan(6);
  });

  it("accepts documents at the limit", () => {
    expect(() => assertDocumentSize("abcd", { maxBytes: 4 })).not.toThrow();
  });

  it("throws a typed error when the document is too large", () => {
    expect(() => assertDocumentSize("abcde", { maxBytes: 4 })).toThrow(DocumentTooLargeError);

    try {
      assertDocumentSize("abcde", { maxBytes: 4 });
    } catch (error) {
      expect(error).toMatchObject({ bytes: 5, maxBytes: 4 });
    }
  });

  it("rejects invalid limits", () => {
    expect(() => assertDocumentSize("abc", { maxBytes: 0 })).toThrow("maxBytes");
  });
});
