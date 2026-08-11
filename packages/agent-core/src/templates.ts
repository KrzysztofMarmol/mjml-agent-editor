import type { MjmlCompiler } from "./ports.js";
import { STARTER_MJML } from "./starter.js";
import { scanSections } from "./mjml-document.js";

export interface EmailTemplateMeta<TId extends string = string> {
  readonly id: TId;
  readonly name: string;
  readonly category: string;
  readonly blurb: string;
  readonly featured?: boolean;
}

export interface EmailTemplate<TId extends string = string> extends EmailTemplateMeta<TId> {
  readonly mjml: string;
}

export type TemplateCatalog<TTemplate extends EmailTemplate = EmailTemplate> = readonly TTemplate[];

export type TemplateId<TCatalog extends TemplateCatalog> = TCatalog[number]["id"];

export function isTemplateId<TCatalog extends TemplateCatalog>(
  catalog: TCatalog,
  value: unknown,
): value is TemplateId<TCatalog> {
  return typeof value === "string" && catalog.some((template) => template.id === value);
}

export function findTemplate<TCatalog extends TemplateCatalog>(
  catalog: TCatalog,
  id: string,
): TCatalog[number] | undefined {
  return catalog.find((template) => template.id === id);
}

export function starterBody<TCatalog extends TemplateCatalog>(
  catalog: TCatalog,
  id?: TemplateId<TCatalog>,
  fallback = STARTER_MJML,
): string {
  if (id === undefined) return fallback;
  return findTemplate(catalog, id)?.mjml ?? fallback;
}

export function templateBodies<TCatalog extends TemplateCatalog>(
  catalog: TCatalog,
): Record<TemplateId<TCatalog>, string> {
  return Object.fromEntries(catalog.map((template) => [template.id, template.mjml])) as Record<
    TemplateId<TCatalog>,
    string
  >;
}

export type TemplateValidationCode =
  "duplicate-id" | "invalid-mjml" | "banned-tag" | "handwritten-id" | "section-scan-mismatch";

export interface TemplateValidationIssue {
  readonly code: TemplateValidationCode;
  readonly message: string;
  readonly templateId?: string;
}

export type TemplateValidationResult =
  | { readonly ok: true; readonly issues: readonly [] }
  | { readonly ok: false; readonly issues: readonly TemplateValidationIssue[] };

export interface TemplateValidationOptions {
  readonly compiler?: MjmlCompiler;
}

const BANNED_TAGS = ["mj-hero", "mj-wrapper", "mj-table", "mj-head"] as const;

function result(issues: TemplateValidationIssue[]): TemplateValidationResult {
  return issues.length === 0 ? { ok: true, issues: [] } : { ok: false, issues };
}

function issue(
  code: TemplateValidationCode,
  message: string,
  templateId?: string,
): TemplateValidationIssue {
  return templateId === undefined ? { code, message } : { code, message, templateId };
}

function writtenSectionCount(mjml: string): number {
  return (mjml.match(/<mj-section\b/gi) ?? []).length;
}

async function compileIssue(
  mjml: string,
  compiler: MjmlCompiler | undefined,
  templateId: string | undefined,
): Promise<TemplateValidationIssue | null> {
  if (!compiler) return null;
  const compiled = await compiler.compile(mjml);
  return compiled.ok
    ? null
    : issue("invalid-mjml", `MJML did not compile: ${compiled.errors}`, templateId);
}

export async function validateTemplateMjml(
  mjml: string,
  options: TemplateValidationOptions = {},
  templateId?: string,
): Promise<TemplateValidationResult> {
  const issues: TemplateValidationIssue[] = [];
  const compiled = await compileIssue(mjml, options.compiler, templateId);
  if (compiled) issues.push(compiled);

  for (const tag of BANNED_TAGS) {
    if (new RegExp(`<${tag}\\b`, "i").test(mjml)) {
      issues.push(
        issue("banned-tag", `<${tag}> is not supported in editable templates`, templateId),
      );
    }
  }

  if (/css-class\s*=\s*(["'])[\s\S]*?\b(?:sec|obj)-[a-z0-9]+\b[\s\S]*?\1/i.test(mjml)) {
    issues.push(
      issue("handwritten-id", "template ships a handwritten sec-* or obj-* id", templateId),
    );
  }

  const written = writtenSectionCount(mjml);
  const scanned = scanSections(mjml).length;
  if (written !== scanned) {
    issues.push(
      issue(
        "section-scan-mismatch",
        `template has ${written} <mj-section> tag(s), but scanSections found ${scanned}`,
        templateId,
      ),
    );
  }

  return result(issues);
}

export async function validateTemplateCatalog<TCatalog extends TemplateCatalog>(
  catalog: TCatalog,
  options: TemplateValidationOptions = {},
): Promise<TemplateValidationResult> {
  const issues: TemplateValidationIssue[] = [];
  const seen = new Set<string>();

  for (const template of catalog) {
    if (seen.has(template.id)) {
      issues.push(issue("duplicate-id", `duplicate template id "${template.id}"`, template.id));
    }
    seen.add(template.id);

    const validated = await validateTemplateMjml(template.mjml, options, template.id);
    if (!validated.ok) issues.push(...validated.issues);
  }

  return result(issues);
}
