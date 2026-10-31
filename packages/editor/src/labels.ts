/**
 * Every word the editor puts on screen.
 *
 * It was all inline English, which quietly made the package unusable to anyone building in
 * another language: adopting it meant forking it to translate a button. The defaults below
 * keep existing hosts working unchanged, and a host overrides only the keys it cares about.
 *
 * Flat and shallow-merged on purpose. A nested dictionary reads better and merges worse —
 * overriding one key inside a group would silently drop its siblings. The only nested maps
 * are the ones keyed by an id (`toolLabels`, `blockLabels`, `elementNames`), and those are
 * merged key by key for exactly that reason.
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
  readonly tabBlocks: string;
  readonly tabSettings: string;
  readonly tabLayers: string;
  readonly searchBlocks: string;
  readonly noBlocksMatch: string;
  readonly blockCategoryLayout: string;
  readonly blockCategoryContent: string;
  /** Keyed by grapesjs-mjml block id (`mj-1-column`, `mj-social-group`, …); merged key by key. */
  readonly blockLabels: Readonly<Record<string, string>>;
  /** Keyed by MJML tag, for the breadcrumb; merged key by key. */
  readonly elementNames: Readonly<Record<string, string>>;
  readonly expandAll: string;
  readonly selectAnElement: string;
  readonly settingsEmpty: string;
  readonly emailSettings: string;
  readonly loadingEditor: string;
  readonly commentOnElement: string;
  readonly imageUrlField: string;
  /** @deprecated The Settings tab no longer splits attributes from style. */
  readonly attributes: string;
  /** @deprecated The Settings tab no longer splits attributes from style. */
  readonly style: string;
  readonly rteFont: string;
  readonly rteSize: string;
  readonly rteTextColor: string;
  readonly rteBackgroundColor: string;
  readonly documentLoadFailed: string;
  readonly documentSaveFailed: string;
  readonly retry: string;

  // Image picker
  readonly chooseImage: string;
  readonly imagePickerTitle: string;
  readonly imagePickerDrop: string;
  readonly imagePickerBrowse: string;
  readonly imagePickerUrlPlaceholder: string;
  readonly imagePickerUseUrl: string;
  readonly imagePickerGallery: string;
  readonly imagePickerEmpty: string;
  readonly imagePickerQuota: (used: number, limit: number) => string;
  readonly imagePickerQuotaFull: string;
  readonly imagePickerDelete: string;
  readonly imagePickerConfirmDelete: string;
  readonly imagePickerLoadFailed: string;
  readonly imageUploadFailed: string;
  readonly imageDeleteFailed: string;
  readonly imagePickerUnsupported: (fileName: string) => string;
  readonly imageFieldRemove: string;

  // Color picker
  readonly colorPickerOpen: string;
  readonly colorPickerEyedropper: string;
  readonly colorPickerDocument: string;
  readonly colorPickerPresets: string;
  readonly colorPickerTransparent: string;

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
  /** Under a turn that hit the backend's step ceiling before it could reply. */
  readonly stepLimitReached: string;
  readonly applyComments: string;
  readonly chatPlaceholder: string;
  readonly stop: string;
  readonly send: string;
  readonly chatError: string;
  /** Above the disabled composer while the host has the agent switched off. */
  readonly agentUnavailable: string;
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

  tabBlocks: "Blocks",
  tabSettings: "Settings",
  tabLayers: "Layers",
  searchBlocks: "Search blocks…",
  noBlocksMatch: "No blocks match.",
  blockCategoryLayout: "Layout",
  blockCategoryContent: "Content",
  blockLabels: {
    "mj-1-column": "1 column",
    "mj-2-columns": "2 columns",
    "mj-3-columns": "3 columns",
    "mj-text": "Text",
    "mj-image": "Image",
    "mj-button": "Button",
    "mj-divider": "Divider",
    "mj-spacer": "Spacer",
    "mj-social-group": "Social links",
    "mj-navbar": "Navigation",
  },
  elementNames: {
    "mj-wrapper": "Section group",
    "mj-section": "Section",
    "mj-column": "Column",
    "mj-group": "Column group",
    "mj-text": "Text",
    "mj-button": "Button",
    "mj-image": "Image",
    "mj-divider": "Divider",
    "mj-spacer": "Spacer",
    "mj-hero": "Hero",
    "mj-navbar": "Navigation",
    "mj-navbar-link": "Navigation link",
    "mj-social": "Social links",
    "mj-social-element": "Social link",
    "mj-raw": "Raw HTML",
  },
  expandAll: "Expand all",
  selectAnElement: "Select an element…",
  settingsEmpty: "Select something in the email to edit it.",
  emailSettings: "Email settings",
  loadingEditor: "Loading editor…",
  commentOnElement: "Comment on element / section",
  imageUrlField: "Image (URL)",
  attributes: "Attributes",
  style: "Style",
  rteFont: "Font",
  rteSize: "Size",
  rteTextColor: "Text color",
  rteBackgroundColor: "Background color",
  documentLoadFailed: "Failed to load the document.",
  documentSaveFailed: "Failed to save changes.",
  retry: "Retry",

  chooseImage: "Choose image",
  imagePickerTitle: "Choose an image",
  imagePickerDrop: "Drag images here, or",
  imagePickerBrowse: "Browse files",
  imagePickerUrlPlaceholder: "…or paste an image URL",
  imagePickerUseUrl: "Use URL",
  imagePickerGallery: "Your images",
  imagePickerEmpty: "No images yet — the ones you upload will be kept here.",
  imagePickerQuota: (used, limit) => `${used} of ${limit} uploads used`,
  imagePickerQuotaFull: "Upload limit reached — pick an image below or paste a URL.",
  imagePickerDelete: "Delete image",
  imagePickerConfirmDelete: "Click again to delete",
  imagePickerLoadFailed: "Failed to load your images.",
  imageUploadFailed: "Failed to upload the image.",
  imageDeleteFailed: "Failed to delete the image.",
  imagePickerUnsupported: (fileName) => `${fileName} is not a supported image type.`,
  imageFieldRemove: "Remove image",

  colorPickerOpen: "Pick a color",
  colorPickerEyedropper: "Pick from the screen",
  colorPickerDocument: "In this email",
  colorPickerPresets: "Presets",
  colorPickerTransparent: "Transparent",

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
  stepLimitReached: "The agent ran out of steps for this turn. Ask it to continue.",
  applyComments: "Apply changes from comments",
  chatPlaceholder: "Describe what you want to change… (Enter = send, Shift+Enter = new line)",
  stop: "Stop",
  send: "Send",
  chatError: "Agent chat error.",
  agentUnavailable:
    "The agent is unavailable right now. You can still edit the email and leave comments.",

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
 * Overrides on top of the defaults. The maps merge rather than replace, so a host renaming
 * one step does not lose the other eight.
 */
export function mergeLabels(overrides?: Partial<EditorLabels>): EditorLabels {
  if (!overrides) return DEFAULT_LABELS;
  return {
    ...DEFAULT_LABELS,
    ...overrides,
    toolLabels: { ...DEFAULT_LABELS.toolLabels, ...overrides.toolLabels },
    blockLabels: { ...DEFAULT_LABELS.blockLabels, ...overrides.blockLabels },
    elementNames: { ...DEFAULT_LABELS.elementNames, ...overrides.elementNames },
  };
}
