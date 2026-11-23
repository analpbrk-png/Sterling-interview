import Link from "next/link";
import { brand } from "@/config/brand";

export function BrandMark({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 font-semibold text-ink tracking-tight">
      {brand.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logoUrl} alt="" className="h-7 w-auto" />
      ) : (
        <span aria-hidden className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-accent-ink text-[13px] font-bold">
          {brand.shortName.slice(0, 1)}
        </span>
      )}
      <span className={compact ? "text-sm" : "text-[15px]"}>{brand.name}</span>
    </Link>
  );
}
