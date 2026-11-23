import type { NextConfig } from "next";

/**
 * Static export for GitHub Pages. NEXT_PUBLIC_BASE_PATH is the repository
 * path ("/Sterling-interview") on github.io, or empty for a custom domain.
 * There is no server: data access is protected by Supabase RLS, and secret
 * work (AI, session building) runs in Supabase Edge Functions.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
