/**
 * Document listing and creation — the parts the editor does not own.
 *
 * Reading and writing a single document, and everything about comments, moved behind the
 * `DocumentStore`/`CommentStore` ports (`lib/stores.ts`). What remains here is the
 * application's own concern: the index page.
 */

import { STARTER_MJML } from "@mjml-agent-editor/editor";
import { createDocument as insertDocument } from "@mjml-agent-editor/store-supabase";

import { supabase } from "./supabase";

export interface DocumentSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export async function listDocuments(): Promise<DocumentSummary[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, name, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;

  return (data as { id: string; name: string; updated_at: string }[]).map((row) => ({
    id: row.id,
    name: row.name,
    updatedAt: row.updated_at,
  }));
}

export function createDocument(name: string): Promise<string> {
  return insertDocument(supabase, name, STARTER_MJML);
}
