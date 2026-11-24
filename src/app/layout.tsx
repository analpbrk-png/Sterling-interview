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

// Applies saved theme and admin sidebar state before first paint (no flash). Inline, no external script.
const THEME_INIT = `try{var d=document.documentElement,t=localStorage.getItem("theme");if(t==="light"||t==="dark")d.dataset.theme=t;d.dataset.sidebar=localStorage.getItem("sidebar")==="collapsed"?"collapsed":"expanded"}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${outfit.variable} ${poppins.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_INIT }} /></head>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
