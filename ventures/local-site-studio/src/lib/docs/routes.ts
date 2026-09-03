/**
 * Single source of truth for /docs/* sub-pages — shared by the docs index
 * page (src/app/docs/page.tsx) and the marketing sitemap (src/app/sitemap.ts)
 * so a new docs page can't ship indexable-but-unlisted (a real gap found
 * 2026-07-18: 9 of 12 docs pages were missing from sitemap.xml because that
 * file hand-duplicated only the 2 docs routes that existed when it was
 * authored, and was never updated as later iterations added more docs pages).
 */
export interface DocsPageLink {
  title: string;
  href: string;
  description: string;
}

export const DOCS_PAGES: DocsPageLink[] = [
  {
    title: "Product bundles",
    href: "/docs/product-bundles",
    description: "Starter, Growth, Complete, Commerce tiers and upsell paths.",
  },
  {
    title: "Accessibility evidence",
    href: "/docs/eaa-evidence",
    description:
      "EAA evidence product line — dated record, not a certificate; buyer qualification and first experiment.",
  },
  {
    title: "Marketing automation",
    href: "/docs/marketing-automation",
    description: "AI-only copy, scheduling tiers, compliance, platform priority.",
  },
  {
    title: "Legal",
    href: "/docs/legal",
    description: "Legal entity vs public brand, DBA, CAN-SPAM, Stripe, voice disclosures.",
  },
  {
    title: "Voice agent flow",
    href: "/docs/voice-agent-flow",
    description: "Platform vs client voice — public brand persona, call scripts.",
  },
  {
    title: "Architecture",
    href: "/docs/architecture",
    description: "Automated funnel, voice agents, preview hosting, payments.",
  },
  {
    title: "Business model",
    href: "/docs/business-model",
    description: "Pricing, automated funnel, outreach copy.",
  },
  {
    title: "Compliance",
    href: "/docs/compliance",
    description: "CAN-SPAM, TCPA, Colorado CPA, scraping ethics, data retention.",
  },
  {
    title: "Launch checklist",
    href: "/docs/launch-checklist",
    description: "Operator steps from demo to first paid order (Stripe, email, legal).",
  },
  {
    title: "Production deploy",
    href: "/docs/production-deploy",
    description: "Post-payment DNS handoff, inquiry inbox, mark-live operator flow.",
  },
  {
    title: "Roadmap",
    href: "/docs/roadmap",
    description: "Phased implementation plan.",
  },
  {
    title: "Process log",
    href: "/docs/process",
    description: "Cross-agent backlog, business decisions, and iteration history.",
  },
  {
    title: "CLI scheduled agents",
    href: "/docs/cli-agents",
    description:
      "Codex, Gemini, OpenCode, Grok Build, and Cursor Agent GitHub Actions — OAuth secrets and prompts.",
  },
];
