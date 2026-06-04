import type { NavItem } from "@/components/DocsLayout";
import {
  GENERATED_REPORT_PAGES,
  GENERATED_SOURCE_DOC_PAGES,
} from "@/generated/manifest";

export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Overview", description: "Site home" },
  {
    href: "/docs/workflow-authority",
    label: "Workflow authority",
    description: "Observe-only contract",
  },
  {
    href: "/docs/continuation-notes",
    label: "Continuation notes",
    description: "Agent run handoff log",
  },
  {
    href: "/docs/product-strategy",
    label: "Product strategy",
    description: "From PRODUCT_STRATEGY.md",
  },
  {
    href: "/docs/design-decisions",
    label: "Design decisions",
    description: "From DESIGN_DECISIONS.md",
  },
  {
    href: "/docs/architecture",
    label: "Architecture",
    description: "Core modules & handoffs",
  },
  {
    href: "/docs/cli-reference",
    label: "CLI reference",
    description: "Agent & shell commands",
  },
  {
    href: "/docs/business-plan",
    label: "Business plan",
    description: "From BUSINESS_PLAN.md",
  },
  {
    href: "/docs/terms-and-conditions",
    label: "Terms (draft)",
    description: "From TERMS_AND_CONDITIONS_DRAFT.md",
  },
  {
    href: "/docs/security",
    label: "Site security",
    description: "Access & deployment",
  },
];

export const REPORT_NAV: NavItem[] = GENERATED_REPORT_PAGES.map((page) => ({
  href: page.href,
  label: page.title,
  description: page.sourceFile,
}));

export const FULL_NAV: NavItem[] = [
  ...PRIMARY_NAV,
  ...REPORT_NAV,
];
