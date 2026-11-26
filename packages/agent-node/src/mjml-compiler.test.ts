import { describe, expect, it } from "vitest";

import { createMjmlCompiler } from "./mjml-compiler.js";

const wrap = (body: string) =>
  `<mjml><mj-body><mj-section><mj-column>${body}</mj-column></mj-section></mj-body></mjml>`;

describe("createMjmlCompiler", () => {
  const compiler = createMjmlCompiler();

  it("refuses <mj-include> before mjml reads the path", () => {
    const result = compiler.compile(wrap('<mj-include path="/etc/passwd" />'));
    expect(result).toEqual({ ok: false, errors: expect.stringContaining("cannot be used") });
  });

  it("refuses the tag in any case, as mjml parses it", () => {
    const result = compiler.compile(wrap('<MJ-INCLUDE path="/etc/passwd" />'));
    expect(result).toEqual({ ok: false, errors: expect.stringContaining("cannot be used") });
  });

  it("compiles a document that only mentions the tag in escaped text", () => {
    const result = compiler.compile(wrap("<mj-text>&lt;mj-include path=&quot;x&quot;</mj-text>"));
    expect(result).toEqual({ ok: true, html: expect.stringContaining("&lt;mj-include") });
  });
});
