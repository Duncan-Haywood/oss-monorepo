/**
 * Deliver a generated monthly marketing pack to the client via email.
 * Closes the Growth/Complete sold promise (content delivery) without
 * Buffer/GBP/Meta OAuth — see /docs/process (deliver-marketing-pack-to-client).
 */

import { brand } from "@/lib/brand";
import type { LeadPipelineStage } from "@/lib/leads/types";
import { escapeHtmlForEmail, plainTextToEmailHtml } from "@/lib/inquiries/reply";
import { softCapPackVariantFields } from "@/lib/packs/variant-fields";
import { contentTypeLabel, leadEligibleForMarketingPack } from "./monthly-pack";
import type { MarketingContentVariant } from "./types";

/**
 * Eligible when Growth/Complete marketing applies AND the lead has an email
 * we can deliver the pack to. Pack row existence is checked separately
 * (callers load getMarketingPack for the month).
 */
export function leadEligibleForMarketingPackDelivery(
  lead: { stage: LeadPipelineStage; email?: string | null },
  orders: ReadonlyArray<{ tier: string }>,
): boolean {
  if (!leadEligibleForMarketingPack(lead, orders)) return false;
  return Boolean(lead.email && lead.email.trim().length > 0);
}

export function marketingPackDeliverySubject(
  businessName: string,
  yearMonth: string,
): string {
  return `${businessName} — marketing pack for ${yearMonth}`;
}

function variantBlockHtml(variant: MarketingContentVariant, index: number): string {
  const label = contentTypeLabel(variant.contentType);
  const title = variant.title?.trim()
    ? `<p style="margin: 0 0 8px 0; font-weight: 600;">${escapeHtmlForEmail(variant.title.trim())}</p>`
    : "";
  const cta = variant.cta?.trim()
    ? `<p style="margin: 8px 0 0 0; font-size: 14px;"><strong>CTA:</strong> ${escapeHtmlForEmail(variant.cta.trim())}</p>`
    : "";
  const hashtags =
    variant.hashtags && variant.hashtags.length > 0
      ? `<p style="margin: 8px 0 0 0; font-size: 13px; color: #52525b;">${escapeHtmlForEmail(variant.hashtags.join(" "))}</p>`
      : "";

  return `
    <div style="margin-bottom: 20px; padding: 16px; border: 1px solid #e4e4e7; border-radius: 8px;">
      <p style="margin: 0 0 12px 0; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: #71717a;">
        ${index + 1}. ${escapeHtmlForEmail(label)}
      </p>
      ${title}
      ${plainTextToEmailHtml(variant.body)}
      ${cta}
      ${hashtags}
    </div>
  `;
}

/**
 * Pure HTML body for the client-facing pack email (wrapped later by sendEmail
 * with CAN-SPAM footer). Escapes all operator/LLM text.
 */
export function formatMarketingPackEmailHtml(input: {
  businessName: string;
  yearMonth: string;
  variants: readonly MarketingContentVariant[];
  previewUrl?: string;
}): string {
  const { businessName, yearMonth, variants, previewUrl } = input;
  // Soft-cap at the skipSuppression sink — generate soft-caps before upsert, but
  // Email pack must not emit already-stored uncapped rows (deliver twin).
  const variantHtml = variants
    .map((variant) => softCapPackVariantFields(variant))
    .map((variant, index) => variantBlockHtml(variant, index))
    .join("");
  const previewLine = previewUrl
    ? `<p style="margin-bottom: 16px; font-size: 14px;">Your site preview: <a href="${escapeHtmlForEmail(previewUrl)}" style="color: #2563eb;">${escapeHtmlForEmail(previewUrl)}</a></p>`
    : "";

  return `
    <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 16px;">Your ${escapeHtmlForEmail(yearMonth)} marketing pack</h2>
    <p style="margin-bottom: 16px;">Hi ${escapeHtmlForEmail(businessName)} — here are this month&apos;s posts and emails ready to copy into Google Business Profile, Facebook, Instagram, or your email tool.</p>
    ${previewLine}
    ${variantHtml}
    <p style="margin-top: 8px; margin-bottom: 8px;">Questions or tweaks? Just reply to this email.</p>
    <p style="font-weight: 500; margin-top: 0;">The ${escapeHtmlForEmail(brand.name)} Team</p>
  `;
}
