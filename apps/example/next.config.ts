import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `mjml` must not be bundled. It resolves and reads its own files at import time, and
   * once the bundler rewrites those paths the module throws `EBADF: bad file descriptor`
   * while Next collects page data for `/api/chat` — a build failure with no mention of
   * mjml anywhere in the stack. Listed here it is loaded with a plain Node `require`.
   */
  serverExternalPackages: ["mjml"],
};

export default nextConfig;
