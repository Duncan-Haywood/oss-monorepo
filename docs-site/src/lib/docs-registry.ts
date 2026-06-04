import type { MarkdownDocEntry } from "@/lib/types";

/** TSX-first registry for markdown sources under repo /docs */
export const markdownDocs: readonly MarkdownDocEntry[] = [
  {
    slug: "product-strategy",
    title: "Product Strategy",
    description: "Audience, wedge, differentiation, and roadmap framing.",
    sourcePath: "PRODUCT_STRATEGY.md",
    href: "/docs/product-strategy",
    category: "product",
  },
  {
    slug: "business-plan",
    title: "Business Plan",
    description: "Market, pricing hypotheses, and go-to-market outline.",
    sourcePath: "BUSINESS_PLAN.md",
    href: "/docs/business-plan",
    category: "product",
  },
  {
    slug: "design-decisions",
    title: "Design Decisions",
    description: "Architecture and safety contracts for ShootFlow.",
    sourcePath: "DESIGN_DECISIONS.md",
    href: "/docs/design-decisions",
    category: "engineering",
  },
  {
    slug: "workflow-authority",
    title: "Workflow Authority",
    description: "Observe-only authority objects and native control binding.",
    sourcePath: "WORKFLOW_AUTHORITY.md",
    href: "/docs/workflow-authority",
    category: "engineering",
  },
  {
    slug: "terms-draft",
    title: "Terms & Conditions (Draft)",
    description: "Draft legal terms — not legal advice.",
    sourcePath: "TERMS_AND_CONDITIONS_DRAFT.md",
    href: "/docs/terms-draft",
    category: "legal",
  },
] as const;

export function getMarkdownDoc(slug: string): MarkdownDocEntry | undefined {
  return markdownDocs.find((d) => d.slug === slug);
}
