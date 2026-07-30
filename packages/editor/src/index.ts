export {
  EditorStoreProvider,
  useCommentStore,
  useDocumentStore,
  type EditorStores,
} from "./stores.js";

export { STARTER_MJML } from "./starter.js";

// Re-exported so hosts wiring adapters do not need a second import for the shapes.
export type {
  CommentStore,
  CommentTarget,
  DocumentPatch,
  DocumentStore,
  EmailDocument,
  SectionComment,
} from "@mjml-agent-editor/core";
