/** Illustrative pilot data — not connected to live edge/POS in this build. */

export const storeProfile = {
  name: "Atelier Linea",
  location: "Brera, Milano",
  format: "~10 m² leather boutique",
  timezone: "Europe/Rome",
  pilotWeek: "Week 6 · Pilot",
  lastSync: "14:32 CET · edge node healthy",
};

export const todayKpis = {
  entries: 47,
  bounces: 12,
  engaged: 28,
  purchases: 9,
  revenueEur: 2840,
  avgBasketEur: 316,
  conversionPct: 19.1,
  engagementPct: 59.6,
  bouncePct: 25.5,
  vsLastWeek: {
    entries: +8,
    conversion: +2.4,
    revenue: +12,
  },
};

export const hourlyFootfall = [
  { hour: "10", entries: 3, purchases: 0 },
  { hour: "11", entries: 6, purchases: 1 },
  { hour: "12", entries: 9, purchases: 2 },
  { hour: "13", entries: 7, purchases: 1 },
  { hour: "14", entries: 5, purchases: 1 },
  { hour: "15", entries: 8, purchases: 2 },
  { hour: "16", entries: 5, purchases: 1 },
  { hour: "17", entries: 4, purchases: 1 },
];

export const funnelStages = [
  { stage: "Window pass-by", count: 312, pct: 100 },
  { stage: "Door entry", count: 47, pct: 15 },
  { stage: "Product engagement", count: 28, pct: 59.6 },
  { stage: "Purchase", count: 9, pct: 19.1 },
];

export const skuInsights = [
  {
    sku: "BELT-CRA-85",
    name: "Croc belt · cognac",
    touches: 18,
    purchases: 1,
    conversionPct: 5.6,
    gap: "high",
    note: "Strong window attention; price hesitation at counter",
  },
  {
    sku: "WALLET-NAP-BLK",
    name: "Nappa wallet · black",
    touches: 14,
    purchases: 4,
    conversionPct: 28.6,
    gap: "low",
    note: "Hero SKU — maintain front-left placement",
  },
  {
    sku: "BAG-SADD-TAN",
    name: "Saddle bag · tan",
    touches: 11,
    purchases: 0,
    conversionPct: 0,
    gap: "high",
    note: "Touches without try-on — lighting on hook",
  },
  {
    sku: "GLOVE-LAM-IV",
    name: "Lambskin gloves · ivory",
    touches: 9,
    purchases: 2,
    conversionPct: 22.2,
    gap: "medium",
    note: "Pairs well with scarves; bundle not offered",
  },
  {
    sku: "SCARF-SIL-OLV",
    name: "Silk scarf · olive",
    touches: 7,
    purchases: 2,
    conversionPct: 28.6,
    gap: "low",
    note: "Upsell attach rate 67% when suggested at till",
  },
];

export const experiments = [
  {
    id: "exp-saddle-pedestal",
    title: "Saddle bag: lit pedestal + open-on-approach",
    status: "running" as const,
    started: "Mon 3 Jun",
    hypothesis: "Desirability gap closes — touches convert at category avg",
    metric: "SKU conversion (BAG-SADD-TAN)",
    baseline: "0%",
    current: "9.1% (day 4)",
    confidence: "Day 4 of 14 · ROI rank 2",
  },
  {
    id: "exp-pairing-rack",
    title: "Scarf + glove pairing rack",
    status: "planned" as const,
    started: "—",
    hypothesis: "Co-located accessories raise multi-SKU baskets",
    metric: "Items per basket",
    baseline: "1.4",
    current: "—",
    confidence: "Queued after saddle bag test · ROI rank 3",
  },
  {
    id: "exp-window-warm",
    title: "Warm window vs neutral",
    status: "planned" as const,
    started: "—",
    hypothesis: "Amber spot + hero belt lifts door-to-entry by 10%",
    metric: "Entry rate from pass-by",
    baseline: "14.2%",
    current: "—",
    confidence: "Deferred until conversion baseline stable · ROI rank 8",
  },
  {
    id: "exp-till-script",
    title: "Till pairing script",
    status: "completed" as const,
    started: "19 May – 26 May",
    hypothesis: "One-line scarf suggestion lifts attach rate",
    metric: "Scarf attach on wallet/bag",
    baseline: "22%",
    current: "67%",
    confidence: "Promoted to standard practice",
  },
];

