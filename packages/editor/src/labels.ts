/**
 * Every word the editor puts on screen.
 *
 * It was all inline English, which quietly made the package unusable to anyone building in
 * another language: adopting it meant forking it to translate a button. The defaults below
 * keep existing hosts working unchanged, and a host overrides only the keys it cares about.
 *
 * Flat and shallow-merged on purpose. A nested dictionary reads better and merges worse —
 * overriding one key inside a group would silently drop its siblings. The only nested maps
 * are the ones keyed by an id (`toolLabels`, `blockLabels`, `elementNames`,
 * `inspectorLabels`), and those are
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
  /** Announced after a block is added from the keyboard, with the name on its tile. */
  readonly blockAdded: (block: string) => string;
  readonly blockCategoryLayout: string;
  readonly blockCategoryContent: string;
  /** Where the host's own sections (the `blocks` prop) are listed. */
  readonly blockCategorySections: string;
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

  // Settings
  readonly groupContent: string;
  readonly groupLayout: string;
  readonly groupSpacing: string;
  readonly groupStyle: string;
  readonly groupAdvanced: string;
  readonly otherAttributes: string;
  readonly removeAttribute: string;
  readonly resetToDefault: string;
  readonly selectParent: string;
  readonly duplicate: string;
  readonly deleteElement: string;
  readonly multipleSelected: (count: number) => string;
  readonly editEachSide: string;
  readonly increase: string;
  readonly decrease: string;
  /** The unit a length is in, on the button that changes it. */
  readonly changeUnit: (unit: string) => string;
  /** How a length without a unit (a line-height multiplier) shows its unit. */
  readonly noUnit: string;
  readonly sidesVertical: string;
  readonly sidesHorizontal: string;
  readonly sideTop: string;
  readonly sideRight: string;
  readonly sideBottom: string;
  readonly sideLeft: string;
  readonly linkTypeProfile: string;
  readonly linkTypeShare: string;
  readonly allScreenSizes: string;
  readonly columnWidths: string;
  /** A section's columns, by their proportions ("1:2"). */
  readonly columnRatio: (ratio: string) => string;
  readonly socialNetworks: string;
  readonly addNetwork: string;
  readonly navbarLinks: string;
  readonly addLink: string;
  /** The text a new navigation link starts with. */
  readonly newLinkText: string;
  /**
   * Field names, help (`<key>.help`) and option names for the Settings tab, keyed as the
   * schema in `inspector/schema.ts` names them; merged key by key.
   */
  readonly inspectorLabels: Readonly<Record<string, string>>;
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
  blockAdded: (block) => `Added: ${block}`,
  blockCategoryLayout: "Layout",
  blockCategoryContent: "Content",
  blockCategorySections: "Sections",
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
    "mj-table": "Table",
  },
  expandAll: "Expand all",
  selectAnElement: "Select an element…",
  settingsEmpty: "Select something in the email to edit it.",
  emailSettings: "Email settings",
  loadingEditor: "Loading editor…",
  commentOnElement: "Comment on element / section",

  groupContent: "Content",
  groupLayout: "Layout",
  groupSpacing: "Spacing",
  groupStyle: "Style",
  groupAdvanced: "Advanced",
  otherAttributes: "Other attributes",
  removeAttribute: "Remove",
  resetToDefault: "Reset to default",
  selectParent: "Select parent",
  duplicate: "Duplicate",
  deleteElement: "Delete",
  multipleSelected: (count) => `${count} elements selected — select one to edit its settings.`,
  editEachSide: "Edit each side",
  increase: "Increase",
  decrease: "Decrease",
  changeUnit: (unit) => `Unit: ${unit}. Click to change`,
  noUnit: "×",
  sidesVertical: "Top and bottom",
  sidesHorizontal: "Left and right",
  sideTop: "Top",
  sideRight: "Right",
  sideBottom: "Bottom",
  sideLeft: "Left",
  linkTypeProfile: "Your profile",
  linkTypeShare: "Share this page",
  allScreenSizes: "Changes apply to every screen size.",
  columnWidths: "Column widths",
  columnRatio: (ratio) => `Columns ${ratio}`,
  socialNetworks: "Networks",
  addNetwork: "Add network",
  navbarLinks: "Links",
  addLink: "Add link",
  newLinkText: "Link",
  inspectorLabels: {
    // Fields
    contentWidth: "Width",
    pageBackground: "Page background",
    "pageBackground.help": "Fills the area around and behind the email.",
    fullWidth: "Full-width background",
    "fullWidth.help": "The background reaches the window edges; the content keeps the email width.",
    padding: "Padding",
    backgroundColor: "Background",
    backgroundImage: "Background image",
    backgroundSize: "Image size",
    backgroundRepeat: "Repeat image",
    backgroundPosition: "Position",
    cornerRadius: "Corners",
    gap: "Space between sections",
    border: "Border",
    alignColumns: "Align columns",
    "alignColumns.help": "Where the columns sit when they don't fill the row.",
    reverseColumns: "Reverse column order",
    "reverseColumns.help":
      "Swaps the columns on desktop; on phones they still stack in their original order.",
    verticalAlign: "Vertical",
    width: "Width",
    innerBackground: "Inner background",
    "innerBackground.help": "Fills only the area inside the padding, so it needs padding to show.",
    innerCornerRadius: "Inner corners",
    innerBorder: "Inner border",
    align: "Alignment",
    font: "Font",
    fontSize: "Text size",
    fontWeight: "Weight",
    textColor: "Text color",
    lineHeight: "Line height",
    letterSpacing: "Letter spacing",
    textTransform: "Capitalization",
    blockBackground: "Block background",
    "blockBackground.help": "Fills the whole block, including its padding.",
    link: "Link",
    buttonColor: "Button color",
    buttonPadding: "Button padding",
    "buttonPadding.help":
      "Space between the text and the button's edge; this sets the button's size.",
    spaceAround: "Space around",
    "spaceAround.help": "Empty space outside the button, between it and what is next to it.",
    opensIn: "Opens in",
    tooltip: "Tooltip",
    rel: "Link relationship",
    image: "Image",
    altText: "Alt text",
    "altText.help": "Read by screen readers and shown when images are blocked.",
    fluidOnMobile: "Full width on mobile",
    "fluidOnMobile.help":
      "On phones the image stretches across the screen, whatever its width here.",
    lineColor: "Line color",
    thickness: "Thickness",
    lineStyle: "Line style",
    height: "Height",
    socialMode: "Direction",
    iconSize: "Icon size",
    iconSpacing: "Space around each icon",
    network: "Network",
    // Brand names are the same in every language and are not keys; these two are words.
    networkWebsite: "Website",
    networkCustom: "Custom",
    customIcon: "Custom icon",
    iconColor: "Icon color",
    iconPosition: "Icon side",
    heroMode: "Sizing",
    "heroMode.help":
      "Fixed keeps the height you set; Fit image follows the background image's proportions.",
    backgroundWidth: "Image width",
    "backgroundWidth.help":
      "The background image's real size in pixels, so the hero keeps its proportions.",
    backgroundHeight: "Image height",
    fallbackColor: "Fallback color",
    "fallbackColor.help": "Shown while the image loads, or when images are blocked.",
    contentPadding: "Content padding",
    contentBackground: "Content background",
    hamburger: "Collapse into a menu on mobile",
    "hamburger.help": "On phones the links fold into a menu button.",
    menuIconColor: "Menu icon color",
    menuIconSize: "Menu icon size",
    menuIconAlign: "Menu icon align",
    baseUrl: "Link prefix",
    "baseUrl.help":
      "Added in front of every link in the bar, full addresses included, so links then give only the path.",

    // Options
    alignLeft: "Left",
    alignCenter: "Center",
    alignRight: "Right",
    alignJustify: "Justify",
    alignTop: "Top",
    alignMiddle: "Middle",
    alignBottom: "Bottom",
    weightRegular: "Regular",
    weightMedium: "Medium",
    weightSemibold: "Semibold",
    weightBold: "Bold",
    caseNone: "As typed",
    caseUpper: "UPPERCASE",
    caseLower: "lowercase",
    caseCapitalize: "Capitalize Each Word",
    targetNewTab: "New tab",
    targetSameTab: "Same tab",
    sizeCover: "Fill",
    sizeContain: "Fit",
    sizeAuto: "Original",
    repeatTile: "Tile",
    repeatOnce: "Once",
    positionTopLeft: "Top left",
    positionTopCenter: "Top",
    positionTopRight: "Top right",
    positionCenterLeft: "Left",
    positionCenter: "Center",
    positionCenterRight: "Right",
    positionBottomLeft: "Bottom left",
    positionBottomCenter: "Bottom",
    positionBottomRight: "Bottom right",
    lineSolid: "Solid",
    lineDashed: "Dashed",
    lineDotted: "Dotted",
    modeHorizontal: "In a row",
    modeVertical: "Stacked",
    heroFixed: "Fixed",
    heroFluid: "Fit image",
  },
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
    inspectorLabels: { ...DEFAULT_LABELS.inspectorLabels, ...overrides.inspectorLabels },
  };
}
