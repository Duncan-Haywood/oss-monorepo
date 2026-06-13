import {
  Building2,
  Camera,
  ClipboardList,
  Home,
  Sparkles,
  Users,
  Video,
  Wand2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const REPORT_META = {
  productName: "Listing Lens",
  tagline: "Pro-level listing media in 30 minutes — from your iPhone.",
  verdict: "Pursue — agent-first wedge",
  verdictRaw: "PURSUE — agent-first wedge",
  confidence: "medium-high",
  subtitle:
    "A market-research report for an AI-first iPhone app that helps real estate agents capture MLS-ready photos, optional 3D walkthroughs, and video tours without hiring a professional crew.",
  repositoryUrl:
    "https://github.com/Duncan-Haywood/real-estate-agent-photo-app",
} as const;

export const EXECUTIVE_SUMMARY = [
  "Realistic idea, but wedge = mid-market agents + brokerage marketing assistants who already DIY and lose clicks on mediocre Zillow photos",
  "Airbnb hosts = valid secondary, episodic unless multi-property managers / pro STR operators",
  "Market has point solutions (Julius, ListingPix, BoxBrownie SnapSnapSnap, Polycam, Matterport); gap = integrated capture workflow",
  "First test: 15–25 mid-volume agents ($200k–$600k listings) in one metro, $49–99/mo or $8–15/listing",
] as const;

export const INDUSTRY_STATS = [
  {
    value: "97%",
    label: "buyers start online",
    source: "NAR",
  },
  {
    value: "32%",
    label: "faster sales with pro photos",
    source: "Industry research",
  },
  {
    value: "61%",
    label: "more online views with pro photos",
    source: "Industry research",
  },
  {
    value: "35%",
    label: "agents use pro photographers",
    source: "Agent adoption estimate",
  },
] as const;

export const CITED_STATS = [
  "97% buyers start online (NAR)",
  "32% faster sales with pro photos",
  "$3,000–$11,000 higher sale prices with pro photos",
  "61% more online views with pro photos",
  "63% buyers skip listings with poor photos",
  "Pro photography avg ~$230; ROI cited 900–3,600%",
  "Only 35% agents use pro photographers; only 15% use high-quality",
  "Airbnb pro photos: +21% earnings, +19% bookings (Airbnb data)",
] as const;

export const WORKFLOW_STEPS = [
  {
    name: "Guide",
    detail: "room-by-room prompts, vertical lock, HDR brackets",
    icon: ClipboardList,
  },
  {
    name: "Enhance",
    detail: "instant on-device AI (exposure, sky, perspective, WB)",
    icon: Sparkles,
  },
  {
    name: "Polish",
    detail: "optional cloud (virtual staging, twilight, object removal)",
    icon: Wand2,
  },
  {
    name: "3D/Video",
    detail: "optional LiDAR 3D, 60s video walkthrough",
    icon: Video,
  },
  {
    name: "Publish",
    detail: "MLS exports, agent headshot, logo, property microsite",
    icon: Camera,
  },
] as const satisfies ReadonlyArray<{
  name: string;
  detail: string;
  icon: LucideIcon;
}>;

export const MARKET_OPPORTUNITY = [
  {
    title: "Why now",
    body: "Phone cameras, LiDAR, and on-device AI are good enough for guided mid-market listing media, while sellers increasingly judge listings through online-first discovery.",
  },
  {
    title: "Who pays",
    body: "Mid-volume agents and brokerage marketing assistants who already DIY, feel the opportunity cost, and need repeatable MLS-ready output without waiting on vendors.",
  },
  {
    title: "Who won't pay",
    body: "Luxury listing teams and commercial specialists already hire full production crews; single-property Airbnb hosts are too episodic for a subscription-first wedge.",
  },
] as const;

export const KEY_INSIGHT =
  "The wedge is the Zillow quality gap: agents know poor photos suppress clicks, but many mid-market listings cannot justify a full crew or wait several days. Listing Lens wins if it turns 'good enough fast' into a repeatable listing workflow.";

export const RECOMMENDATION =
  "Start mid-market agents, expand to brokerage teams. Use Airbnb as PLG funnel with per-listing packs, NOT core MRR. Pick one metro first: Phoenix, Atlanta, or Denver.";

export const AUDIENCE_DATA = [
  {
    audience: "Real estate agents",
    fit: 88,
    recurring: "High (4–12 listings/mo)",
    verdict: "Primary beachhead",
    icon: Home,
    why: [
      "Only ~35% use pro photographers",
      "DIY opportunity cost $300–1,200/listing",
      "Pro photos → 32% faster sales, higher commissions",
      "Brokerages buy seats for marketing coordinators",
    ],
    persona:
      "Individual agent: 12–24 deals/yr, shoots some listings, compares app vs photographer invoices",
  },
  {
    audience: "Brokerage marketing staff",
    fit: 84,
    recurring: "High (daily shoots)",
    verdict: "Best B2B expansion",
    icon: Building2,
    why: [
      "Shoots listings across multiple agents",
      "Needs templates, batch exports, and consistent quality",
      "Operational daily workflow creates higher retention",
      "Natural expansion after proving agent demand",
    ],
    persona:
      "Marketing assistant: shoots for 5–15 agents, needs templates + batch export",
  },
  {
    audience: "Airbnb / STR hosts",
    fit: 62,
    recurring: "Low–Med",
    verdict: "Secondary / per-listing packs",
    icon: Users,
    why: [
      "Airbnb pro photography recoups in ~1 night for 85% of hosts",
      "Single-property hosts episodic — bad subscription fit",
      "Multi-property managers (5+ units) behave like small businesses",
      "Sell packs $29–79/listing, not monthly sub",
    ],
    persona:
      "STR property manager: 5–50 units, seasonal refresh, micro-business buyer",
  },
] as const satisfies ReadonlyArray<{
  audience: string;
  fit: number;
  recurring: string;
  verdict: string;
  icon: LucideIcon;
  why: readonly string[];
  persona: string;
}>;

export const MARKET_SEGMENTS = [
  {
    segment: "Luxury ($1M+)",
    fit: "Poor",
    reason: "Full production crews; iPhone positioning wrong",
  },
  {
    segment: "Mid-market ($200k–$600k)",
    fit: "Excellent",
    reason: "Cost/quality balance; DIY common; Zillow competition",
  },
  {
    segment: "Lower-ticket / rentals",
    fit: "Good",
    reason: "Speed over perfection; volume",
  },
  {
    segment: "Commercial",
    fit: "Poor",
    reason: "Specialized photographers",
  },
] as const;

export const COMPETITORS = [
  {
    player: "BoxBrownie SnapSnapSnap",
    type: "Capture + human edit",
    pricing: "Free app; $2–60/image",
    strength: "Market leader",
    gap: "24–48hr turnaround",
    featured: false,
  },
  {
    player: "Julius / RealtyCam",
    type: "HDR + marketing",
    pricing: "Sub + per-image",
    strength: "Flyers, websites, AI cleanup",
    gap: "Crowded; HDR bugs older iPhones",
    featured: false,
  },
  {
    player: "ListingPix",
    type: "AI camera",
    pricing: "$5–200 credits",
    strength: "STR-friendly credits",
    gap: "No 3D/video",
    featured: false,
  },
  {
    player: "Polycam",
    type: "LiDAR 3D",
    pricing: "$34/mo business",
    strength: "Best iPhone 3D + floor plans",
    gap: "Not listing-marketing focused",
    featured: false,
  },
  {
    player: "Matterport",
    type: "3D tours",
    pricing: "$69–309/mo + fees",
    strength: "Industry 3D brand",
    gap: "Expensive; mid-market overkill",
    featured: false,
  },
  {
    player: "AutoMLS",
    type: "Walk → MLS photos",
    pricing: "New 2025",
    strength: "Validates walk-and-shoot thesis",
    gap: "Window closing",
    featured: false,
  },
  {
    player: "Listing Lens",
    type: "Integrated AI capture",
    pricing: "$49–99/mo",
    strength: "Speed + full workflow",
    gap: "Must prove quality",
    featured: true,
  },
] as const;

export const PRICING_MODELS = [
  {
    model: "Per-listing pack",
    price: "$12–25/listing",
    bestFor: "Airbnb, occasional agents",
  },
  {
    model: "Agent subscription",
    price: "$49–99/mo",
    bestFor: "4+ listings/mo",
  },
  {
    model: "Team / brokerage",
    price: "$199–499/mo (5–20 seats)",
    bestFor: "Marketing coordinators",
  },
  {
    model: "Hybrid",
    price: "$39/mo + $5/listing over cap",
    bestFor: "Seasonal agents",
  },
] as const;

export const RECOMMENDED_TIERS = [
  "Agent Pro: $79/mo unlimited (fair use)",
  "Starter: $29/mo, 3 listings",
  "Team: $249/mo, 10 seats",
  "Host pack: $19/listing one-time",
] as const;

export const UNIT_ECONOMICS =
  "Agent at 6 listings/mo × 30 images × $2 (BoxBrownie) = ~$360/mo. $79/mo unlimited is competitive if quality matches + instant turnaround.";

export const VALIDATION_STEPS = [
  {
    period: "Week 1–2",
    title: "Problem interviews",
    tasks: [
      "10 agent interviews (workflow, spend, pain)",
      "5 STR host/PM interviews",
      "Collect 20 Zillow listings (mediocre vs excellent) in target metro",
    ],
  },
  {
    period: "Week 3–4",
    title: "Concierge MVP",
    tasks: [
      "Guided shoot checklist + manual AI pipeline (no app)",
      "MLS-ready pack in <2 hours",
      "Charge $19/listing",
    ],
  },
  {
    period: "Month 2",
    title: "Smoke-test app",
    tasks: [
      "TestFlight, 20 users",
      "Measure time-to-publish, NPS, WTP",
      "A/B agent vs host landing messaging",
    ],
  },
  {
    period: "Month 3",
    title: "Pick wedge",
    tasks: [
      "Audience with >40% \"would pay $49/mo\"",
      "1 brokerage pilot",
      "Define v1: photos only OR photos + 3D lite",
    ],
  },
] as const;

export const SUCCESS_CRITERIA = [
  "≥40% interviewed agents would pay $49+/mo",
  "≥5 paying customers without hand-holding",
  "Median arrive-to-MLS-ready <45 min",
  "Blind quality rating ≥7/10 vs current DIY",
] as const;

export const RISKS = [
  {
    risk: "Crowded market",
    severity: "High",
    mitigation: "Own integrated workflow + speed",
  },
  {
    risk: "Apple native listing mode",
    severity: "Medium",
    mitigation: "MLS compliance, branding, brokerage dashboards",
  },
  {
    risk: "Quality ceiling vs pros",
    severity: "Medium",
    mitigation: "\"Good enough fast\" for mid-market",
  },
  {
    risk: "Airbnb sub churn",
    severity: "High",
    mitigation: "Don't lead GTM with hobby hosts",
  },
  {
    risk: "On-device AI staging limits",
    severity: "Medium",
    mitigation: "Hybrid: instant preview on-device, cloud for final",
  },
] as const;
