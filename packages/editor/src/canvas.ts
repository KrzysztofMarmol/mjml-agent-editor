/**
 * The GrapesJS canvas, isolated in its own entry point.
 *
 * GrapesJS touches `window` when it is imported, so this module can only be loaded in the
 * browser. Hosts should reach it through a client-only dynamic import — in Next.js that
 * is `dynamic(() => import("@mjml-agent-editor/editor/canvas"), { ssr: false })`.
 */

export { default as EmailEditor } from "./components/editor/EmailEditor.js";
export type { EditorApi, EditorState, SaveStatus } from "./components/editor/EmailEditor.js";
