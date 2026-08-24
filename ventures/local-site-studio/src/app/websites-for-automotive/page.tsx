import type { Metadata } from "next";
import { CategoryLandingContent } from "@/components/marketing/category-landing-content";
import { CATEGORY_LANDING_PAGES } from "@/lib/marketing/category-landing";
import { categoryLandingPageMetadata } from "@/lib/seo";

const PAGE = CATEGORY_LANDING_PAGES.find((page) => page.category === "automotive")!;

export const metadata: Metadata = categoryLandingPageMetadata(PAGE);

export default function WebsitesForAutomotivePage() {
  return <CategoryLandingContent page={PAGE} />;
}
