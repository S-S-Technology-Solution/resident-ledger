import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // RHB statement PDFs run to about 750 KB, close to the 1 MB default.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
