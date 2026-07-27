"use client";

/**
 * Hand-drawn line icons — one per item where the item is distinctive
 * enough to deserve its own, otherwise one per category. Deliberately
 * schematic (objects and tools, not people) so nothing about a depicted
 * person's age, build or attractiveness leaks into the judgement.
 */

const common = {
  fill: "none",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" {...common} stroke="currentColor" className="h-full w-full">
      {children}
    </svg>
  );
}

/** Item-level icons, keyed by item slug. Falls back to the category icon. */
const ITEM_ICONS: Record<string, React.ReactNode> = {
  // Aviation & maritime
  "helicopter-pilot": (
    <Svg>
      <path d="M3 6h18M12 6v3" />
      <path d="M6 12h9a3 3 0 013 3v2H8a2 2 0 01-2-2z" />
      <path d="M18 15h3M7 17v2M15 17v2" />
    </Svg>
  ),
  "helicopter-pilot-pro": (
    <Svg>
      <path d="M3 6h18M12 6v3" />
      <path d="M6 12h9a3 3 0 013 3v2H8a2 2 0 01-2-2z" />
      <path d="M18 15h3M7 17v2M15 17v2" />
    </Svg>
  ),
  "ocean-sailing": (
    <Svg>
      <path d="M12 3v12M12 5l6 10h-6" />
      <path d="M11 7L6 15h5" />
      <path d="M3 18c1.5 1.5 3 1.5 4.5 0S10.5 16.5 12 18s3 1.5 4.5 0 3-1.5 4.5 0" />
    </Svg>
  ),
  "ship-captain": (
    <Svg>
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.6" />
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
    </Svg>
  ),
  "scuba-expeditions": (
    <Svg>
      <circle cx="12" cy="8" r="4" />
      <path d="M9 11l-2 4M15 11l2 4" />
      <path d="M3 20c1.5 1.3 3 1.3 4.5 0S10.5 18.7 12 20s3 1.3 4.5 0 3-1.3 4.5 0" />
    </Svg>
  ),
  "horseback-riding": (
    <Svg>
      <path d="M4 18V9a3 3 0 013-3h4l3-3v4l3 2v3l-3 1v5" />
      <path d="M4 18h3M14 18h3" />
    </Svg>
  ),
  "marathon-running": (
    <Svg>
      <circle cx="14" cy="4.5" r="1.6" />
      <path d="M13 8l-3 3 2 3-1 5M13 8l3 2 2-1M10 11l-4 1" />
    </Svg>
  ),
  weightlifting: (
    <Svg>
      <path d="M4 8v8M7 6v12M17 6v12M20 8v8M7 12h10" />
    </Svg>
  ),
  bodybuilding: (
    <Svg>
      <path d="M4 8v8M7 6v12M17 6v12M20 8v8M7 12h10" />
    </Svg>
  ),
  "combat-sports": (
    <Svg>
      <path d="M7 10V7a2 2 0 014 0v3" />
      <path d="M11 10V6a2 2 0 014 0v4" />
      <path d="M15 10V8a2 2 0 014 0v6a6 6 0 01-6 6h-2a6 6 0 01-6-6v-3a2 2 0 014 0" />
    </Svg>
  ),
  "excellent-cook": (
    <Svg>
      <path d="M7 8a3 3 0 015-2 3 3 0 015 2 2.5 2.5 0 01-1 4.5V17H8v-4.5A2.5 2.5 0 017 8z" />
      <path d="M8 20h8" />
    </Svg>
  ),
  "accomplished-musician": (
    <Svg>
      <path d="M9 18V5l10-2v13" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="16" r="2" />
    </Svg>
  ),
  woodworker: (
    <Svg>
      <path d="M3 14l8-8 3 3-8 8H3z" />
      <path d="M14 5l3-3 5 5-3 3z" />
    </Svg>
  ),
  "classic-car-restoration": (
    <Svg>
      <path d="M4 15l1.5-4.5A2 2 0 017.4 9h9.2a2 2 0 011.9 1.5L20 15" />
      <path d="M3 15h18v3h-3M6 18H3v-3" />
      <circle cx="7.5" cy="18" r="1.8" />
      <circle cx="16.5" cy="18" r="1.8" />
    </Svg>
  ),
  "serious-reading": (
    <Svg>
      <path d="M4 5.5C6 4.5 9 4.5 12 6c3-1.5 6-1.5 8-.5v13c-2-1-5-1-8 .5-3-1.5-6-1.5-8-.5z" />
      <path d="M12 6v13" />
    </Svg>
  ),
  "publishes-writing": (
    <Svg>
      <path d="M14 4l6 6L9 21H3v-6z" />
      <path d="M12 6l6 6" />
    </Svg>
  ),
  "rural-land-owner": (
    <Svg>
      <path d="M3 19h18" />
      <path d="M3 19V9l5-4 5 4v10" />
      <path d="M13 19v-6h8v6" />
      <path d="M16 19v-3h2v3" />
    </Svg>
  ),
  "engineering-hobby-projects": (
    <Svg>
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 4v3M12 17v3M20 12h-3M7 12H4M17.7 6.3l-2.1 2.1M8.4 15.6l-2.1 2.1M17.7 17.7l-2.1-2.1M8.4 8.4L6.3 6.3" />
    </Svg>
  ),
  "home-renovation": (
    <Svg>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </Svg>
  ),
  surgeon: (
    <Svg>
      <path d="M6 3v8a3 3 0 006 0V3" />
      <path d="M14 3l5 6-3 11" />
      <circle cx="12" cy="17" r="2" />
    </Svg>
  ),
  "commercial-pilot": (
    <Svg>
      <path d="M2 15l7-2 3-8 2 .5-1.5 7.5 6-1 2 1.5-7 3-1.5 4-2-.5.5-3z" />
    </Svg>
  ),
  "military-pilot": (
    <Svg>
      <path d="M2 15l7-2 3-8 2 .5-1.5 7.5 6-1 2 1.5-7 3-1.5 4-2-.5.5-3z" />
    </Svg>
  ),
  "bush-pilot": (
    <Svg>
      <path d="M2 15l7-2 3-8 2 .5-1.5 7.5 6-1 2 1.5-7 3-1.5 4-2-.5.5-3z" />
    </Svg>
  ),
  "software-engineer": (
    <Svg>
      <path d="M9 8l-5 4 5 4M15 8l5 4-5 4M13 5l-2 14" />
    </Svg>
  ),
  "ai-ml-engineer": (
    <Svg>
      <circle cx="6" cy="7" r="1.8" />
      <circle cx="6" cy="17" r="1.8" />
      <circle cx="13" cy="12" r="1.8" />
      <circle cx="20" cy="12" r="1.8" />
      <path d="M7.6 8.2L11.4 11M7.6 15.8l3.8-2.8M14.8 12h3.4" />
    </Svg>
  ),
  architect: (
    <Svg>
      <path d="M4 20L12 4l8 16" />
      <path d="M7.5 14h9" />
      <path d="M3 20h18" />
    </Svg>
  ),
  lawyer: (
    <Svg>
      <path d="M12 4v16M6 20h12M4 9h16" />
      <path d="M7 9l-3 5a3 3 0 006 0zM17 9l-3 5a3 3 0 006 0z" />
    </Svg>
  ),
  judge: (
    <Svg>
      <path d="M12 4v16M6 20h12M4 9h16" />
      <path d="M7 9l-3 5a3 3 0 006 0zM17 9l-3 5a3 3 0 006 0z" />
    </Svg>
  ),
  physicist: (
    <Svg>
      <circle cx="12" cy="12" r="1.6" />
      <ellipse cx="12" cy="12" rx="9" ry="4" />
      <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(120 12 12)" />
    </Svg>
  ),
  "research-scientist": (
    <Svg>
      <path d="M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3" />
      <path d="M9 3h6M8 15h8" />
    </Svg>
  ),
  mathematician: (
    <Svg>
      <path d="M5 5h14L11 12l8 7H5" />
    </Svg>
  ),
};

