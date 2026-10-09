import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node environment on purpose: what is tested here is the pure logic the components
    // delegate to, not the components. Rendering a GrapesJS canvas in jsdom costs a setup
    // file, a browser shim and a slow suite to assert what a function already decides.
    include: ["src/**/*.test.ts"],
  },
});
