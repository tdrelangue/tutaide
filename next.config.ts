import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Demo database (lib/demo): PGlite loads its WebAssembly files from its own
  // package folder, so it must stay a plain node_modules dependency.
  serverExternalPackages: ["@electric-sql/pglite", "pglite-prisma-adapter"],
  outputFileTracingExcludes: {
    "*": [
      "src-tauri/**",
      ".next/standalone/**",
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
