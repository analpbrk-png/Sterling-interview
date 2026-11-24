import type { Metadata, Viewport } from "next";
import { Outfit, Poppins } from "next/font/google";
import { brand } from "@/config/brand";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-outfit", display: "swap" });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-poppins", display: "swap" });

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
    { media: "(prefers-color-scheme: light)", color: "#faf8f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0c09" },
  ],
};

// Applies a saved light/dark choice before first paint (no flash). Inline, no external script.
const THEME_INIT = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${outfit.variable} ${poppins.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_INIT }} /></head>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
