/**
 * Module hooks that let the CLI read a TypeScript catalog where it actually lives.
 *
 * The first version transpiled the catalog into a temp directory and imported it from
 * there, which moved it away from everything it imports: `./bodies.js` and even
 * `@mjml-agent-editor/core` stopped resolving. Only a catalog with no imports survived
 * that, and no real catalog has no imports.
 *
 * Registering hooks instead leaves the file at its own path, so relative specifiers,
 * bare specifiers and nested `.ts` modules all resolve exactly as the host's own tooling
 * resolves them. Nothing is written to disk.
 *
 * `module.register` arrived in Node 20.6, which is what sets `engines.node` for this
 * package.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

type Typescript = typeof import("typescript");

let compiler: Promise<Typescript> | undefined;

function typescript(): Promise<Typescript> {
  compiler ??= import("typescript").catch(() => {
    throw new Error("loading .ts catalogs requires the host project to install typescript");
  });
  return compiler;
}

/**
 * What TypeScript's NodeNext resolution asks authors to write, mapped back to the file on
 * disk: `./bodies.js` is `./bodies.ts`. Extensionless and directory imports are covered
 * too, because plenty of catalogs are written that way.
 */
function candidates(specifier: string): string[] {
  if (specifier.endsWith(".js")) return [`${specifier.slice(0, -3)}.ts`];
  if (specifier.endsWith(".ts")) return [];
  return [`${specifier}.ts`, `${specifier}/index.ts`];
}

interface ResolveContext {
  readonly parentURL?: string;
  readonly conditions?: readonly string[];
  readonly importAttributes?: Record<string, string>;
}

interface Resolution {
  url: string;
  format?: string | null;
  shortCircuit?: boolean;
}

/**
 * Build-time guards with nothing to run.
 *
 * A server-side catalog in a Next application very often sits behind `import "server-only"`
 * — it is how a host keeps template bodies out of the browser, which this package's own
 * README tells them to do. The specifier resolves only inside a bundler, so without this
 * the CLI would refuse precisely the catalogs that took the advice. Standing it down is
 * safe because it has no runtime behaviour: the real rule is still enforced by the host's
 * build.
 */
const BUILD_TIME_GUARDS = new Set(["server-only", "client-only"]);

export async function resolve(
  specifier: string,
  context: ResolveContext,
  next: (specifier: string, context: ResolveContext) => Promise<Resolution>,
): Promise<Resolution> {
  if (BUILD_TIME_GUARDS.has(specifier)) {
    return { url: "data:text/javascript,", format: "module", shortCircuit: true };
  }

  try {
    return await next(specifier, context);
  } catch (error) {
    // Only relative specifiers get a second guess. A bare specifier that does not resolve
    // is a missing dependency, and rewriting it would only bury the real message.
    if (!specifier.startsWith(".") && !specifier.startsWith("/")) throw error;

    for (const candidate of candidates(specifier)) {
      try {
        return await next(candidate, context);
      } catch {
        continue;
      }
    }
    throw error;
  }
}

interface LoadContext {
  readonly format?: string | null;
  readonly conditions?: readonly string[];
  readonly importAttributes?: Record<string, string>;
}

interface Loaded {
  format: string;
  source?: string | ArrayBuffer | Uint8Array;
  shortCircuit?: boolean;
}

export async function load(
  url: string,
  context: LoadContext,
  next: (url: string, context: LoadContext) => Promise<Loaded>,
): Promise<Loaded> {
  if (!url.endsWith(".ts")) return next(url, context);

  const ts = await typescript();
  const fileName = fileURLToPath(url);
  const { outputText } = ts.transpileModule(await readFile(fileName, "utf8"), {
    // Not `verbatimModuleSyntax`: a single file cannot be told which imports are types, so
    // leaving them all in makes `import { SomeType } from "…"` a runtime error about a
    // missing export. Eliding unused bindings is the forgiving reading, and the one that
    // lets a catalog be written the way TypeScript documentation writes it.
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName,
  });

  return { format: "module", source: outputText, shortCircuit: true };
}
