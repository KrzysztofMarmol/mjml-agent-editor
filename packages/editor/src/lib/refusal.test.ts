import { describe, expect, it } from "vitest";

import { refusal } from "./refusal.js";

/** The agent contract's refusal: a JSON body written for the visitor. */
function turnRejection(body: string): Error {
  return new Error(body);
}

/** A host store's refusal: its own exception, carrying the status it answered with. */
function storeRejection(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

describe("refusal", () => {
  it("reads the sentence out of a contract-shaped body", () => {
    expect(refusal(turnRejection('{"error":"This account has used its 25 messages."}'))).toBe(
      "This account has used its 25 messages.",
    );
  });

  it("keeps a host's own sentence when it refused on purpose", () => {
    expect(refusal(storeRejection(413, "This email is too large to save."))).toBe(
      "This email is too large to save.",
    );
  });

  it("covers every 4xx, not one status", () => {
    // The first host to need this refused with 413. Hard-coding that would have made the
    // next one — a 429 throttle, a 403 read-only switch — silently generic again.
    expect(refusal(storeRejection(429, "Too many saves."))).toBe("Too many saves.");
    expect(refusal(storeRejection(403, "This demo is read-only."))).toBe("This demo is read-only.");
  });

  it("hides a server fault, which is not a sentence for a visitor", () => {
    expect(refusal(storeRejection(500, "ECONNREFUSED 127.0.0.1:5432"))).toBeNull();
  });

  it("hides a bare failure with no status and no body", () => {
    expect(refusal(new Error("Failed to fetch"))).toBeNull();
    expect(refusal("not an error")).toBeNull();
    expect(refusal(undefined)).toBeNull();
  });

  it("falls back when the body only looks like JSON", () => {
    expect(refusal(turnRejection("{ not json"))).toBeNull();
    expect(refusal(turnRejection('{"detail":"wrong field"}'))).toBeNull();
    expect(refusal(turnRejection('{"error":"   "}'))).toBeNull();
  });

  it("prefers the body over the status when a refusal carries both", () => {
    const both = Object.assign(new Error('{"error":"The agent is still working on this email."}'), {
      status: 409,
    });
    expect(refusal(both)).toBe("The agent is still working on this email.");
  });
});
