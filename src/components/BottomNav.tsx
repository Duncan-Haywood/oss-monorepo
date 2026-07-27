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
      className="sticky bottom-0 z-20 flex shrink-0 border-t border-neutral-200 bg-neutral-50/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition ${
              active
                ? "text-amber-600 dark:text-amber-400"
                : "text-neutral-400 dark:text-neutral-500"
            }`}
          >
            <span aria-hidden="true" className={`text-lg ${active ? "" : "opacity-60 grayscale"}`}>
              {tab.glyph}
            </span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
