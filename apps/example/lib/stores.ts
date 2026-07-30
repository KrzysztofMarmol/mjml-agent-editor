import { createCommentStore, createDocumentStore } from "@mjml-agent-editor/store-supabase";
import type { EditorStores } from "@mjml-agent-editor/editor";

import { supabase } from "./supabase";

/**
 * What the editor reads and writes, backed by Supabase from the browser.
 *
 * The same adapters serve the agent's route handler; only the client differs — anon key
 * here, service role there. Swapping Supabase out means replacing this file and nothing
 * inside the editor.
 *
 * Note this is the anon key, and the current schema grants that role full access to both
 * tables. Moving these calls behind server routes scoped to a session is Phase 4.
 */
export const editorStores: EditorStores = {
  documents: createDocumentStore(supabase),
  comments: createCommentStore(supabase),
};
