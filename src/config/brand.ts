/**
 * Brand settings come from environment variables so the product can be renamed
 * without code changes. NEXT_PUBLIC_* values are public by design.
 */
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "AI Interview Prep",
  shortName: process.env.NEXT_PUBLIC_BRAND_SHORT_NAME || process.env.NEXT_PUBLIC_BRAND_NAME || "Interview Prep",
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE || "Practise your study-abroad credibility interview",
  logoUrl: process.env.NEXT_PUBLIC_BRAND_LOGO_URL || null,
  faviconUrl: process.env.NEXT_PUBLIC_BRAND_FAVICON_URL || "/icon.svg",
  /** Accent colour (hex). Defaults to a calm teal. */
  accent: process.env.NEXT_PUBLIC_BRAND_ACCENT || "#0f8f86",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || null,
};

export const DISCLAIMER =
  "Independent practice tool. Not an official university interview, admissions decision or identity verification service.";
