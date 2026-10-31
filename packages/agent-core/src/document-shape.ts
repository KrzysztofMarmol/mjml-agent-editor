/**
 * Whether text is an MJML document at all: an `<mjml>` root, closed, with an `<mj-body>` in it.
 *
 * Strict compilation does not settle this — `mjml` accepts a root that is never closed — and a
 * browser save is not compiled at all. Text around the root is ignored on purpose: the
 * compiler accepts a stray comment or code fence beside it and the editor keeps that through a
 * reload, so refusing it would leave a stored document the editor could never save again.
 */

export class NotMjmlDocumentError extends Error {
  constructor() {
    super(
      "not an MJML document: it needs an <mjml> root, closed with </mjml>, with an <mj-body> inside",
    );
    this.name = "NotMjmlDocumentError";
  }
}

export function isMjmlDocument(source: string): boolean {
  const text = source.toLowerCase();
  const open = text.search(/<mjml[\s>]/);
  const close = text.lastIndexOf("</mjml");
  return open >= 0 && close > open && /<mj-body[\s>/]/.test(text.slice(open, close));
}
