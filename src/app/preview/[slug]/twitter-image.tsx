import { notFound } from "next/navigation";
import { loadPreviewPageLead } from "@/lib/leads/preview-page-lead";
import {
  LEAD_OG_IMAGE_ALT,
  LEAD_OG_IMAGE_SIZE,
  renderLeadOgImage,
} from "@/lib/og/lead-preview-image";

export const alt = LEAD_OG_IMAGE_ALT;
export const size = LEAD_OG_IMAGE_SIZE;
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const lead = await loadPreviewPageLead(slug);
  if (!lead) notFound();
  return renderLeadOgImage(lead);
}
