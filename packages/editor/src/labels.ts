/**
 * Every word the editor puts on screen.
 *
 * It was all inline English, which quietly made the package unusable to anyone building in
 * another language: adopting it meant forking it to translate a button. The defaults below
 * keep existing hosts working unchanged, and a host overrides only the keys it cares about.
 *
 * Flat and shallow-merged on purpose. A nested dictionary reads better and merges worse —
 * overriding one key inside a group would silently drop its siblings. `toolLabels` is the
 * single nested map, and it is merged key by key for exactly that reason.
 *
 * Values that interpolate are functions rather than templates with placeholders, so the
 * translator controls word order instead of the format string.
 */

export interface EditorLabels {
  // Header
  readonly appName: string;
  readonly emailNameAria: string;
  readonly renameFailed: string;
  readonly saving: string;
  readonly saved: string;
  readonly saveFailed: string;
  readonly undo: string;
  readonly redo: string;
  readonly contentWidth: string;
  readonly preview: string;
  readonly closePreview: string;
  readonly previewFrameTitle: string;
  readonly sourceCode: string;
  readonly exportHtml: string;
  readonly exportMjml: string;
  /** `kind` is already upper-cased ("MJML", "HTML"). */
  readonly copied: (kind: string) => string;

  // Canvas
  readonly searchBlocks: string;
  readonly expandAll: string;
  readonly selectAnElement: string;
  readonly attributes: string;
  readonly style: string;
  readonly rteFont: string;
  readonly rteSize: string;
  readonly rteTextColor: string;
  readonly rteBackgroundColor: string;
  readonly documentLoadFailed: string;
  readonly documentSaveFailed: string;

  // Comments
  readonly commentOnSection: string;
  readonly closeComments: string;
  readonly noCommentsYet: string;
  readonly resolveComment: string;
  readonly addComment: string;
  readonly addCommentPlaceholder: string;

  // Chat
  readonly chatEmptyTitle: string;
  readonly chatEmptyDescription: string;
  readonly agentWorking: string;
  readonly reasoning: string;
  readonly completedSteps: (count: number, failed: number) => string;
  readonly applyComments: string;
  readonly chatPlaceholder: string;
  readonly stop: string;
  readonly send: string;
  readonly chatError: string;
  /** Keyed by tool name; merged key by key rather than replaced wholesale. */
  readonly toolLabels: Readonly<Record<string, string>>;
}

export const DEFAULT_LABELS: EditorLabels = {
  appName: "MJML Editor",
  emailNameAria: "Email name",
  renameFailed: "Failed to rename.",
  saving: "Saving…",
  saved: "Saved",
  saveFailed: "Save failed",
  undo: "Undo",
  redo: "Redo",
  contentWidth: "Content width",
  preview: "Preview",
  closePreview: "Close preview",
  previewFrameTitle: "Email preview",
  sourceCode: "Source code",
  exportHtml: "Export HTML",
  exportMjml: "Export MJML",
  copied: (kind) => `${kind} copied.`,

  searchBlocks: "Search blocks…",
  expandAll: "Expand all",
  selectAnElement: "Select an element…",
  attributes: "Attributes",
  style: "Style",
  rteFont: "Font",
  rteSize: "Size",
  rteTextColor: "Text color",
  rteBackgroundColor: "Background color",
  documentLoadFailed: "Failed to load the document.",
  documentSaveFailed: "Failed to save changes.",

  commentOnSection: "Comment on the whole section",
  closeComments: "Close",
  noCommentsYet: "No comments yet — add the first one.",
  resolveComment: "Resolve",
  addComment: "Add",
  addCommentPlaceholder: "Add a comment… (⌘/Ctrl+Enter to send)",

  chatEmptyTitle: "Start a conversation with the agent",
  chatEmptyDescription:
    "Describe the email (goal, tone, content) and paste your data — the agent will design the sections and images.",
  agentWorking: "Agent is working…",
  reasoning: "Reasoning",
  completedSteps: (count, failed) =>
    failed > 0 ? `Completed steps (${count}, ${failed} failed)` : `Completed steps (${count})`,
  applyComments: "Apply changes from comments",
  chatPlaceholder: "Describe what you want to change… (Enter = send, Shift+Enter = new line)",
  stop: "Stop",
  send: "Send",
  chatError: "Agent chat error.",

  toolLabels: {
    get_document: "Reading document",
    get_section: "Reading section",
    set_document: "Saving whole email",
    set_section: "Replacing section",
    insert_section: "Adding section",
    remove_section: "Removing section",
    generate_image: "Generating image",
    list_open_comments: "Reading comments",
    resolve_comment: "Resolving comment",
  },
};

/**
 * Overrides on top of the defaults. `toolLabels` merges rather than replaces, so a host
 * renaming one step does not lose the other eight.
 */
export function mergeLabels(overrides?: Partial<EditorLabels>): EditorLabels {
  if (!overrides) return DEFAULT_LABELS;
  return {
    ...DEFAULT_LABELS,
    ...overrides,
    toolLabels: { ...DEFAULT_LABELS.toolLabels, ...overrides.toolLabels },
  };
}
