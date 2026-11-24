import Link from "next/link";
import { brand } from "@/config/brand";
import { cx } from "@/components/ui";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
/** Intrinsic size of public/brand/sterling-logo.webp (the original Sterling logo). */
const LOGO_W = 2000;
const LOGO_H = 717;

/**
 * The original Sterling logo, unmodified. Width is set; height follows the
 * file's own aspect ratio. Its pale gold needs a dark ground, so in light
 * mode it sits on an ink plate (see .sterling-logo in globals.css); it is never recoloured.
 */
export function SterlingLogo({ width = 140, className, alt = "Sterling Study Abroad" }: { width?: number; className?: string; alt?: string }) {
  return (
    <span className={cx("sterling-logo", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${BASE_PATH}/brand/sterling-logo.webp`} alt={alt} width={LOGO_W} height={LOGO_H} style={{ width, height: "auto" }} decoding="async" />
    </span>
  );
}

export function BrandMark({ href = "/", compact = false, label = true }: { href?: string; compact?: boolean; label?: boolean }) {
  return (
    <Link href={href} className="inline-flex items-center gap-3 min-w-0" aria-label={`${brand.name} home`}>
      <SterlingLogo width={compact ? 112 : 136} alt="" />
      {label && (
        <span className="hidden sm:inline-flex items-center gap-3 min-w-0">
          <span aria-hidden className="h-6 w-px bg-line-strong" />
          <span className="font-display text-[13px] font-medium text-ink-2 tracking-wide uppercase truncate">{brand.shortName}</span>
        </span>
      )}
    </Link>
  );
}
