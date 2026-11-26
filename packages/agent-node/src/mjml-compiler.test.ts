import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

  it("compiles a document that only mentions the tag in an HTML comment", () => {
    const result = compiler.compile(
      wrap("<!-- TODO: Replace <mj-include> in docs --><mj-text>Hi</mj-text>"),
    );
    expect(result).toEqual({ ok: true, html: expect.stringContaining("Hi") });
  });

  it("does not read an include the pattern misses", () => {
    // A quoted `<!--` is not a comment to mjml's parser, but it hides the tag from the pattern.
    const part = join(mkdtempSync(join(tmpdir(), "mjml-include-")), "part.mjml");
    writeFileSync(part, "<mj-text>INCLUDED_FILE</mj-text>");
    const result = compiler.compile(
      wrap(
        `<mj-text css-class="<!--">a</mj-text><mj-include path="${part}" />` +
          `<mj-text css-class="-->">b</mj-text>`,
      ),
    );
    expect(JSON.stringify(result)).not.toContain("INCLUDED_FILE");
  });
});
