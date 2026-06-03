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
    id: "exp-window-warm",
    title: "Warm window vs neutral",
    status: "running" as const,
    started: "Mon 3 Jun",
    hypothesis: "Amber spot + hero belt lifts door-to-entry by 10%",
    metric: "Entry rate from pass-by",
    baseline: "14.2%",
    current: "15.0%",
    confidence: "Day 4 of 14",
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
    confidence: "Queued after window test",
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
    title: "Saddle bag: attention without conversion",
    body: "11 touches, 0 sales in 7 days. Shoppers pause at hook but skip try-on. Suggest moving to lit pedestal and staff open-on-approach for 1 week.",
    impact: "Est. €420–680/week if conversion matches category avg.",
  },
  {
    priority: "medium" as const,
    title: "Tuesday 12:00–14:00 under-monetized",
    body: "Peak entries (16) but only 2 purchases. Staffing or express till queue may be limiting closes during lunch footfall.",
    impact: "Align 15-min focused service block with CV peak.",
  },
  {
    priority: "low" as const,
    title: "Bounce rate improved vs last week",
    body: "Bounces down 4 pts after doorway clearance fix. Continue monitoring post-window experiment.",
    impact: "Validates prior layout change.",
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
