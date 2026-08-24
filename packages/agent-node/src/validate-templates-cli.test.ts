/**
 * The CLI is exercised as a real subprocess, not by importing its parts.
 *
 * What is under test is module resolution — whether a catalog's own imports still work
 * once the loader has had its way with them. Vitest resolves modules itself, so calling
 * the loader from inside a test would prove nothing about how Node behaves. That is why
 * this runs the built binary and why `test` depends on `build`.
 */
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "dist", "validate-templates-cli.js");
const fixture = (name: string) => join(here, "__fixtures__", name);

async function validate(file: string): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [cli, file]);
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

describe("validate-templates CLI", () => {
  it("loads a TypeScript catalog that imports its bodies from a sibling module", async () => {
    const result = await validate(fixture("catalog-with-import.ts"));
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("1 template(s) OK");
    expect(result.code).toBe(0);
  }, 30_000);

  it("loads a catalog kept behind server-only", async () => {
    const result = await validate(fixture("catalog-server-only.ts"));
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("1 template(s) OK");
    expect(result.code).toBe(0);
  }, 30_000);

  it("reports a template problem and exits non-zero", async () => {
    const result = await validate(fixture("catalog-banned-tag.ts"));
    expect(result.stderr).toContain("<mj-hero> is not supported");
    expect(result.code).toBe(1);
  }, 30_000);

  /**
   * The loader is public API, not the binary's private helper. A host with rules of its own
   * on top of the package's — an image host, an accessibility floor, a font list — has to
   * load the same catalog itself, and reaching into `dist/` past the exports map is not an
   * answer. This fails at `register` if the subpath is not exported.
   */
  it("is registerable by a host through the package's own specifier", async () => {
    const { stdout, stderr } = await run(process.execPath, [
      fixture("register-loader-harness.mjs"),
    ]);
    expect(stderr).toBe("");
    expect(stdout).toContain("1 loaded");
  }, 30_000);
});
