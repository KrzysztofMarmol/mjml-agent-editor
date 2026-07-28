/**
 * Writes the tool contract to `contract/tools.json` so non-TypeScript implementations
 * (the FastAPI backend) can consume the same definitions instead of re-declaring them.
 *
 * Run via `pnpm build`. `src/tools.test.ts` fails if the committed file drifts from
 * the TypeScript source, so the JSON can never silently go stale.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { toolsAsJson } from "../dist/index.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(packageRoot, "contract", "tools.json");

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(toolsAsJson(), null, 2)}\n`, "utf8");

console.log(`contract written: ${target}`);
