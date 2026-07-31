/**
 * The nine agent tools, ported from the spike's `agent/tools.py`.
 *
 * Names, descriptions and argument schemas are not written here — they come from
 * `@mjml-agent-editor/core`, so this file supplies behaviour only. That is what makes
 * the Python backend a second implementation of one contract rather than a fork.
 *
 * Every tool returns a plain string, matching the spike. Tool results are model input,
 * and a short sentence the model can act on beats a structured payload it has to
 * interpret — especially for failures, where the string tells it what to do next.
 */

import {
  MjmlDocumentError,
  TOOLS,
  ensureSectionIds,
  getSection,
  insertSection,
  listSections,
  removeSection,
  replaceSection,
  type CommentStore,
  type DocumentStore,
  type ImageProvider,
  type ImageSize,
  type MjmlCompiler,
  type ToolName,
} from "@mjml-agent-editor/core";
import { jsonSchema, tool } from "ai";

export interface AgentToolContext {
  /** Document every tool in this set operates on. Never taken from model input. */
  readonly documentId: string;
  readonly documents: DocumentStore;
  readonly comments: CommentStore;
  readonly images: ImageProvider;
  readonly compiler: MjmlCompiler;
}

interface SectionIdInput {
  section_id: string;
}
interface MjmlInput {
  mjml: string;
  /**
   * Required rather than optional, because every property of every tool schema is: strict
   * tool use rejects a schema whose `required` does not list them all, and
   * `agent-core/src/tools.test.ts` pins that invariant. Making the model state its intent on
   * every call is the better shape anyway.
   */
  confirm_full_rewrite: boolean;
}
interface SetSectionInput {
  section_id: string;
  mjml: string;
}
interface InsertSectionInput {
  mjml: string;
  after_section_id: string | null;
}
interface GenerateImageInput {
  prompt: string;
  size: string;
}
interface ResolveCommentInput {
  comment_id: string;
}

/**
 * The shared schema is a plain JSON Schema object; `jsonSchema` wants the library's
 * own JSONSchema7 type. The shapes agree — `src/tools.test.ts` in agent-core pins the
 * structure — so the cast is a type-system formality, not a claim about runtime.
 */
function schemaOf<Input>(name: ToolName) {
  return jsonSchema<Input>(TOOLS[name].inputSchema as never);
}

function describeError(error: unknown): string {
  if (error instanceof MjmlDocumentError) return `ERROR: ${error.message}`;
  if (error instanceof Error) return `ERROR: ${error.message}`;
  return `ERROR: ${String(error)}`;
}

