import { defineConfig } from "tsup";

const external = ["mjml", "ai", "@ai-sdk/anthropic", "typescript"];

/**
 * Two builds, because the library and the executables want different things.
 *
 * The library ships both module systems, since a host's build can want either. The CLI and
 * its loader are ESM only: they are run by Node directly, `module.register` takes a URL
 * built from `import.meta.url`, and a CJS copy of that is not merely unused — it is a file
 * where `import.meta` is empty and the loader silently cannot be found.
 */
export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    sourcemap: true,
    target: "es2022",
    external,
  },
  {
    entry: ["src/validate-templates-cli.ts", "src/ts-loader.ts"],
    format: ["esm"],
    // No declarations: nothing imports these, they are entry points for Node.
    dts: false,
    clean: false,
    sourcemap: true,
    target: "es2022",
    external,
  },
]);
