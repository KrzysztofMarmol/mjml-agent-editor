export {
  EditorStoreProvider,
  useCommentStore,
  useDocumentStore,
  type EditorStores,
} from "./stores.js";

export { STARTER_MJML } from "./starter.js";

export { default as EditorHeader } from "./components/editor/EditorHeader.js";
export { default as ChatPanel } from "./components/chat/ChatPanel.js";
export { default as CanvasComments } from "./components/comments/CanvasComments.js";
export { Markdown } from "./components/chat/Markdown.js";

// Types only — erased at build time, so this does not pull the canvas in.
export type { EditorApi, EditorState, SaveStatus } from "./components/editor/EmailEditor.js";

export type {
  CommentStore,
  CommentTarget,
  DocumentPatch,
  DocumentStore,
  EmailDocument,
  SectionComment,
} from "@mjml-agent-editor/core";
