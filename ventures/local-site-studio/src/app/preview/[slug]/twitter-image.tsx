import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { loadPreviewPageLead } from "@/lib/leads/preview-page-lead";
import {
  LEAD_OG_IMAGE_ALT,
  LEAD_OG_IMAGE_SIZE,
  planLeadOgImageResponse,
  renderLeadOgImage,
} from "@/lib/og/lead-preview-image";
import { renderSiteOgImage } from "@/lib/og/site-brand-image";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/security/rate-limit";

export const alt = LEAD_OG_IMAGE_ALT;
export const size = LEAD_OG_IMAGE_SIZE;
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const clientIp = clientIpFromHeaders(await headers());
  const plan = await planLeadOgImageResponse(slug, clientIp, {
    loadLead: loadPreviewPageLead,
    checkRateLimit,
  });
  if (plan.kind === "not_found") notFound();
  if (plan.kind === "rate_limited") return renderSiteOgImage();
  return renderLeadOgImage(plan.lead);
}
