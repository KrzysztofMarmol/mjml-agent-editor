/**
 * MJML compilation and validation, backed by the `mjml` npm package.
 *
 * Replaces the spike's `agent/mjml_compile.py`, which shelled out to
 * `web/node_modules/.bin/mjml` through a temp file. That hardcoded a path from the
 * Python service into the web app's install tree, so the agent could only run on a
 * machine that also had the frontend's `node_modules` — the single biggest obstacle
 * to deploying it anywhere. In Node the compiler is just a function call.
 */

import type { CompileResult, MjmlCompiler } from "@mjml-agent-editor/core";
import mjml2html from "mjml";

/** `mjml` throws this shape in strict mode; it is not exported as a type. */
interface MjmlErrorLike {
  formattedMessage?: string;
  message?: string;
}

interface MjmlResult {
  html: string;
  errors?: MjmlErrorLike[];
}

/**
 * `@types/mjml` declares `mjml2html` as returning a Promise. It does not — v4 is
 * synchronous and returns `{ html, json, errors }` directly (verified against
 * mjml 4.18.0). Awaiting the value would work either way, but it would also state
 * something untrue about the call, so the type is corrected here instead.
 */
const compileSync = mjml2html as unknown as (
  source: string,
  options?: { validationLevel?: "strict" | "soft" | "skip" },
) => MjmlResult;

/**
 * mjml defaults its `filePath` to `process.cwd()` and interpolates it into every
 * validation message ("Line 1 of /srv/app/packages/... (mj-bogus) — ..."). Those
 * messages go straight into the model's context and are rendered in the chat panel,
 * so the server's directory layout would leak to anyone using the demo. `filePath`
 * cannot be used to suppress it — mjml rejects a path that does not exist — so the
 * path is removed after the fact.
 */
function withoutServerPaths(message: string): string {
  return message.split(process.cwd()).join("document");
}

function describe(errors: readonly MjmlErrorLike[]): string {
  return errors
    .map((error) => withoutServerPaths(error.formattedMessage ?? error.message ?? String(error)))
    .join("\n");
}

function isErrorList(value: unknown): value is MjmlErrorLike[] {
  return Array.isArray(value) && value.length > 0;
}

export interface MjmlCompilerOptions {
  /**
   * `strict` rejects unknown tags and attributes, which is what stops the agent from
   * inventing markup that silently renders as an empty email. Loosen only if the host
   * application registers custom MJML components of its own.
   */
  readonly validationLevel?: "strict" | "soft" | "skip";
}

export function createMjmlCompiler(options: MjmlCompilerOptions = {}): MjmlCompiler {
  const validationLevel = options.validationLevel ?? "strict";

  return {
    compile(source: string): CompileResult {
      try {
        const result = compileSync(source, { validationLevel });
        if (isErrorList(result.errors)) {
          return { ok: false, errors: describe(result.errors) };
        }
        return { ok: true, html: result.html };
      } catch (error) {
        // In strict mode validation failures arrive as a thrown ValidationError
        // carrying `errors`, not as a populated `errors` array on the result.
        const thrown = error as { errors?: unknown; message?: string };
        if (isErrorList(thrown.errors)) {
          return { ok: false, errors: describe(thrown.errors) };
        }
        return { ok: false, errors: withoutServerPaths(thrown.message ?? String(error)) };
      }
    },
  };
}
