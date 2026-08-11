import {
  validateTemplateCatalog,
  validateTemplateMjml,
  type EmailTemplate,
  type TemplateCatalog,
  type TemplateValidationResult,
} from "@mjml-agent-editor/core";

import { createMjmlCompiler, type MjmlCompilerOptions } from "./mjml-compiler.js";

export interface NodeTemplateValidationOptions extends MjmlCompilerOptions {}

export function validateTemplateMjmlWithCompiler(
  mjml: string,
  options: NodeTemplateValidationOptions = {},
  templateId?: string,
): Promise<TemplateValidationResult> {
  return validateTemplateMjml(mjml, { compiler: createMjmlCompiler(options) }, templateId);
}

export function validateTemplateCatalogWithCompiler<
  TCatalog extends TemplateCatalog<EmailTemplate>,
>(
  catalog: TCatalog,
  options: NodeTemplateValidationOptions = {},
): Promise<TemplateValidationResult> {
  return validateTemplateCatalog(catalog, { compiler: createMjmlCompiler(options) });
}
