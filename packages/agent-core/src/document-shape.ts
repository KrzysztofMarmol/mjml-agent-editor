/**
 * Whether text is an MJML document at all: an `<mjml>` root, closed, with an `<mj-body>` in it.
 *
 * Strict compilation does not settle this — `mjml` accepts a root that is never closed — and a
 * browser save is not compiled at all. Text around the root is ignored on purpose: the
 * compiler accepts a stray comment or code fence beside it and the editor keeps that through a
 * reload, so refusing it would leave a stored document the editor could never save again.
 * Textual, not parsed: a closing tag inside a comment counts.
 */

export const NOT_MJML_DOCUMENT =
  "This is not an MJML document: it needs an <mjml> root, closed with </mjml>, with an <mj-body> inside.";

/** A 4xx `status`, so the editor shows the sentence instead of a generic failure. */
export class NotMjmlDocumentError extends Error {
  readonly status = 422;

  constructor() {
    super(NOT_MJML_DOCUMENT);
    this.name = "NotMjmlDocumentError";
  }
}

// HTML's whitespace spelled out: `\s` means different characters in JavaScript and Python.
export function isMjmlDocument(source: string): boolean {
  const text = source.toLowerCase();
  const open = text.search(/<mjml[\t\n\f\r >]/);
  const close = text.lastIndexOf("</mjml");
  return open >= 0 && close > open && /<mj-body[\t\n\f\r >/]/.test(text.slice(open, close));
}
