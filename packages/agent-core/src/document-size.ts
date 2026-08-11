/**
 * A host-controlled guard for how large one MJML document may become.
 *
 * The packages do not choose a default quota: a public demo, an internal tool and a
 * self-hosted editor all have different storage and model-budget tradeoffs. What belongs
 * here is the shared error type and the byte-counting rule, so adapters can reject the
 * same way whether a save came from the browser or from the agent.
 */

export interface DocumentSizeLimit {
  readonly maxBytes: number;
}

export class DocumentTooLargeError extends Error {
  constructor(
    readonly bytes: number,
    readonly maxBytes: number,
  ) {
    super(
      `document is ${Math.round(bytes / 1024)} KB, past the ${Math.round(
        maxBytes / 1024,
      )} KB limit`,
    );
    this.name = "DocumentTooLargeError";
  }
}

export function documentSizeBytes(mjml: string): number {
  return new TextEncoder().encode(mjml).byteLength;
}

export function assertDocumentSize(mjml: string, limit: DocumentSizeLimit): void {
  if (!Number.isInteger(limit.maxBytes) || limit.maxBytes <= 0) {
    throw new Error("maxBytes must be a positive integer");
  }

  const bytes = documentSizeBytes(mjml);
  if (bytes > limit.maxBytes) throw new DocumentTooLargeError(bytes, limit.maxBytes);
}
