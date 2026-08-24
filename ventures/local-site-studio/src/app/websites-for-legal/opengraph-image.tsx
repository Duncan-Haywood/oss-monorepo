import {
  CATEGORY_LANDING_OG_IMAGE_SIZE,
  categoryLandingOgImageAlt,
  renderCategoryLandingOgImage,
} from "@/lib/og/category-landing-image";
import { CATEGORY_LANDING_PAGES } from "@/lib/marketing/category-landing";

const PAGE = CATEGORY_LANDING_PAGES.find((page) => page.category === "legal")!;

export const alt = categoryLandingOgImageAlt(PAGE);
export const size = CATEGORY_LANDING_OG_IMAGE_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderCategoryLandingOgImage(PAGE);
}
