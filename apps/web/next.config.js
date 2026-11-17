import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  // Keep the development badge from covering mobile form and footer actions.
  devIndicators: false,
};

export default nextConfig;
