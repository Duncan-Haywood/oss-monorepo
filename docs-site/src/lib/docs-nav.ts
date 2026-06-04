import htmlManifest from "@/generated/html-manifest.json";

export type NavItem = {
  title: string;
  href: string;
  description?: string;
};

export const primaryNav: NavItem[] = [
  {
    title: "Product strategy",
    href: "/strategy",
    description: "Audience, wedge, differentiation, and roadmap framing.",
  },
  {
    title: "Design decisions",
    href: "/design-decisions",
    description: "Safety invariants, architecture, and workflow contracts.",
  },
  {
    title: "Workflow authority",
    href: "/workflow-authority",
    description: "Observe-only handoffs and native control binding.",
  },
  {
    title: "Business plan",
    href: "/business-plan",
    description: "Go-to-market, pricing hypotheses, and operating model.",
  },
  {
    title: "Terms (draft)",
    href: "/terms",
    description: "Legal draft for pilot and early access.",
  },
  {
    title: "CLI demo workspace spec",
    href: "/spec/cli-demo-workspace",
    description: "Design spec for the demo workspace command.",
  },
];

export const htmlReportNav: NavItem[] = htmlManifest.docs.map((doc) => ({
  title: doc.title,
  href: doc.href,
  description: `Built from docs/${doc.sourceFile}`,
}));
