import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  // Camera and microphone only for this origin; nothing else.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), display-capture=()" },
];

const nextConfig: NextConfig = {
  turbopack: { root: import.meta.dirname },
  serverExternalPackages: ["unpdf", "mammoth"],
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
