/**
 * gtm-motion.ts — answers STRATEGY.md's open "brokerage sales cycle vs
 * agent PLG" question with desk research, the same treatment
 * mls-compliance.ts and virtual-staging-tech.ts gave the first two open
 * questions.
 *
 * Scope: this is about which go-to-market motion to lead with once real
 * paid usage exists (STRATEGY.md's Month 3 "pick the wedge" / "land 1
 * brokerage pilot" step), not a claim about which audience wins long-term.
 * Desk research (general B2B SaaS sales-cycle benchmarks, PLG-vs-sales-led
 * literature, and real-estate-specific AI-tool-adoption reporting), not a
 * real brokerage sales conversation. Re-verify once a real brokerage
 * inbound inquiry happens or phase 2 produces enough paying agents to see
 * an actual adoption pattern.
 */

export type GtmMotionOption = {
  id: string;
  name: string;
  approach: "brokerage_led" | "agent_plg";
  cycleLength: string;
  contractValue: string;
  tradeoffs: string;
  sources: string[];
};

export const gtmMotionOptions: GtmMotionOption[] = [
  {
    id: "brokerage-led-sales",
    name: "Top-down brokerage/team sales motion (sell into marketing ops, IT, brokers)",
    approach: "brokerage_led",
    cycleLength:
      "General B2B SaaS benchmarks put mid-market ($15k-$50k ACV) deals at 30-60 days and multi-stakeholder deals average 6.8 stakeholders as of 2025-2026, with SOC2/vendor-risk review adding 2-4 weeks; a brokerage-wide seat deal (STRATEGY.md's $249/mo Team tier, 10 seats) would likely sit in or above that band, not the SMB under-$15k 14-30 day band.",
    contractValue:
      "Higher per-deal (Team tier is 3x the Agent Pro tier and covers 10 seats at once), but only if the brokerage actually rolls it out to agents after signing.",
    tradeoffs:
      "Real-estate-specific 2026 reporting (Inman, May 2026) found brokerages already buying AI/tech licenses and announcing them internally, then adoption stalling within about 90 days because purchasing a tool and getting individual agents to actually use it are different problems; agents kept defaulting to their own preferred external tools even after a brokerage-wide purchase. That is exactly the failure mode a brokerage-led motion risks here: Listing Lens could close a Team-tier contract and still see near-zero real usage, with no fast, direct signal (an agent replying to outreach, booking, or paying $19) the way a PLG motion produces.",
    sources: [
      "https://www.inman.com/2026/05/18/real-estate-brokerage-ai-adoption/",
      "https://optif.ai/learn/questions/sales-cycle-length-benchmark/",
      "https://www.growthspreeofficial.com/blogs/b2b-saas-sales-cycle-length-benchmarks-2026-by-acv-vertical",
    ],
  },
  {
    id: "agent-led-plg",
    name: "Bottom-up agent product-led growth (concierge -> self-serve -> expand)",
    approach: "agent_plg",
    cycleLength:
      "PLG-motion B2B SaaS companies convert meaningfully faster than sales-led ones because the buyer experiences the product before any negotiation; median free-to-paid conversion across PLG models runs roughly 9% (higher, ~12%, for freemium), and this maps directly onto Listing Lens's actual current motion — a $19 concierge delivery is closer to a paid trial than a sales cycle.",
    contractValue:
      "Lower per-deal initially ($19/listing or a $29-79/mo individual-agent tier vs. a brokerage contract), but OpenView's 2024 SaaS benchmarks found hybrid PLG+SaaS-led companies hit net-revenue-retention targets at a materially higher rate (67% vs 58% for pure PLG) and PLG companies overall post a ~70% better Rule-of-40 score than sales-led peers — the expansion path (agent PLG first, brokerage-assisted upsell once individual usage is proven) outperforms either pure motion alone.",
    tradeoffs:
      "Matches STRATEGY.md's existing primary-beachhead thesis (mid-market agents, not brokerages) and the concierge-MVP plan already in motion (checklist, pipeline, outreach templates, booking link) without requiring any new sales-cycle infrastructure (no deck, no procurement process, no brokerage IT/security review) that phase 1-2 was never resourced to build. Downside: doesn't by itself produce the Month-3 'land 1 brokerage pilot' goal — that still needs an explicit brokerage-facing motion eventually, just sequenced after, not instead of, agent-level proof.",
    sources: [
      "https://productled.com/blog/product-led-growth-benchmarks",
      "https://www.gtm8020.com/blog/product-led-growth-statistics",
      "https://jimo.ai/blog/product-led-growth-vs-sales-led-growth-guide",
    ],
  },
];

export type GtmMotionDecision = {
  choice: "brokerage_led" | "agent_plg" | "hybrid_sequenced";
  summary: string;
  revisitWhen: string;
};

export const gtmMotionDecision: GtmMotionDecision = {
  choice: "hybrid_sequenced",
  summary:
    "Lead with agent-led PLG now — it's what the concierge MVP (checklist, pipeline, outreach templates, booking link) is already built for, matches STRATEGY.md's stated primary beachhead (mid-market agents, not brokerages), and 2026 real-estate-specific reporting shows brokerage-purchased tools risk near-zero individual-agent adoption even after a contract closes, which is the opposite of the fast, direct payment/usage signal phase 2 needs. Treat a brokerage-led motion as a Month-3 expansion step that comes after agent-level proof exists (paying concierge customers, ideally a self-serve or team referral pattern emerging), not a parallel or earlier motion — this doesn't change STRATEGY.md's existing 90-day plan, it just answers 'why agents first' with sourced reasoning instead of leaving the open-questions box unchecked.",
  revisitWhen:
    "Revisit once phase 2 (p2-first-deliveries) produces at least a few real paying customers, or once an inbound brokerage inquiry happens organically (e.g. a satisfied agent's team lead asks about a group rate) — at that point, evaluate whether the existing Team tier ($249/mo, 10 seats) needs an actual sales motion (a one-pager, a demo, a point of contact for procurement questions) built out, informed by real agent-level usage data rather than desk research alone.",
};
