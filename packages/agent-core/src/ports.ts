/**
 * The interfaces the editor and every agent backend depend on instead of a concrete
 * database, image service or MJML compiler.
 *
 * In the spike these boundaries did not exist: `EmailEditor.tsx` imported
 * `lib/documents.ts`, which imported the Supabase browser client, and `agent/db.py`
 * held a Supabase service-role client. Anyone adopting the editor inherited Supabase
 * whether they wanted it or not. Adapters now live in the host application; the
 * packages only know these shapes.
 *
 * Field names are camelCase here even though the spike's Postgres columns are
 * snake_case — mapping belongs in the adapter, not in the contract.
 */

import type { ImageSize } from "./tools.js";

export interface EmailDocument {
  readonly id: string;
  readonly name: string;
  /** MJML source. The single source of truth for the document's content. */
  readonly mjml: string;
  /** Opaque GrapesJS project state. Never inspected outside the editor. */
  readonly projectData: unknown;
  readonly updatedAt: string;
}

/** Fields a caller may update. Omitted fields are left untouched. */
export interface DocumentPatch {
  readonly mjml?: string;
  readonly projectData?: unknown;
  readonly name?: string;
}

export interface DocumentStore {
  get(documentId: string): Promise<EmailDocument>;
  save(documentId: string, patch: DocumentPatch): Promise<void>;
}

export type CommentStatus = "open" | "resolved";

/** What a comment points at: a section, optionally narrowed to one element inside it. */
export interface CommentTarget {
  readonly sectionId: string;
  /** `obj-<id>` of the element, or null when the comment is about the whole section. */
  readonly objectId: string | null;
  /** Human-readable element description, e.g. `Button: "Order"`. Display only. */
  readonly objectLabel: string | null;
}

export interface SectionComment extends CommentTarget {
  readonly id: string;
  readonly documentId: string;
  readonly body: string;
  readonly status: CommentStatus;
  readonly createdAt: string;
}

export interface CommentStore {
  list(documentId: string): Promise<SectionComment[]>;
  listOpen(documentId: string): Promise<SectionComment[]>;
  add(documentId: string, target: CommentTarget, body: string): Promise<void>;
  resolve(commentId: string): Promise<void>;
  /**
   * Deletes a comment outright, as opposed to `resolve`, which records that it was answered.
   *
   * Used for one thing: a comment whose section no longer exists. Marking that resolved
   * would be a lie — nobody answered it, the question evaporated — and it would pollute the
   * one list a person consults to see what was actually addressed.
   *
   * Optional, because only a store the agent is given ever needs it. A browser-side or
   * in-memory store serves the editor, which has no way to reach this; requiring it there
   * would mean writing a delete endpoint that nothing calls.
   */
  remove?(commentId: string): Promise<void>;
}

export interface GenerateImageRequest {
  readonly prompt: string;
  readonly size: ImageSize;
  /** Lets the adapter scope stored images per document for quota and cleanup. */
  readonly documentId: string;
}

export interface ImageProvider {
  /** Returns a publicly reachable URL to put into an `mj-image` src. */
  generate(request: GenerateImageRequest): Promise<string>;
}

export type CompileResult =
  { readonly ok: true; readonly html: string } | { readonly ok: false; readonly errors: string };

/**
 * Compiles and validates MJML. A port rather than a direct dependency so the agent
 * can be tested without a compiler, and so non-Node implementations can supply
 * their own (the Python backend uses Rust `mrml` bindings rather than shelling out
 * to the Node CLI, which is what tied the spike's agent to `web/node_modules`).
 */
export interface MjmlCompiler {
  compile(mjml: string): Promise<CompileResult> | CompileResult;
}
