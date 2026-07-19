import { supabase } from "./supabase";

export type EmailDocument = {
  id: string;
  name: string;
  mjml: string;
  project_data: unknown;
  updated_at: string;
};

export type SectionComment = {
  id: string;
  document_id: string;
  section_id: string;
  body: string;
  status: "open" | "resolved";
  created_at: string;
};

export const STARTER_MJML = `<mjml>
  <mj-body background-color="#f4f4f5">
    <mj-section background-color="#ffffff" padding="32px 24px">
      <mj-column>
        <mj-text font-size="22px" font-weight="bold">Nowy mail</mj-text>
        <mj-text color="#555555">
          Opisz w czacie po prawej, jakiego maila potrzebujesz — agent
          zaprojektuje sekcje, treści i obrazy.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

export async function listDocuments(): Promise<EmailDocument[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, name, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data as EmailDocument[];
}

export async function createDocument(name: string): Promise<string> {
  const { data, error } = await supabase
    .from("documents")
    .insert({ name, mjml: STARTER_MJML })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function getDocument(id: string): Promise<EmailDocument> {
  const { data, error } = await supabase.from("documents").select("*").eq("id", id).single();
  if (error) throw error;
  return data as EmailDocument;
}

export async function updateDocument(
  id: string,
  patch: { mjml?: string; project_data?: unknown; name?: string },
): Promise<void> {
  const { error } = await supabase
    .from("documents")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function listComments(documentId: string): Promise<SectionComment[]> {
  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as SectionComment[];
}

export async function addComment(documentId: string, sectionId: string, body: string): Promise<void> {
  const { error } = await supabase
    .from("comments")
    .insert({ document_id: documentId, section_id: sectionId, body });
  if (error) throw error;
}

export async function resolveComment(id: string): Promise<void> {
  const { error } = await supabase
    .from("comments")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
