import { describe, expect, it } from "vitest";

import { addedUnsafeLinks, isSafeLink, unsafeLinks } from "./links.js";

const email = (column: string) =>
  `<mjml><mj-body><mj-section css-class="sec-a"><mj-column>${column}</mj-column></mj-section></mj-body></mjml>`;

describe("isSafeLink", () => {
  it("takes web, mail and phone links, relative ones and merge tags", () => {
    for (const link of [
      "https://a.com",
      "mailto:a@b.c",
      "tel:+48123",
      "/x",
      "{{url}}",
      "#top",
      "",
    ]) {
      expect(isSafeLink(link), link).toBe(true);
    }
  });

  it("refuses a script however a browser would still read it as one", () => {
    for (const link of [
      "javascript:alert(1)",
      " java\tscript:x",
      "&#106;avascript:x",
      "vbscript:x",
    ]) {
      expect(isSafeLink(link), link).toBe(false);
    }
  });
});

describe("unsafeLinks", () => {
  it("finds them on elements and inside a text's HTML, in any quoting", () => {
    const mjml = email(
      `<mj-button href='javascript:a()'>Go</mj-button>` +
        `<mj-text><a href="data:text/html,x">x</a><a/href=vbscript:y>y</a></mj-text>` +
        `<mj-image src="https://a.com/i.png" href="https://a.com"></mj-image>`,
    );
    expect(unsafeLinks(mjml)).toEqual(["javascript:a()", "data:text/html,x", "vbscript:y"]);
  });

  it("joins a navigation bar's base URL to each of its links", () => {
    const mjml = email(
      `<mj-navbar base-url="javascript"><mj-navbar-link href=":alert(1)">A</mj-navbar-link></mj-navbar>`,
    );
    expect(unsafeLinks(mjml)).toEqual(["javascript:alert(1)"]);
  });

  it("ignores a link inside a comment and a text that only mentions one", () => {
    const mjml = email(
      `<!-- <a href="javascript:x"> --><mj-text>Never write href=javascript:x</mj-text>`,
    );
    expect(unsafeLinks(mjml)).toEqual([]);
  });
});

describe("addedUnsafeLinks", () => {
  it("refuses only links the write adds", () => {
    const before = email(`<mj-button href="javascript:old()">Old</mj-button>`);
    expect(addedUnsafeLinks(before, before.replace("Old", "Older"))).toEqual([]);
    const after = before.replace(
      "</mj-column>",
      `<mj-button href="javascript:old()">Two</mj-button></mj-column>`,
    );
    expect(addedUnsafeLinks(before, after)).toEqual(["javascript:old()"]);
  });
});
