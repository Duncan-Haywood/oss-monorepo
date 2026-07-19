import {
  SITE_OG_IMAGE_SIZE,
  renderSiteOgImage,
  siteOgImageAlt,
} from "@/lib/og/site-brand-image";

export const alt = siteOgImageAlt();
export const size = SITE_OG_IMAGE_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderSiteOgImage();
}
