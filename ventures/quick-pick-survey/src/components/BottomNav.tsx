"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Persistent bottom tab bar, the Tinder/Instagram pattern: the primary
 * surfaces are always one thumb-reach away, so nothing is buried behind a
 * back button mid-session.
 */
const TABS = [
  { href: "/app", label: "Swipe", glyph: "🔥" },
  { href: "/insights", label: "Insights", glyph: "✨" },
  { href: "/couple", label: "Together", glyph: "💞" },
  { href: "/profile", label: "You", glyph: "👤" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 z-20 flex shrink-0 border-t border-neutral-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md dark:border-neutral-800/80 dark:bg-neutral-950/95"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-semibold transition-all duration-200 ${
              active
                ? "text-amber-700 dark:text-amber-400 font-bold"
                : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
            }`}
          >
            {active && (
              <span className="absolute top-0 h-0.5 w-8 rounded-full bg-amber-500 transition-all" />
            )}
            <span aria-hidden="true" className={`text-lg transition-transform duration-200 ${active ? "scale-110" : "opacity-60 grayscale hover:opacity-90"}`}>
              {tab.glyph}
            </span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
