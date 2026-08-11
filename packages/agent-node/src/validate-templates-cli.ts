#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { EmailTemplate } from "@mjml-agent-editor/core";

import { validateTemplateCatalogWithCompiler } from "./template-validation.js";

interface CatalogModule {
  readonly default?: unknown;
  readonly TEMPLATES?: unknown;
  readonly TEMPLATE_CATALOG?: unknown;
}

async function loadTsModule(file: string): Promise<CatalogModule> {
  let ts: typeof import("typescript");
  try {
    ts = await import("typescript");
  } catch {
    throw new Error("loading .ts catalogs requires the host project to install typescript");
  }

  const source = await readFile(file, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: true,
    },
    fileName: file,
  });
  const dir = join(tmpdir(), "mjml-agent-editor-template-check");
  await mkdir(dir, { recursive: true });
  const out = join(dir, `${basename(file, extname(file))}-${Date.now()}.mjs`);
  await writeFile(out, transpiled.outputText);
  return import(pathToFileURL(out).href) as Promise<CatalogModule>;
}

async function loadModule(file: string): Promise<CatalogModule> {
  const resolved = resolve(file);
  return extname(resolved) === ".ts"
    ? loadTsModule(resolved)
    : ((await import(pathToFileURL(resolved).href)) as CatalogModule);
}

function catalogFrom(module: CatalogModule): readonly EmailTemplate[] {
  const value = module.TEMPLATES ?? module.TEMPLATE_CATALOG ?? module.default;
  if (!Array.isArray(value)) {
    throw new Error("template module must export TEMPLATES, TEMPLATE_CATALOG or a default array");
  }
  return value as readonly EmailTemplate[];
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
