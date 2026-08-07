import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * firebase-admin pulls ESM-only deps (jose via jwks-rsa). Bundling it into
   * Vercel's serverless functions breaks with ERR_REQUIRE_ESM; keeping it
   * external lets the runtime require() it from node_modules instead.
   */
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
