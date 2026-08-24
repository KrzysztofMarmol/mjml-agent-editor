/**
 * A host, in miniature: register the loader by its public specifier, then import a
 * TypeScript catalog. If `./ts-loader` is not exported, this fails at `register` — which is
 * exactly the failure the test is here to catch.
 */
import { register } from "node:module";

register("@mjml-agent-editor/agent-node/ts-loader", import.meta.url);

const { TEMPLATES } = await import("./catalog-with-import.ts");

console.log(`${TEMPLATES.length} loaded`);
