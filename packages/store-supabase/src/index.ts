/**
 * Supabase implementations of the agent-core ports.
 *
 * The column names are snake_case and the contract is camelCase; that mapping lives
 * here and nowhere else. This is the whole point of the ports — swapping Supabase for
 * plain Postgres means replacing this file, not touching the editor or the agent.
 */

import type {
  CommentStore,
  CommentTarget,
  DocumentPatch,
  DocumentStore,
  EmailDocument,
  GenerateImageRequest,
  ImageProvider,
  SectionComment,
} from "@mjml-agent-editor/core";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

interface DocumentRow {
  id: string;
  name: string;
  mjml: string;
  project_data: unknown;
  updated_at: string;
}

interface CommentRow {
  id: string;
  document_id: string;
  section_id: string;
  object_id: string | null;
  object_label: string | null;
  body: string;
  status: "open" | "resolved";
  created_at: string;
}

export function createSupabaseClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

/**
 * Creates a document and returns its id.
 *
 * Deliberately not part of `DocumentStore`: the agent only ever reads and updates an
 * existing document, so giving it a create capability would widen the port for no reason.
 * Host applications and the conformance runner need it, so it lives here.
 */
export async function createDocument(
  client: SupabaseClient,
  name: string,
  mjml: string,
): Promise<string> {
  const { data, error } = await client
    .from("documents")
    .insert({ name, mjml })
    .select("id")
    .single();
  if (error) throw new Error(`document not creatable: ${error.message}`);
  return (data as { id: string }).id;
}

export async function deleteDocument(client: SupabaseClient, documentId: string): Promise<void> {
  const { error } = await client.from("documents").delete().eq("id", documentId);
  if (error) throw new Error(`document ${documentId} not deletable: ${error.message}`);
}

export function createDocumentStore(client: SupabaseClient): DocumentStore {
  return {
    async get(documentId: string): Promise<EmailDocument> {
      const { data, error } = await client
        .from("documents")
        .select("id, name, mjml, project_data, updated_at")
        .eq("id", documentId)
        .single();
      if (error) throw new Error(`document ${documentId} not readable: ${error.message}`);

      const row = data as DocumentRow;
      return {
        id: row.id,
        name: row.name,
        mjml: row.mjml,
        projectData: row.project_data,
        updatedAt: row.updated_at,
      };
    },

    async save(documentId: string, patch: DocumentPatch): Promise<void> {
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.mjml !== undefined) update["mjml"] = patch.mjml;
      if (patch.name !== undefined) update["name"] = patch.name;
      if (patch.projectData !== undefined) update["project_data"] = patch.projectData;

      const { error } = await client.from("documents").update(update).eq("id", documentId);
      if (error) throw new Error(`document ${documentId} not writable: ${error.message}`);
    },
  };
}

function toComment(row: CommentRow): SectionComment {
  return {
    id: row.id,
    documentId: row.document_id,
    sectionId: row.section_id,
    objectId: row.object_id,
    objectLabel: row.object_label,
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function createCommentStore(client: SupabaseClient): CommentStore {
  const select = "id, document_id, section_id, object_id, object_label, body, status, created_at";

  return {
    async list(documentId: string): Promise<SectionComment[]> {
      const { data, error } = await client
        .from("comments")
        .select(select)
        .eq("document_id", documentId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(`comments not readable: ${error.message}`);
      return (data as CommentRow[]).map(toComment);
    },

    async listOpen(documentId: string): Promise<SectionComment[]> {
      const { data, error } = await client
        .from("comments")
        .select(select)
        .eq("document_id", documentId)
        .eq("status", "open")
        .order("created_at", { ascending: false });
      if (error) throw new Error(`comments not readable: ${error.message}`);
      return (data as CommentRow[]).map(toComment);
    },

    async add(documentId: string, target: CommentTarget, body: string): Promise<void> {
      const { error } = await client.from("comments").insert({
        document_id: documentId,
        section_id: target.sectionId,
        object_id: target.objectId,
        object_label: target.objectLabel,
        body,
      });
      if (error) throw new Error(`comment not writable: ${error.message}`);
    },

    async resolve(commentId: string): Promise<void> {
      const { error } = await client
        .from("comments")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", commentId);
      if (error) throw new Error(`comment ${commentId} not resolvable: ${error.message}`);
    },
  };
}

/**
 * Deterministic placeholder images.
 *
 * The spike inferred placeholder mode from the *absence* of `OPENAI_API_KEY`, so a
 * misconfigured deployment silently started spending money on the most expensive call
 * in the system. Image generation is now an explicit choice: this provider never calls
 * a paid API, and a host that wants real images passes a different one.
 */
export function createPlaceholderImageProvider(): ImageProvider {
  return {
    generate(request: GenerateImageRequest): Promise<string> {
      const [width = "1536", height = "1024"] = request.size.split("x");
      // Stable per prompt, so re-running the same conversation yields the same image.
      let hash = 0;
      for (const char of request.prompt) hash = (hash * 31 + char.charCodeAt(0)) | 0;
      const seed = Math.abs(hash).toString(36);
      return Promise.resolve(`https://picsum.photos/seed/${seed}/${width}/${height}`);
    },
  };
}
