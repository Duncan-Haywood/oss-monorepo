export type NavItem = {
  href: string;
  label: string;
  description?: string;
  section: "guides" | "reports" | "legal";
};

export const guideNav: NavItem[] = [
  {
    href: "/docs/product-strategy",
    label: "Product strategy",
    description: "Audience, wedge, differentiation, workflow value",
    section: "guides",
  },
  {
    href: "/docs/design-decisions",
    label: "Design decisions",
    description: "Safety invariants, architecture, production contracts",
    section: "guides",
  },
  {
    href: "/docs/workflow-authority",
    label: "Workflow authority",
    description: "Observe-only handoffs and native control binding",
    section: "guides",
  },
  {
    href: "/docs/business-plan",
    label: "Business plan",
    description: "Positioning, pricing hypotheses, GTM motion",
    section: "guides",
  },
  {
    href: "/docs/terms",
    label: "Terms draft",
    description: "Internal terms and conditions working draft",
    section: "legal",
  },
];

export function reportNavFromManifest(
  pages: { slug: string; title: string }[],
): NavItem[] {
  return pages.map((page) => ({
    href: `/docs/reports/${page.slug}`,
    label: page.title,
    section: "reports" as const,
  }));
}
