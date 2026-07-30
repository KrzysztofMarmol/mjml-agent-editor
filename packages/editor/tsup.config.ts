import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/ui.ts", "src/canvas.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  external: ["react", "react-dom"],
  /**
   * Everything here runs in the browser (GrapesJS touches `window` at import time), and
   * bundlers drop per-file directives. Without this the host gets "You're importing a
   * component that needs useContext" from the React Server Components boundary.
   */
  banner: { js: '"use client";' },
});
