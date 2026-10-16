import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/companies/*/document": ["./public/fonts/NotoSans-Regular.ttf", "./public/fonts/NotoSans-Bold.ttf", "./public/fonts/OFL.txt"],
  },
};

export default nextConfig;
