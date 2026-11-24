"use client";
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cx } from "@/components/ui";

type Theme = "system" | "light" | "dark";

function apply(t: Theme) {
  const el = document.documentElement;
  if (t === "system") delete el.dataset.theme;
  else el.dataset.theme = t;
  try { if (t === "system") localStorage.removeItem("theme"); else localStorage.setItem("theme", t); } catch { /* storage blocked */ }
}

/** Light / dark / system switch. The choice is stored per device. */
export function ThemeToggle({ className, tone = "default" }: { className?: string; tone?: "default" | "sidebar" }) {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    try { const t = localStorage.getItem("theme"); if (t === "light" || t === "dark") setTheme(t); } catch { /* ignore */ }
  }, []);
  const opts: Array<[Theme, typeof Sun, string]> = [["light", Sun, "Light"], ["dark", Moon, "Dark"], ["system", Monitor, "System"]];
  return (
    <div role="radiogroup" aria-label="Colour theme" className={cx("inline-flex rounded-xl p-1 gap-0.5", tone === "sidebar" ? "bg-white/5" : "bg-surface-2 border border-line", className)}>
      {opts.map(([v, Icon, label]) => (
        <button
          key={v} type="button" role="radio" aria-checked={theme === v} aria-label={label} title={label}
          onClick={() => { setTheme(v); apply(v); }}
          className={cx(
            "grid h-7 w-8 place-items-center rounded-lg transition [&_svg]:size-3.5",
            tone === "sidebar"
              ? theme === v ? "bg-white/12 text-sidebar-ink" : "text-sidebar-muted hover:text-sidebar-ink"
              : theme === v ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
          )}
        >
          <Icon strokeWidth={2} />
        </button>
      ))}
    </div>
  );
}
