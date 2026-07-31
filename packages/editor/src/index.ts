export {
  EditorStoreProvider,
  useCommentStore,
  useDocumentStore,
  useLabels,
  type EditorStores,
} from "./stores.js";

export { DEFAULT_LABELS, mergeLabels, type EditorLabels } from "./labels.js";

/**
 * Re-exported from `core`, where it moved so a server could import it. Kept here because
 * removing an export is a breaking change for no gain — but a route handler should reach
 * for `@mjml-agent-editor/core`, since everything in this entry point is client-only.
 */
export { STARTER_MJML } from "@mjml-agent-editor/core";

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
