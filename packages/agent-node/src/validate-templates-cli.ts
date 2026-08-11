#!/usr/bin/env node

import { register } from "node:module";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { TemplateEntry } from "@mjml-agent-editor/core";

import { validateTemplateCatalogWithCompiler } from "./template-validation.js";

interface CatalogModule {
  readonly default?: unknown;
  readonly TEMPLATES?: unknown;
  readonly TEMPLATE_CATALOG?: unknown;
}

async function loadModule(file: string): Promise<CatalogModule> {
  const resolved = resolve(file);
  // Registered before the import and only when it is needed: a `.js` catalog resolves on
  // its own, and hooks it does not need are hooks that can only get in the way.
  if (extname(resolved) === ".ts") register(new URL("./ts-loader.js", import.meta.url));
  return (await import(pathToFileURL(resolved).href)) as CatalogModule;
}

function catalogFrom(module: CatalogModule): readonly TemplateEntry[] {
  const value = module.TEMPLATES ?? module.TEMPLATE_CATALOG ?? module.default;
  if (!Array.isArray(value)) {
    throw new Error("template module must export TEMPLATES, TEMPLATE_CATALOG or a default array");
  }
  return value as readonly TemplateEntry[];
}

async function main(argv: readonly string[]): Promise<number> {
  const file = argv[2];
  if (!file || argv.includes("--help") || argv.includes("-h")) {
    console.error("Usage: mjml-agent-editor-validate-templates <catalog.js|catalog.ts>");
    return file ? 0 : 1;
  }

  const catalog = catalogFrom(await loadModule(file));
  const result = await validateTemplateCatalogWithCompiler(catalog, { validationLevel: "strict" });
  if (result.ok) {
    console.log(`${catalog.length} template(s) OK`);
    return 0;
  }

  console.error(`${result.issues.length} template problem(s):`);
  for (const issue of result.issues) {
    const prefix = issue.templateId ? `${issue.templateId}: ` : "";
    console.error(`- ${prefix}${issue.message}`);
  }
  return 1;
}

main(process.argv)
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
