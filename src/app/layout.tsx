import type { Metadata, Viewport } from "next";
import { brand } from "@/config/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: brand.tagline,
  ...(process.env.NEXT_PUBLIC_BRAND_FAVICON_URL ? { icons: { icon: process.env.NEXT_PUBLIC_BRAND_FAVICON_URL } } : {}),
  robots: { index: false, follow: false },
  // Interview links carry a secret in the URL fragment; never leak page URLs to other sites.
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0d131b" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" style={{ ["--brand-accent" as string]: brand.accent }}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
