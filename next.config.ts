import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: projectRoot,
  serverExternalPackages: ["exceljs", "mongoose", "read-excel-file", "write-excel-file"],
  images: {
    qualities: [75, 92],
  },
};

export default nextConfig;