export function createAgentTools(context: AgentToolContext) {
  const { documentId, documents, comments, images, compiler } = context;

  const currentMjml = async (): Promise<string> => (await documents.get(documentId)).mjml;

  /**
   * Compiles before persisting, so an invalid document is never written. The model
   * sees the compiler output and can correct itself; the spike relied on this and it
   * is the main reason the agent rarely leaves a document broken.
   */
  const saveValidated = async (mjml: string): Promise<string> => {
    const result = await compiler.compile(mjml);
    if (!result.ok) {
      return `ERROR: MJML validation failed — document was NOT saved:\n${result.errors}`;
    }
    await documents.save(documentId, { mjml });
    return "OK, saved.";
  };

  /**
   * Deletes comments left pointing at sections the document no longer contains.
   *
   * Called after the two writes that can drop a section — `set_document`, which reassigns
   * every id, and `remove_section`. `set_section` forces the target id onto its replacement
   * and `insert_section` only adds, so neither can orphan anything and neither pays for the
   * extra read.
   *
   * Not folded into `saveValidated` for that reason: it would put a comment listing on every
   * write to save work on two of them.
   */
  const pruneOrphanedComments = async (savedMjml: string): Promise<string> => {
    const live = new Set(
      listSections(savedMjml)
        .map((section) => section.sectionId)
        .filter((id): id is string => id !== null),
    );
    const orphans = (await comments.list(documentId)).filter(
      (comment) => !live.has(comment.sectionId),
    );
    if (orphans.length === 0) return "";

    // A host whose store cannot delete says so rather than leaving the caller to assume it
    // happened. Silence here is how the orphans got created in the first place.
    if (!comments.remove) {
      return ` ${orphans.length} comment(s) now point at sections that no longer exist; this host cannot delete them.`;
    }

    for (const orphan of orphans) await comments.remove(orphan.id);
    return ` Removed ${orphans.length} comment(s) whose section no longer exists.`;
  };

  return {
    get_document: tool<Record<string, never>, string>({
      description: TOOLS.get_document.description,
      inputSchema: schemaOf<Record<string, never>>("get_document"),
      execute: async () => {
        const mjml = await currentMjml();
        const sections = listSections(mjml).map((section) => ({
          section_id: section.sectionId ?? "?",
          preview: section.preview,
        }));
        return `SECTIONS: ${JSON.stringify(sections)}\n\nMJML:\n${mjml}`;
      },
    }),

    get_section: tool<SectionIdInput, string>({
      description: TOOLS.get_section.description,
      inputSchema: schemaOf<SectionIdInput>("get_section"),
      execute: async ({ section_id }) => {
        const section = getSection(await currentMjml(), section_id);
        return section ?? `ERROR: no section with id '${section_id}'`;
      },
    }),

    set_document: tool<MjmlInput, string>({
      description: TOOLS.set_document.description,
      inputSchema: schemaOf<MjmlInput>("set_document"),
      execute: async ({ mjml, confirm_full_rewrite }) => {
        if (!mjml.trim()) return "ERROR: `mjml` was empty — pass the complete document.";
        try {
          // The guard exists because `ensureSectionIds` only fills in ids that are missing;
          // it never preserves the ones the document had. A rewrite therefore renumbers
          // every section and detaches every comment — and the model reaches for this tool
          // by habit after an edit it has already saved.
          const existing = listSections(await currentMjml()).filter(
            (section) => section.sectionId !== null,
          );
          if (existing.length > 0 && confirm_full_rewrite !== true) {
            const open = (await comments.listOpen(documentId)).length;
            const ids = existing.map((section) => section.sectionId).join(", ");
            return (
              `ERROR: this document already has ${existing.length} section(s) (${ids}). ` +
              "Replacing the whole document reassigns every id and deletes the " +
              `${open} open comment(s) anchored to them. For a targeted change use ` +
              "set_section, insert_section or remove_section. If the user really asked for " +
              "the email to be rebuilt from scratch, call this again with " +
              "confirm_full_rewrite: true."
            );
          }

          const saved = ensureSectionIds(mjml);
          const result = await saveValidated(saved);
          if (!result.startsWith("OK")) return result;
          return `${result}${await pruneOrphanedComments(saved)}`;
        } catch (error) {
          return describeError(error);
        }
      },
    }),

    set_section: tool<SetSectionInput, string>({
      description: TOOLS.set_section.description,
      inputSchema: schemaOf<SetSectionInput>("set_section"),
      execute: async ({ section_id, mjml }) => {
        if (!mjml.trim()) return "ERROR: `mjml` was empty — pass one complete <mj-section>.";
        try {
          const updated = replaceSection(await currentMjml(), section_id, mjml);
          if (updated === null) return `ERROR: no section with id '${section_id}'`;
          return await saveValidated(updated);
        } catch (error) {
          return describeError(error);
        }
      },
    }),

    insert_section: tool<InsertSectionInput, string>({
      description: TOOLS.insert_section.description,
      inputSchema: schemaOf<InsertSectionInput>("insert_section"),
      execute: async ({ mjml, after_section_id }) => {
        if (!mjml.trim()) return "ERROR: `mjml` was empty — pass one complete <mj-section>.";
        try {
          const { mjml: updated, sectionId } = insertSection(
            await currentMjml(),
            mjml,
            after_section_id,
          );
          const result = await saveValidated(updated);
          return result.startsWith("OK") ? `${result} New section: ${sectionId}` : result;
        } catch (error) {
          return describeError(error);
        }
      },
    }),

    remove_section: tool<SectionIdInput, string>({
      description: TOOLS.remove_section.description,
      inputSchema: schemaOf<SectionIdInput>("remove_section"),
      execute: async ({ section_id }) => {
        const updated = removeSection(await currentMjml(), section_id);
        if (updated === null) return `ERROR: no section with id '${section_id}'`;
        const result = await saveValidated(updated);
        if (!result.startsWith("OK")) return result;
        // A section removed on request takes its comments with it — the same rule as a
        // rewrite, reached from the other direction.
        return `${result}${await pruneOrphanedComments(updated)}`;
      },
    }),

    generate_image: tool<GenerateImageInput, string>({
      description: TOOLS.generate_image.description,
      inputSchema: schemaOf<GenerateImageInput>("generate_image"),
      execute: async ({ prompt, size }) => {
        try {
          return await images.generate({ prompt, size: size as ImageSize, documentId });
        } catch (error) {
          return describeError(error);
        }
      },
    }),

    list_open_comments: tool<Record<string, never>, string>({
      description: TOOLS.list_open_comments.description,
      inputSchema: schemaOf<Record<string, never>>("list_open_comments"),
      execute: async () => {
        const open = await comments.listOpen(documentId);
        if (open.length === 0) return "No open comments.";
        return JSON.stringify(
          open.map((comment) => ({
            id: comment.id,
            section_id: comment.sectionId,
            object_id: comment.objectId,
            object_label: comment.objectLabel,
            body: comment.body,
          })),
        );
      },
    }),

    resolve_comment: tool<ResolveCommentInput, string>({
      description: TOOLS.resolve_comment.description,
      inputSchema: schemaOf<ResolveCommentInput>("resolve_comment"),
      execute: async ({ comment_id }) => {
        try {
          await comments.resolve(comment_id);
          return "OK";
        } catch (error) {
          return describeError(error);
        }
      },
    }),
  };
}

export type AgentTools = ReturnType<typeof createAgentTools>;