export const insights = [
  {
    priority: "high" as const,
    title: "Conversion +2.4 pp vs last week — rank 1 KPI",
    body: "Joined door + POS shows 19.1% conversion on 47 entries. Revenue per entrant €60.40. Protect baseline before window tests.",
    impact: "Illustrative €9k–€23k/year if +1 sale/week sustained.",
  },
  {
    priority: "high" as const,
    title: "Saddle bag: attention without conversion",
    body: "11 touches, 0 sales in 7 days. Active experiment: lit pedestal + open-on-approach (ROI rank 2).",
    impact: "Est. €420–680/week if conversion matches category avg.",
  },
  {
    priority: "medium" as const,
    title: "Tuesday 12:00–14:00 under-monetized",
    body: "Peak entries (16) but only 2 purchases. Staffing or express till queue may be limiting closes during lunch footfall.",
    impact: "Align 15-min focused service block with CV peak (ROI rank 4).",
  },
  {
    priority: "low" as const,
    title: "Bounce rate improved vs last week",
    body: "Bounces down 4 pts after doorway clearance fix. Window experiment queued until rank 1 baseline holds 7+ days.",
    impact: "Validates prior layout change; defer outdoor CV.",
  },
];

export const privacyPosture = [
  { label: "Video retention", value: "0 days (frames discarded on device)" },
  { label: "Identifiers", value: "No faces, no cross-visit IDs" },
  { label: "POS payload", value: "SKU, qty, totals — no card data" },
  { label: "Cloud egress", value: "Aggregates only · optional nightly export" },
  { label: "GDPR role", value: "Store = controller · pilot = processor (DPA)" },
];

export const weekTrend = [
  { day: "Mon", entries: 38, revenue: 1920 },
  { day: "Tue", entries: 41, revenue: 2100 },
  { day: "Wed", entries: 35, revenue: 1680 },
  { day: "Thu", entries: 44, revenue: 2450 },
  { day: "Fri", entries: 52, revenue: 3020 },
  { day: "Sat", entries: 61, revenue: 3890 },
  { day: "Sun", entries: 47, revenue: 2840 },
];

/** Sales / owner narrative — aligned with docs ROI matrix (illustrative). */
export const pilotEconomics = {
  aovRange: "€180–€450",
  grossMargin: "55–70%",
  dailyEntries: "25–80",
  staffOnFloor: "1–2",
};

export const pilotImpactSummary = {
  headline: "€14k–€32k indicative annual upside",
  subline:
    "From conversion lift, SKU repositioning, and upsell — at pilot assumptions for a ~10 m² leather boutique.",
  conversionLiftPts: 2.4,
  weeklyRevenueDeltaPct: 12,
  experimentsPromoted: 1,
  slowSkuActions: 2,
};

export const quarterlyFocus = [
  "Door + POS join — conversion % and revenue per entrant",
  "Desirability gap — attention without sale on leather SKUs",
  "Upsell patterns — multi-SKU baskets without discounting heroes",
];

export const rankedInitiatives = [
  {
    rank: 1,
    name: "Door entries + POS join",
    score: 92,
    buildCost: "€2k–€4k",
    upside: "€8k–€23k rev",
    payback: "4–8 wk",
    action: "Compare low-conversion days; test greeting or hero SKU",
    phase: "Phase 1",
    liveInDemo: true,
  },
  {
    rank: 2,
    name: "Desirability gap (SKU)",
    score: 88,
    buildCost: "€1k–€3k",
    upside: "€1.5k–€6k margin + cash",
    payback: "2–6 wk",
    action: "Markdown, bundle, or reposition in 14 days",
    phase: "Phase 2",
    liveInDemo: true,
  },
  {
    rank: 3,
    name: "Upsell & basket patterns",
    score: 84,
    buildCost: "€0.5k–€1k",
    upside: "€6k–€18k rev",
    payback: "2–4 wk",
    action: "Staff script when single-category baskets dominate",
    phase: "Phase 2",
    liveInDemo: true,
  },
  {
    rank: 4,
    name: "Hourly traffic vs sales",
    score: 72,
    buildCost: "€0 (uses #1)",
    upside: "€1.4k–€2.4k OpEx",
    payback: "Immediate",
    action: "Close dead mornings or extend tourist peaks",
    phase: "Phase 1",
    liveInDemo: true,
  },
  {
    rank: 6,
    name: "Experiment registry",
    score: 65,
    buildCost: "€0.5k–€1k",
    upside: "5–15% on tested lever",
    payback: "After baseline",
    action: "One 7-day test; success = € or conversion",
    phase: "Phase 2",
    liveInDemo: true,
  },
  {
    rank: 8,
    name: "Window / outdoor funnel",
    score: 48,
    buildCost: "€3k–€6k",
    upside: "€2k–€8k rev",
    payback: "8–16 wk",
    action: "Defer until in-store baseline is trusted",
    phase: "Phase 3",
    liveInDemo: false,
  },
];

export const pilotWins = [
  {
    title: "Conversion +2.4 pts vs last week",
    detail: "Door-to-sale join live; owner can see € impact daily.",
    metric: "19.1% today",
  },
  {
    title: "Till script promoted to standard",
    detail: "Scarf attach on wallet/bag: 22% → 67% in 7-day test.",
    metric: "+45 pts attach",
  },
  {
    title: "Saddle bag flagged before write-off",
    detail: "11 touches / 0 sales — reposition test queued.",
    metric: "€420–680/wk est.",
  },
];
