"use client";

/**
 * Small hand-drawn black-and-white line icons, one per item category — not
 * per item — so they add quick visual scanning without depicting the
 * concept itself (no AI-generated imagery, no bias risk from a rendered
 * person's implied age/gender/attractiveness).
 */

const common = {
  fill: "none",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" {...common} stroke="currentColor" className="h-5 w-5 shrink-0">
      {children}
    </svg>
  );
}

const ICONS: Record<string, React.ReactNode> = {
  "Aviation and travel": (
    <Svg>
      <path d="M2 16l7-2 4-8 2 .5-2 7.5 6-1 2 1.5-7 3-1 3 2 1-1 1.5-3-1-1.5 2H8l1-2.5-6 .5-1-1.5 4-2z" />
    </Svg>
  ),
  Aviation: (
    <Svg>
      <path d="M2 16l7-2 4-8 2 .5-2 7.5 6-1 2 1.5-7 3-1 3 2 1-1 1.5-3-1-1.5 2H8l1-2.5-6 .5-1-1.5 4-2z" />
    </Svg>
  ),
  Fitness: (
    <Svg>
      <circle cx="12" cy="4.5" r="1.8" />
      <path d="M12 6.5v6M12 8l-3.5 2M12 8l3.5 2M12 12.5l-2.5 6M12 12.5l2.5 6" />
    </Svg>
  ),
  "Rescue and service": (
    <Svg>
      <path d="M12 3l7 3v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3z" />
      <path d="M12 9v6M9 12h6" />
    </Svg>
  ),
  "Emergency services": (
    <Svg>
      <path d="M12 3l7 3v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3z" />
      <path d="M12 9v6M9 12h6" />
    </Svg>
  ),
  "Charity and leadership": (
    <Svg>
      <path d="M4 11c2 0 3-1.5 3-3.5S6 4 4 4v7z" />
      <path d="M20 11c-2 0-3-1.5-3-3.5S18 4 20 4v7z" />
      <path d="M4 11c1 4 5 7 8 8 3-1 7-4 8-8" />
    </Svg>
  ),
  "Intellectual and practical": (
    <Svg>
      <path d="M4 5.5C6 4.5 9 4.5 12 6c3-1.5 6-1.5 8-.5v13c-2-1-5-1-8 .5-3-1.5-6-1.5-8-.5v-13z" />
      <path d="M12 6v13" />
    </Svg>
  ),
  Academia: (
    <Svg>
      <path d="M2 9l10-4 10 4-10 4-10-4z" />
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
      <path d="M4 11l8-7 8 7" />
      <path d="M6 10v9h12v-9" />
      <path d="M10 19v-5h4v5" />
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
      <path d="M12 3c2 3 3 5 3 7a3 3 0 11-6 0c0-2 1-4 3-7z" />
      <path d="M6 21c1.5-3 4-4 6-4s4.5 1 6 4" />
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
      <path d="M8 8V6a2 2 0 012-2h4a2 2 0 012 2v2" />
      <path d="M3 13h18" />
    </Svg>
  ),
  "Engineering and technology": (
    <Svg>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M21 12h-2.5M5.5 12H3M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8M18.4 18.4l-1.8-1.8M7.4 7.4L5.6 5.6" />
    </Svg>
  ),
  "Public service": (
    <Svg>
      <path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.8 7.1 18.2l.9-5.5-4-3.9L9.5 8z" />
    </Svg>
  ),
};

const DEFAULT_ICON = (
  <Svg>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v5l3 2" />
  </Svg>
);

export function CategoryIcon({ category, className }: { category?: string | null; className?: string }) {
  const icon = (category && ICONS[category]) || DEFAULT_ICON;
  return <span className={`text-neutral-500 dark:text-neutral-400 ${className ?? ""}`}>{icon}</span>;
}
