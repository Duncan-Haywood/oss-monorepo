import type { NavItem } from "@/components/DocsLayout";
import {
  HTML_REPORT_SLUGS,
  INGESTED_PAGES,
  MARKDOWN_ARCHIVE_SLUGS,
} from "@/generated/content";

export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Overview", description: "Site home" },
  {
    href: "/docs/workflow-authority",
    label: "Workflow authority",
    description: "Observe-only contract",
  },
  {
    href: "/docs/product-strategy",
    label: "Product strategy",
    description: "Curated TSX summary",
  },
  {
    href: "/docs/design-decisions",
    label: "Design decisions",
    description: "Architecture notes",
  },
  {
    href: "/docs/business-plan",
    label: "Business plan",
    description: "GTM overview",
  },
  {
    href: "/docs/security",
    label: "Site security",
    description: "Access & deployment",
  },
];

export const REPORT_NAV: NavItem[] = HTML_REPORT_SLUGS.map((slug) => {
  const page = INGESTED_PAGES.find((p) => p.slug === slug);
  return {
    href: `/reports/${slug}`,
    label: page?.title ?? slug,
    description: page?.sourceFile,
  };
});

export const ARCHIVE_NAV: NavItem[] = MARKDOWN_ARCHIVE_SLUGS.map((slug) => {
  const page = INGESTED_PAGES.find((p) => p.slug === slug);
  return {
    href: `/archive/${slug}`,
    label: `${page?.title ?? slug} (full)`,
    description: "Build-ingested MD",
  };
});

export const FULL_NAV: NavItem[] = [
  ...PRIMARY_NAV,
  ...REPORT_NAV,
  ...ARCHIVE_NAV,
];