/** Category-level fallbacks. */
const ICONS: Record<string, React.ReactNode> = {
  "Aviation and travel": (
    <Svg>
      <path d="M2 15l7-2 3-8 2 .5-1.5 7.5 6-1 2 1.5-7 3-1.5 4-2-.5.5-3z" />
    </Svg>
  ),
  Aviation: (
    <Svg>
      <path d="M2 15l7-2 3-8 2 .5-1.5 7.5 6-1 2 1.5-7 3-1.5 4-2-.5.5-3z" />
    </Svg>
  ),
  Fitness: (
    <Svg>
      <path d="M4 8v8M7 6v12M17 6v12M20 8v8M7 12h10" />
    </Svg>
  ),
  "Rescue and service": (
    <Svg>
      <path d="M12 3l7 3v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6z" />
      <path d="M12 9v6M9 12h6" />
    </Svg>
  ),
  "Emergency services": (
    <Svg>
      <path d="M12 3l7 3v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6z" />
      <path d="M12 9v6M9 12h6" />
    </Svg>
  ),
  "Charity and leadership": (
    <Svg>
      <path d="M12 20s-7-4.3-7-9a4 4 0 017-2.6A4 4 0 0119 11c0 4.7-7 9-7 9z" />
    </Svg>
  ),
  "Intellectual and practical": (
    <Svg>
      <path d="M4 5.5C6 4.5 9 4.5 12 6c3-1.5 6-1.5 8-.5v13c-2-1-5-1-8 .5-3-1.5-6-1.5-8-.5z" />
      <path d="M12 6v13" />
    </Svg>
  ),
  Academia: (
    <Svg>
      <path d="M2 9l10-4 10 4-10 4z" />
      <path d="M6 11v5c0 1.5 2.5 3 6 3s6-1.5 6-3v-5" />
      <path d="M20 9v6" />
    </Svg>
  ),
  Medicine: (
    <Svg>
      <path d="M6 4v6a5 5 0 0010 0V4" />
      <path d="M6 4H4M16 4h2" />
      <circle cx="18" cy="15" r="3" />
      <path d="M11 14v-3" />
    </Svg>
  ),
  "Domestic and family": (
    <Svg>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </Svg>
  ),
  "Creative and artistic": (
    <Svg>
      <path d="M12 3a9 9 0 100 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2.5-1.5H17a4 4 0 004-4c0-5-4-8-9-8z" />
      <circle cx="8" cy="11" r="1" fill="currentColor" />
      <circle cx="11" cy="8" r="1" fill="currentColor" />
      <circle cx="15" cy="8" r="1" fill="currentColor" />
    </Svg>
  ),
  "Practical and rugged": (
    <Svg>
      <path d="M14.5 6.5l3 3L8 19l-4 1 1-4z" />
      <path d="M13 8l3-3 3 3-3 3" />
    </Svg>
  ),
  "Spiritual and moral": (
    <Svg>
      <path d="M12 3v18M7 8h10" />
    </Svg>
  ),
  "Social and leadership": (
    <Svg>
      <circle cx="8.5" cy="8" r="2.3" />
      <circle cx="16" cy="8.5" r="2" />
      <path d="M4 19c.5-3 2.3-4.7 4.5-4.7S12.7 16 13.2 19" />
      <path d="M13.5 19c.4-2.4 1.8-3.8 3.6-3.8s3 1.4 3.4 3.8" />
    </Svg>
  ),
  "Business and finance": (
    <Svg>
      <rect x="3" y="8" width="18" height="12" rx="1.5" />
      <path d="M8 8V6a2 2 0 012-2h4a2 2 0 012 2v2M3 13h18" />
    </Svg>
  ),
  "Engineering and technology": (
    <Svg>
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 4v3M12 17v3M20 12h-3M7 12H4M17.7 6.3l-2.1 2.1M8.4 15.6l-2.1 2.1M17.7 17.7l-2.1-2.1M8.4 8.4L6.3 6.3" />
    </Svg>
  ),
  "Public service": (
    <Svg>
      <path d="M12 3l7 3v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6z" />
      <path d="M12 8l1.4 2.9 3.1.4-2.3 2.2.6 3.1L12 15.1 9.2 16.6l.6-3.1-2.3-2.2 3.1-.4z" />
    </Svg>
  ),
  "Law and government": (
    <Svg>
      <path d="M12 4v16M6 20h12M4 9h16" />
      <path d="M7 9l-3 5a3 3 0 006 0zM17 9l-3 5a3 3 0 006 0z" />
    </Svg>
  ),
};

const DEFAULT_ICON = (
  <Svg>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5v5l3.5 2" />
  </Svg>
);

export function CategoryIcon({
  category,
  slug,
  size = "sm",
  className,
}: {
  category?: string | null;
  slug?: string | null;
  size?: "sm" | "lg";
  className?: string;
}) {
  const icon = (slug && ITEM_ICONS[slug]) || (category && ICONS[category]) || DEFAULT_ICON;
  const dims = size === "lg" ? "h-20 w-20" : "h-6 w-6";
  return (
    <span
      aria-hidden="true"
      className={`block shrink-0 text-amber-500/85 dark:text-amber-400/75 ${dims} ${className ?? ""}`}
    >
      {icon}
    </span>
  );
}
