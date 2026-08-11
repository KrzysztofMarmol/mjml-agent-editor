export {
  OBJECT_PREFIX,
  SECTION_PREFIX,
  ensureIdInClassList,
  newId,
  newObjectId,
  newSectionId,
  readIdFromClassList,
  setIdInClassList,
  type IdPrefix,
} from "./ids.js";

export type {
  CommentStatus,
  CommentStore,
  CommentTarget,
  CompileResult,
  DocumentPatch,
  DocumentStore,
  EmailDocument,
  GenerateImageRequest,
  ImageProvider,
  MjmlCompiler,
  SectionComment,
} from "./ports.js";

export { LEGACY_JSON_ARGUMENT_HINT, SYSTEM_PROMPT } from "./prompt.js";

export { STARTER_MJML } from "./starter.js";

export {
  DocumentTooLargeError,
  assertDocumentSize,
  documentSizeBytes,
  type DocumentSizeLimit,
} from "./document-size.js";

export {
  findTemplate,
  isTemplateId,
  starterBody,
  templateBodies,
  validateTemplateCatalog,
  validateTemplateMjml,
  type EmailTemplate,
  type EmailTemplateMeta,
  type TemplateCatalog,
  type TemplateId,
  type TemplateValidationCode,
  type TemplateValidationIssue,
  type TemplateValidationOptions,
  type TemplateValidationResult,
} from "./templates.js";

export {
  DEFAULT_IMAGE_SIZE,
  IMAGE_SIZES,
  MUTATING_TOOLS,
  SECTION_ID_ARGUMENT,
  TOOLS,
  TOOL_LIST,
  TOOL_NAMES,
  isToolName,
  toolsAsJson,
  type ImageSize,
  type ToolDefinition,
  type ToolInputSchema,
  type ToolName,
} from "./tools.js";

export {
  MjmlDocumentError,
  ensureSectionIds,
  getSection,
  insertSection,
  listSections,
  removeSection,
  replaceSection,
  scanSections,
  type InsertSectionResult,
  type SectionSpan,
  type SectionSummary,
} from "./mjml-document.js";
