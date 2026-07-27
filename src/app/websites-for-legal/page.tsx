import type { Metadata } from "next";
import { CategoryLandingContent } from "@/components/marketing/category-landing-content";
import { CATEGORY_LANDING_PAGES } from "@/lib/marketing/category-landing";
import { categoryLandingPageMetadata } from "@/lib/seo";

const PAGE = CATEGORY_LANDING_PAGES.find((page) => page.category === "legal")!;

export const metadata: Metadata = categoryLandingPageMetadata(PAGE);

export default function WebsitesForLegalPage() {
  return <CategoryLandingContent page={PAGE} />;
}
