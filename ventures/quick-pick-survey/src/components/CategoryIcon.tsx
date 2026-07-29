"use client";

import React from "react";

const common = {
  fill: "none",
  strokeWidth: 1.8,
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

/** Item-level detailed SVG illustrations, keyed by item slug. Falls back to category SVG. */
const ITEM_ICONS: Record<string, React.ReactNode> = {
  // Aviation & maritime
  "helicopter-pilot": (
    <Svg>
      <path d="M3 5h18M12 5v3" strokeWidth="2" />
      <path d="M6 11h9a3 3 0 013 3v2H8a2 2 0 01-2-2z" />
      <circle cx="16" cy="14" r="1.5" fill="currentColor" opacity="0.4" />
      <path d="M18 14h3M7 16v3M15 16v3" strokeWidth="2" />
    </Svg>
  ),
  "helicopter-pilot-pro": (
    <Svg>
      <path d="M2 5h20M12 5v3" strokeWidth="2" />
      <path d="M5 11h10a4 4 0 014 4v2H7a2 2 0 01-2-2z" />
      <path d="M19 14h3M7 17v3M15 17v3" />
    </Svg>
  ),
  "fixed-wing-pilot": (
    <Svg>
      <path d="M2 15l7-2 3-8 2 .5-1.5 7.5 6-1 2 1.5-7 3-1.5 4-2-.5.5-3z" strokeWidth="1.8" />
      <circle cx="19" cy="5" r="2" fill="currentColor" opacity="0.3" />
    </Svg>
  ),
  "commercial-pilot": (
    <Svg>
      <path d="M2 15l7-2 3-8 2 .5-1.5 7.5 6-1 2 1.5-7 3-1.5 4-2-.5.5-3z" />
      <circle cx="12" cy="12" r="9" opacity="0.25" strokeDasharray="3 3" />
    </Svg>
  ),
  "military-pilot": (
    <Svg>
      <path d="M12 2l3 7 7 2-5 5 1 7-6-3-6 3 1-7-5-5 7-2z" opacity="0.3" />
      <path d="M3 16l9-10 9 10-9-3-9 3z" strokeWidth="2" />
    </Svg>
  ),
  "bush-pilot": (
    <Svg>
      <path d="M2 15l7-2 3-8 2 .5-1.5 7.5 6-1 2 1.5-7 3-1.5 4-2-.5.5-3z" />
      <path d="M2 20l5-5 4 3 5-6 6 8H2z" opacity="0.35" />
    </Svg>
  ),
  "ocean-sailing": (
    <Svg>
      <path d="M12 3v12M12 4l7 10h-7" strokeWidth="2" />
      <path d="M11 6L5 14h6" />
      <path d="M2 17c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0" strokeWidth="2" />
      <path d="M2 20c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0" opacity="0.5" />
    </Svg>
  ),
  "motor-yacht-expeditions": (
    <Svg>
      <path d="M3 14l3-4h11l4 4v3H3v-3z" strokeWidth="2" />
      <path d="M7 10V7h8v3" />
      <path d="M2 18c2.5 1.5 5 1.5 7.5 0s5-1.5 7.5 0 5 1.5 7.5 0" strokeWidth="2" />
    </Svg>
  ),
  "vehicle-expedition-leader": (
    <Svg>
      <path d="M3 14l2-4a2 2 0 011.8-1h10.4a2 2 0 011.8 1l2 4" strokeWidth="2" />
      <path d="M2 14h20v4H2v-4z" />
      <circle cx="6.5" cy="18" r="2" strokeWidth="2" />
      <circle cx="17.5" cy="18" r="2" strokeWidth="2" />
    </Svg>
  ),
  "backpacking-expeditions": (
    <Svg>
      <path d="M3 20l6-9 4 4 7-9" strokeWidth="2" />
      <rect x="8" y="8" width="8" height="11" rx="2" strokeWidth="1.8" />
      <path d="M10 8V5a2 2 0 014 0v3" />
    </Svg>
  ),
  "horseback-riding": (
    <Svg>
      <path d="M5 19v-6a4 4 0 014-4h4l4-5v5l3 2v4l-4 1v3" strokeWidth="2" />
      <path d="M5 19h3M14 19h3" strokeWidth="2" />
    </Svg>
  ),
  "scuba-expedition-leader": (
    <Svg>
      <circle cx="12" cy="9" r="4" strokeWidth="2" />
      <rect x="7" y="8" width="10" height="2" rx="1" fill="currentColor" opacity="0.4" />
      <path d="M12 13v4M9 17h6" strokeWidth="2" />
    </Svg>
  ),
  "scuba-expeditions": (
    <Svg>
      <circle cx="12" cy="8" r="4" strokeWidth="2" />
      <path d="M8 8h8" strokeWidth="2" />
      <path d="M9 12l-3 5M15 12l3 5" />
      <path d="M3 20c2.2 1.3 4.5 1.3 6.7 0s4.5-1.3 6.7 0 4.5 1.3 6.6 0" />
    </Svg>
  ),
  "marathon-running": (
    <Svg>
      <circle cx="15" cy="4" r="2" fill="currentColor" />
      <path d="M13 8l-3 4 3 3-2 6M13 8l4 2 3-2M10 12l-5 1" strokeWidth="2" />
    </Svg>
  ),
  weightlifting: (
    <Svg>
      <rect x="2" y="7" width="3" height="10" rx="1" strokeWidth="2" />
      <rect x="19" y="7" width="3" height="10" rx="1" strokeWidth="2" />
      <path d="M7 12h10" strokeWidth="2.5" />
    </Svg>
  ),
  bodybuilding: (
    <Svg>
      <path d="M7 12h10" strokeWidth="2.5" />
      <rect x="2" y="6" width="4" height="12" rx="1.5" strokeWidth="2" />
      <rect x="18" y="6" width="4" height="12" rx="1.5" strokeWidth="2" />
    </Svg>
  ),
  "volunteer-firefighter": (
    <Svg>
      <path d="M12 2a5 5 0 015 5c0 4-5 8-5 11 0-3-5-7-5-11a5 5 0 015-5z" fill="currentColor" opacity="0.25" strokeWidth="1.8" />
      <path d="M6 14h12l1 6H5l1-6z" strokeWidth="2" />
      <path d="M12 10v4M9 12h6" strokeWidth="2" />
    </Svg>
  ),
  "volunteer-paramedic": (
    <Svg>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" strokeWidth="1.8" opacity="0.3" fill="currentColor" />
      <path d="M12 7v10M7 12h10" strokeWidth="2.8" />
    </Svg>
  ),
  "volunteer-firefighter-paramedic": (
    <Svg>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" strokeWidth="1.8" />
      <path d="M12 7v10M7 12h10" strokeWidth="2.5" />
    </Svg>
  ),
  "volunteer-wilderness-sar": (
    <Svg>
      <circle cx="12" cy="12" r="9" strokeWidth="1.8" />
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" strokeWidth="2" />
      <polygon points="12,6 14,12 12,11 10,12" fill="currentColor" />
    </Svg>
  ),
  "volunteer-wilderness-sar-paramedic": (
    <Svg>
      <circle cx="12" cy="12" r="9" strokeWidth="1.8" />
      <path d="M12 7v10M7 12h10" strokeWidth="2.5" />
    </Svg>
  ),
  "volunteer-wilderness-sar-lead": (
    <Svg>
      <circle cx="12" cy="12" r="9" strokeWidth="1.8" />
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" strokeWidth="2" />
    </Svg>
  ),
  "volunteer-disaster-response": (
    <Svg>
      <path d="M12 3l9 4v6c0 5.5-3.8 10-9 11-5.2-1-9-5.5-9-11V7l9-4z" strokeWidth="2" />
      <path d="M12 8v5M12 16h.01" strokeWidth="2.5" />
    </Svg>
  ),
  "volunteer-disaster-medic": (
    <Svg>
      <path d="M12 3l9 4v6c0 5.5-3.8 10-9 11-5.2-1-9-5.5-9-11V7l9-4z" strokeWidth="2" />
      <path d="M12 8v7M8.5 11.5h7" strokeWidth="2.5" />
    </Svg>
  ),
  "charity-founder": (
    <Svg>
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" strokeWidth="1.8" fill="currentColor" opacity="0.25" />
      <path d="M12 6v10M7 11h10" strokeWidth="2" />
    </Svg>
  ),
  "charity-board-member": (
    <Svg>
      <path d="M4 21h16M4 10h16M12 3l8 4H4l8-4z" strokeWidth="1.8" />
      <path d="M6 10v11M10 10v11M14 10v11M18 10v11" strokeWidth="1.5" />
    </Svg>
  ),
  "charity-volunteer-lead": (
    <Svg>
      <circle cx="12" cy="7" r="3" strokeWidth="2" />
      <path d="M5 21v-2a4 4 0 014-4h6a4 4 0 014 4v2" strokeWidth="2" />
    </Svg>
  ),
  "nonprofit-exec-volunteer": (
    <Svg>
      <rect x="3" y="7" width="18" height="13" rx="2" strokeWidth="2" />
      <path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" strokeWidth="1.8" />
    </Svg>
  ),
  "youth-mentor": (
    <Svg>
      <circle cx="9" cy="6" r="2.5" strokeWidth="2" />
      <path d="M4 19v-2a3 3 0 013-3h4a3 3 0 013 3v2" strokeWidth="2" />
    </Svg>
  ),
  polyglot: (
    <Svg>
      <circle cx="12" cy="12" r="9" strokeWidth="1.8" />
      <path d="M3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 000 18M12 3a14 14 0 010 18" strokeWidth="1.5" />
    </Svg>
  ),
  "adjunct-professor": (
    <Svg>
      <path d="M22 10L12 4 2 10l10 6 10-6z" strokeWidth="2" />
      <path d="M6 12v5c0 2 2.7 3.5 6 3.5s6-1.5 6-3.5v-5" strokeWidth="1.8" />
    </Svg>
  ),
  "home-renovation": (
    <Svg>
      <path d="M3 10l9-7 9 7" strokeWidth="2" />
      <path d="M5 9v11h14V9" strokeWidth="2" />
      <path d="M9 20v-6h6v6" strokeWidth="1.8" />
    </Svg>
  ),
  "excellent-cook": (
    <Svg>
      <path d="M6 9a3.5 3.5 0 017-1 3.5 3.5 0 017 1 3 3 0 01-1.5 5.5H5.5A3 3 0 016 9z" strokeWidth="1.8" fill="currentColor" opacity="0.2" />
      <path d="M6 14.5V19h12v-4.5" strokeWidth="2" />
    </Svg>
  ),
  "accomplished-musician": (
    <Svg>
      <path d="M9 18V5l11-2v13" strokeWidth="2" />
      <circle cx="6" cy="18" r="3" fill="currentColor" strokeWidth="1.8" />
      <circle cx="17" cy="16" r="3" fill="currentColor" strokeWidth="1.8" />
    </Svg>
  ),
  woodworker: (
    <Svg>
      <path d="M3 14l8-8 3 3-8 8H3z" strokeWidth="2" />
      <path d="M14 5l3-3 5 5-3 3z" strokeWidth="2" />
    </Svg>
  ),
  "classic-car-restoration": (
    <Svg>
      <path d="M4 14l2-5a2 2 0 011.9-1.3h8.2A2 2 0 0118 9l2 5" strokeWidth="2" />
      <path d="M2 14h20v4H2v-4z" strokeWidth="2" />
      <circle cx="7" cy="18" r="2" strokeWidth="2" fill="currentColor" opacity="0.3" />
      <circle cx="17" cy="18" r="2" strokeWidth="2" fill="currentColor" opacity="0.3" />
    </Svg>
  ),
  "church-charitable-service": (
    <Svg>
      <path d="M12 2v20M5 8h14" strokeWidth="2.5" />
    </Svg>
  ),
  "child-mentoring": (
    <Svg>
      <circle cx="12" cy="6" r="3" strokeWidth="2" />
      <path d="M6 20v-2a4 4 0 014-4h4a4 4 0 014 4v2" strokeWidth="2" />
    </Svg>
  ),
  "serious-reading": (
    <Svg>
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" strokeWidth="2" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" strokeWidth="2" />
    </Svg>
  ),
  "publishes-writing": (
    <Svg>
      <path d="M12 19l7-7 3 3-7 7-5 1 2-4z" strokeWidth="2" />
      <path d="M4 4h12v4H4z" strokeWidth="1.8" opacity="0.6" />
    </Svg>
  ),
  "rural-land-owner": (
    <Svg>
      <path d="M3 20h18" strokeWidth="2" />
      <path d="M3 20V10l5-4 5 4v10" strokeWidth="2" />
    </Svg>
  ),
  "engineering-hobby-projects": (
    <Svg>
      <rect x="5" y="5" width="14" height="14" rx="2" strokeWidth="2" />
      <circle cx="12" cy="12" r="3" strokeWidth="2" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeWidth="2" />
    </Svg>
  ),
  surgeon: (
    <Svg>
      <path d="M6 3v8a3 3 0 006 0V3" strokeWidth="2" />
      <path d="M15 3l4 7-2 11" strokeWidth="2" />
      <circle cx="12" cy="17" r="2" strokeWidth="2" fill="currentColor" opacity="0.3" />
    </Svg>
  ),
  "software-engineer": (
    <Svg>
      <rect x="2" y="4" width="20" height="14" rx="2" strokeWidth="2" />
      <path d="M8 20h8M12 18v2" strokeWidth="2" />
      <path d="M7 9l-3 3 3 3M17 9l3 3-3 3" strokeWidth="1.8" />
    </Svg>
  ),
  "ai-ml-engineer": (
    <Svg>
      <circle cx="6" cy="6" r="2.5" strokeWidth="2" fill="currentColor" opacity="0.3" />
      <circle cx="6" cy="18" r="2.5" strokeWidth="2" fill="currentColor" opacity="0.3" />
      <circle cx="18" cy="12" r="3" strokeWidth="2" fill="currentColor" opacity="0.5" />
      <path d="M8.5 7L15 11M8.5 17L15 13" strokeWidth="2" />
    </Svg>
  ),
  architect: (
    <Svg>
      <path d="M4 21L12 3l8 18" strokeWidth="2" />
      <path d="M7.5 13h9" strokeWidth="2" />
    </Svg>
  ),
  lawyer: (
    <Svg>
      <path d="M12 3v18M5 21h14M3 8h18" strokeWidth="2" />
      <path d="M6 8l-3 6a3 3 0 006 0zM18 8l-3 6a3 3 0 006 0z" strokeWidth="1.8" fill="currentColor" opacity="0.25" />
    </Svg>
  ),
  judge: (
    <Svg>
      <path d="M12 3v18M5 21h14M3 8h18" strokeWidth="2" />
    </Svg>
  ),
  physicist: (
    <Svg>
      <circle cx="12" cy="12" r="2.5" fill="currentColor" strokeWidth="2" />
      <ellipse cx="12" cy="12" rx="9" ry="3.5" strokeWidth="1.8" />
      <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(60 12 12)" strokeWidth="1.8" />
      <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(120 12 12)" strokeWidth="1.8" />
    </Svg>
  ),
  "research-scientist": (
    <Svg>
      <path d="M9 3v5.5l-5 8.5a2 2 0 001.7 3h12.6a2 2 0 001.7-3l-5-8.5V3" strokeWidth="2" />
      <path d="M8 3h8M7 15h10" strokeWidth="2" />
    </Svg>
  ),
  mathematician: (
    <Svg>
      <path d="M4 4h16L9 12l11 8H4" strokeWidth="2.2" />
    </Svg>
  ),
};

/** Category-level fallbacks. */
const ICONS: Record<string, React.ReactNode> = {
  "Aviation and travel": (
    <Svg>
      <path d="M2 15l7-2 3-8 2 .5-1.5 7.5 6-1 2 1.5-7 3-1.5 4-2-.5.5-3z" strokeWidth="2" />
    </Svg>
  ),
  Aviation: (
    <Svg>
      <path d="M2 15l7-2 3-8 2 .5-1.5 7.5 6-1 2 1.5-7 3-1.5 4-2-.5.5-3z" strokeWidth="2" />
    </Svg>
  ),
  Fitness: (
    <Svg>
      <rect x="2" y="7" width="3" height="10" rx="1" strokeWidth="2" />
      <rect x="19" y="7" width="3" height="10" rx="1" strokeWidth="2" />
      <path d="M5 12h14" strokeWidth="2.5" />
    </Svg>
  ),
  "Rescue and service": (
    <Svg>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" strokeWidth="2" />
      <path d="M12 8v8M8 12h8" strokeWidth="2.5" />
    </Svg>
  ),
  "Emergency services": (
    <Svg>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" strokeWidth="2" />
      <path d="M12 8v8M8 12h8" strokeWidth="2.5" />
    </Svg>
  ),
  "Charity and leadership": (
    <Svg>
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" strokeWidth="2" fill="currentColor" opacity="0.3" />
    </Svg>
  ),
  "Intellectual and practical": (
    <Svg>
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" strokeWidth="2" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" strokeWidth="2" />
    </Svg>
  ),
  Academia: (
    <Svg>
      <path d="M22 10L12 4 2 10l10 6 10-6z" strokeWidth="2" />
      <path d="M6 12v5c0 2 2.7 3.5 6 3.5s6-1.5 6-3.5v-5" strokeWidth="1.8" />
    </Svg>
  ),
  Medicine: (
    <Svg>
      <path d="M6 4v6a5 5 0 0010 0V4" strokeWidth="2" />
      <circle cx="18" cy="16" r="3" strokeWidth="2" />
    </Svg>
  ),
  "Domestic and family": (
    <Svg>
      <path d="M3 10l9-7 9 7" strokeWidth="2" />
      <path d="M5 9v11h14V9" strokeWidth="2" />
    </Svg>
  ),
  "Creative and artistic": (
    <Svg>
      <path d="M12 3a9 9 0 100 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2.5-1.5H17a4 4 0 004-4c0-5-4-8-9-8z" strokeWidth="2" />
    </Svg>
  ),
  "Practical and rugged": (
    <Svg>
      <path d="M14.5 6.5l3 3L8 19l-4 1 1-4z" strokeWidth="2" />
    </Svg>
  ),
  "Spiritual and moral": (
    <Svg>
      <path d="M12 2v20M5 8h14" strokeWidth="2.5" />
    </Svg>
  ),
  "Social and leadership": (
    <Svg>
      <circle cx="8.5" cy="7" r="3" strokeWidth="2" />
      <circle cx="16.5" cy="8" r="2.5" strokeWidth="1.8" opacity="0.7" />
      <path d="M3 19v-1a4 4 0 014-4h3a4 4 0 014 4v1" strokeWidth="2" />
    </Svg>
  ),
  "Business and finance": (
    <Svg>
      <rect x="3" y="7" width="18" height="13" rx="2" strokeWidth="2" />
      <path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M3 13h18" strokeWidth="1.8" />
    </Svg>
  ),
  "Engineering and technology": (
    <Svg>
      <circle cx="12" cy="12" r="3" strokeWidth="2" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeWidth="2" />
    </Svg>
  ),
  "Public service": (
    <Svg>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" strokeWidth="2" />
    </Svg>
  ),
  "Law and government": (
    <Svg>
      <path d="M12 3v18M5 21h14M3 8h18" strokeWidth="2" />
    </Svg>
  ),
};

const DEFAULT_ICON = (
  <Svg>
    <circle cx="12" cy="12" r="9" strokeWidth="2" />
    <path d="M12 7v5l3 3" strokeWidth="2" />
  </Svg>
);

const PALETTES: Record<string, { bg: string; badge: string }> = {
  air: {
    bg: "from-sky-500 via-blue-600 to-indigo-700",
    badge: "bg-sky-100 text-sky-950 dark:bg-sky-950/90 dark:text-sky-200",
  },
  water: {
    bg: "from-cyan-500 via-teal-600 to-blue-800",
    badge: "bg-cyan-100 text-cyan-950 dark:bg-cyan-950/90 dark:text-cyan-200",
  },
  nature: {
    bg: "from-emerald-500 via-teal-600 to-green-800",
    badge: "bg-emerald-100 text-emerald-950 dark:bg-emerald-950/90 dark:text-emerald-200",
  },
  warmth: {
    bg: "from-amber-500 via-orange-600 to-rose-700",
    badge: "bg-amber-100 text-amber-950 dark:bg-amber-950/90 dark:text-amber-200",
  },
  mind: {
    bg: "from-violet-600 via-purple-600 to-indigo-800",
    badge: "bg-violet-100 text-violet-950 dark:bg-violet-950/90 dark:text-violet-200",
  },
  creative: {
    bg: "from-fuchsia-500 via-pink-600 to-purple-800",
    badge: "bg-fuchsia-100 text-fuchsia-950 dark:bg-fuchsia-950/90 dark:text-fuchsia-200",
  },
  rugged: {
    bg: "from-stone-600 via-amber-700 to-neutral-900",
    badge: "bg-stone-200 text-stone-900 dark:bg-stone-900 dark:text-stone-200",
  },
  rescue: {
    bg: "from-rose-600 via-red-600 to-orange-700",
    badge: "bg-rose-100 text-rose-950 dark:bg-rose-950/90 dark:text-rose-200",
  },
  finance: {
    bg: "from-emerald-600 via-teal-700 to-slate-900",
    badge: "bg-teal-100 text-teal-950 dark:bg-teal-950/90 dark:text-teal-200",
  },
  law: {
    bg: "from-slate-600 via-indigo-900 to-slate-950",
    badge: "bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-200",
  },
  default: {
    bg: "from-amber-500 via-amber-600 to-orange-700",
    badge: "bg-amber-100 text-amber-950 dark:bg-amber-950/90 dark:text-amber-200",
  },
};

export function CategoryIcon({
  category,
  slug,
  label,
  size = "sm",
  className,
}: {
  category?: string | null;
  slug?: string | null;
  label?: string | null;
  size?: "sm" | "lg";
  className?: string;
}) {
  const icon = (slug && ITEM_ICONS[slug]) || (category && ICONS[category]) || DEFAULT_ICON;
  const scene = describeCardVisual({ slug, label, category });
  const theme = PALETTES[scene.paletteKey] ?? PALETTES.default;

  if (size === "lg") {
    return (
      <div
        aria-hidden="true"
        className={`relative isolate flex h-32 w-44 shrink-0 flex-col items-center justify-between overflow-hidden rounded-3xl bg-gradient-to-br ${theme.bg} p-3.5 shadow-lg ring-2 ring-amber-400/40 backdrop-blur transition-transform active:scale-95 dark:ring-amber-400/20 ${className ?? ""}`}
      >
        <span className="absolute -left-6 -top-6 h-24 w-24 rounded-full bg-white/20 blur-md" />
        <span className="absolute -bottom-8 -right-6 h-28 w-28 rounded-full bg-black/20 blur-md" />

        {/* Category/Domain Badge Header */}
        <div className="z-10 flex w-full items-center justify-between">
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${theme.badge} shadow-xs`}>
            {scene.context}
          </span>
          <span className="text-xs text-amber-950 dark:text-amber-100" role="presentation">
            {scene.supportingEmoji}
          </span>
        </div>

        {/* High Quality SVG Illustration Centerpiece */}
        <div className="relative z-10 flex h-14 w-14 items-center justify-center text-amber-950 dark:text-amber-100 drop-shadow-md">
          {icon}
        </div>

        {/* Bottom Tag */}
        <div className="z-10 text-[10px] font-bold tracking-wide text-amber-950 dark:text-amber-100 drop-shadow-xs">
          {scene.primaryLabel}
        </div>
      </div>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 p-2 text-amber-900 dark:bg-amber-400/20 dark:text-amber-200 shadow-xs ${className ?? ""}`}
    >
      <span className="h-5 w-5">{icon}</span>
    </span>
  );
}

export type VisualDescription = {
  primary: string;
  supporting: string;
  context: string;
  primaryLabel: string;
  supportingEmoji: string;
  paletteKey: string;
  palette: string;
};

const VISUAL_RULES: Array<[RegExp, string, string, string, string, string]> = [
  [/(brings.coffee)/, "☕", "🌅", "small kindness", "Morning Coffee", "warmth"],
  [/(space.without|gives.you.space)/, "🕊️", "🌤️", "freedom", "Space & Freedom", "air"],
  [/(phone down|no phones|screens|gaming)/, "📵", "👂", "full attention", "Phone Off / Attention", "air"],
  [/(comfort or advice|feel understood|trying to fix your feelings)/, "🫂", "👂", "emotional care", "Emotional Care", "warmth"],
  [/(argument|conflict|disagree|hard conversation|difficult topics?|hard conversations)/, "💬", "🕊️", "healthy conflict", "Healthy Repair", "warmth"],
  [/(desire|intima|fantas|physical affection)/, "💞", "🌙", "intimacy", "Intimacy & Affection", "creative"],
  [/(household|chores|cleanliness|invisible planning|responsibilities)/, "🏡", "✅", "shared load", "Shared Household", "nature"],
  [/(sleep|rest|recovery space)/, "😴", "🌙", "rest + care", "Rest & Care", "nature"],
  [/(stress|overwhelmed|hard season|crisis)/, "🫂", "🛡️", "under pressure", "Stress Support", "rescue"],
  [/(fidelity|betrayal|crossing a boundary|small promises)/, "🔐", "🤝", "trust", "Trust & Loyalty", "law"],
  [/(helicopter)/, "🚁", "🧑‍✈️", "in the air", "Helicopter Pilot", "air"],
  [/(fixed-wing|commercial pilot|military pilot|bush pilot|pilot|aviation)/, "✈️", "🧑‍✈️", "flying", "Aviation Pilot", "air"],
  [/(travel|backpack)/, "🌍", "🎒", "exploring", "Travel & Expedition", "air"],
  [/(ocean-sailing|sailing|ship captain)/, "⛵", "🌊", "at sea", "Ocean Sailing", "water"],
  [/(motor-yacht|yacht)/, "🛥️", "🌊", "at sea", "Motor Yacht", "water"],
  [/(scuba|marine)/, "🤿", "🐠", "underwater", "Scuba Diving", "water"],
  [/(horse|equestrian)/, "🐎", "🌲", "outdoors", "Equestrian", "nature"],
  [/(marathon|running)/, "🏃", "🏅", "endurance", "Marathon Running", "nature"],
  [/(weightlift|bodybuild|keeps fit|physical therapist|fitness)/, "🏋️", "💪", "active life", "Strength & Fitness", "nature"],
  [/(firefighter|fire rescue)/, "🧑‍🚒", "🚒", "rescue", "Fire Service", "rescue"],
  [/(paramedic|disaster medic|emergency)/, "🧑‍⚕️", "🚑", "emergency care", "Paramedic & Medic", "rescue"],
  [/(wilderness sar|search and rescue)/, "🧗", "🚁", "rescue", "Search & Rescue", "rescue"],
  [/(charity|nonprofit|humanitarian|helping others|volunteer)/, "🤝", "❤️", "service", "Charity Leadership", "warmth"],
  [/(mentor|teacher|professor|school principal|learning)/, "🧑‍🏫", "📚", "learning", "Academia & Teaching", "mind"],
  [/(cook|chef)/, "🧑‍🍳", "🍽️", "at home", "Culinary Arts", "warmth"],
  [/(musician|music)/, "🎸", "🎶", "creative", "Fine Musician", "creative"],
  [/(woodwork|craftsman)/, "🛠️", "🏠", "hands-on", "Woodworking", "rugged"],
  [/(car restoration|vehicle)/, "🚙", "🔧", "on the road", "Car Restoration", "rugged"],
  [/(reading|writing|author)/, "📚", "☕", "quiet time", "Literature & Writing", "mind"],
  [/(architect)/, "📐", "⚙️", "designing", "Architecture", "mind"],
  [/(software|ai.ml|engineer)/, "💻", "🧠", "technology", "Software & AI Engine", "mind"],
  [/(surgeon|physician|medicine)/, "🩺", "🏥", "healthcare", "Surgical Practice", "rescue"],
  [/(lawyer|judge|justice)/, "⚖️", "🏛️", "justice", "Law & Judiciary", "law"],
  [/(business|finance|invest)/, "📈", "💰", "finances", "Finance & Venture", "finance"],
];

const CATEGORY_VISUALS: Record<string, [string, string, string]> = {
  "Aviation and travel": ["✈️", "🌍", "exploring"],
  Aviation: ["✈️", "☁️", "flying"],
  Fitness: ["🏃", "💪", "active life"],
  "Rescue and service": ["🛟", "🤝", "service"],
  "Emergency services": ["🚑", "❤️‍🩹", "emergency care"],
  "Charity and leadership": ["🤝", "❤️", "service"],
  "Intellectual and practical": ["💡", "🛠️", "ideas + action"],
  Academia: ["🎓", "📚", "learning"],
  Medicine: ["🩺", "🏥", "healthcare"],
  "Domestic and family": ["🏡", "❤️", "home life"],
  "Creative and artistic": ["🎨", "✨", "creative"],
  "Practical and rugged": ["🛠️", "🌲", "hands-on"],
  "Spiritual and moral": ["🕯️", "🙏", "shared meaning"],
  "Social and leadership": ["🫂", "⭐", "people"],
  "Business and finance": ["📈", "💼", "business"],
  "Engineering and technology": ["⚙️", "💻", "technology"],
  "Public service": ["🏛️", "🤝", "public service"],
  "Law and government": ["⚖️", "🏛️", "public life"],
  Behaviour: ["🤝", "✅", "showing care"],
  Affection: ["🤗", "💞", "affection"],
  Relationship: ["🫶", "💬", "partnership"],
  Communication: ["🗣️", "👂", "communication"],
  Intimacy: ["💞", "🌙", "closeness"],
  Lifestyle: ["🏡", "🌿", "daily life"],
  Values: ["🧭", "⚖️", "values"],
  Character: ["💎", "🧍", "character"],
};

export function describeCardVisual({
  slug,
  label,
  category,
}: {
  slug?: string | null;
  label?: string | null;
  category?: string | null;
}): VisualDescription {
  const haystack = `${slug ?? ""} ${label ?? ""}`.toLowerCase().replaceAll("-", " ");
  const match = VISUAL_RULES.find(([pattern]) => pattern.test(haystack));

  if (match) {
    const [, primary, supporting, context, primaryLabel, paletteKey] = match;
    return {
      primary,
      supporting,
      context,
      primaryLabel,
      supportingEmoji: supporting,
      paletteKey,
      palette: "from-amber-200 via-orange-300 to-amber-600",
    };
  }

  const fallback = (category && CATEGORY_VISUALS[category]) || ["💡", "✨", "your preference"];
  const [primary, supporting, context] = fallback;

  return {
    primary,
    supporting,
    context,
    primaryLabel: category ?? "Domain Focus",
    supportingEmoji: supporting,
    paletteKey: "default",
    palette: "from-amber-200 via-orange-300 to-amber-600",
  };
}
