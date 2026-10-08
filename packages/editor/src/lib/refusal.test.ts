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

  it("hides a server fault whose body happens to look like a refusal", () => {
    // The obvious way to normalize a failure is
    // `throw Object.assign(new Error(await response.text()), { status })`, and an API that
    // answers its own faults as `{"error": "..."}` would otherwise have a 500 printed
    // verbatim. The status settles it before the body is read.
    expect(refusal(storeRejection(500, '{"error":"internal server error"}'))).toBeNull();
    expect(refusal(storeRejection(503, '{"error":"upstream unavailable"}'))).toBeNull();
  });

  it("falls back when a refusal's body is a shape we do not know", () => {
    // A 4xx says it was deliberate, but there is still no sentence in here to show.
    expect(
      refusal(storeRejection(413, '{"message":"Payload too large","requestId":"a1b2"}')),
    ).toBeNull();
    expect(refusal(storeRejection(400, "{ truncated"))).toBeNull();
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
