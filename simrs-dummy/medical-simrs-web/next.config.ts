import type { NextConfig } from "next";

import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname, ".."),
  // Driver PG tetap require() runtime Next, jangan dibundle (graf instrumentation → prisma → pg).
  serverExternalPackages: ["@prisma/adapter-pg", "@prisma/client", "pg"],
};

export default nextConfig;
