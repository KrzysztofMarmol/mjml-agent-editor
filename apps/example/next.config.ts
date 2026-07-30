import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Pin the tracing root to the monorepo root. Next.js infers it from the nearest lockfile
   * and will happily walk out of the repository — on a machine with a stray
   * `package-lock.json` in the home directory it picked `~`, which means file tracing (and
   * therefore a standalone build) starts from the wrong place.
   */
  outputFileTracingRoot: path.join(path.dirname(fileURLToPath(import.meta.url)), "../.."),

  /**
   * `mjml` must not be bundled. It resolves and reads its own files at import time, and
   * once the bundler rewrites those paths the module throws `EBADF: bad file descriptor`
   * while Next collects page data for `/api/chat` — a build failure with no mention of
   * mjml anywhere in the stack. Listed here it is loaded with a plain Node `require`.
   */
  serverExternalPackages: ["mjml"],
};

export default nextConfig;
