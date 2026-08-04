/**
 * Deliver a generated Complete voice FAQ/script pack to the client via email.
 * Closes the Complete sold promise (phone scripts) without Twilio —
 * see /docs/process (deliver-client-voice-pack-to-client).
 */

import { brand } from "@/lib/brand";
import type { LeadPipelineStage } from "@/lib/leads/types";
import { escapeHtmlForEmail, plainTextToEmailHtml } from "@/lib/inquiries/reply";
import { leadEligibleForClientVoicePack, scriptTypeLabel } from "./faq-pack";
import type { ClientVoiceScriptVariant } from "./types";

/**
 * Eligible when Complete voice applies AND the lead has an email we can
 * deliver the pack to. Pack row existence is checked separately (callers
 * load getClientVoicePackByLeadSlug).
 */
export function leadEligibleForClientVoicePackDelivery(
  lead: { stage: LeadPipelineStage; email?: string | null },
  orders: ReadonlyArray<{ tier: string }>,
): boolean {
  if (!leadEligibleForClientVoicePack(lead, orders)) return false;
  return Boolean(lead.email && lead.email.trim().length > 0);
}

export function clientVoicePackDeliverySubject(businessName: string): string {
  return `${businessName} — phone FAQ / script pack`;
}

function scriptBlockHtml(variant: ClientVoiceScriptVariant, index: number): string {
  const label = scriptTypeLabel(variant.scriptType);
  const title = variant.title?.trim()
    ? `<p style="margin: 0 0 8px 0; font-weight: 600;">${escapeHtmlForEmail(variant.title.trim())}</p>`
    : "";
  const cta = variant.cta?.trim()
    ? `<p style="margin: 8px 0 0 0; font-size: 14px;"><strong>Spoken CTA:</strong> ${escapeHtmlForEmail(variant.cta.trim())}</p>`
    : "";

  return `
    <div style="margin-bottom: 20px; padding: 16px; border: 1px solid #e4e4e7; border-radius: 8px;">
      <p style="margin: 0 0 12px 0; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: #71717a;">
        ${index + 1}. ${escapeHtmlForEmail(label)}
      </p>
      ${title}
      ${plainTextToEmailHtml(variant.body)}
      ${cta}
    </div>
  `;
}

/**
 * Pure HTML body for the client-facing voice pack email (wrapped later by
 * sendEmail with CAN-SPAM footer). Escapes all operator/LLM text.
 */
export function formatClientVoicePackEmailHtml(input: {
  businessName: string;
  variants: readonly ClientVoiceScriptVariant[];
  previewUrl?: string;
}): string {
  const { businessName, variants, previewUrl } = input;
  const scriptHtml = variants
    .map((variant, index) => scriptBlockHtml(variant, index))
    .join("");
  const previewLine = previewUrl
    ? `<p style="margin-bottom: 16px; font-size: 14px;">Your site preview: <a href="${escapeHtmlForEmail(previewUrl)}" style="color: #2563eb;">${escapeHtmlForEmail(previewUrl)}</a></p>`
    : "";

  return `
    <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 16px;">Your phone FAQ / script pack</h2>
    <p style="margin-bottom: 16px;">Hi ${escapeHtmlForEmail(businessName)} — here are receptionist scripts you can paste into a temporary phone number, voicemail, or Cal.com booking flow until a full AI phone line is provisioned.</p>
    ${previewLine}
    ${scriptHtml}
    <p style="margin-top: 8px; margin-bottom: 8px;">Questions or tweaks? Just reply to this email.</p>
    <p style="font-weight: 500; margin-top: 0;">The ${escapeHtmlForEmail(brand.name)} Team</p>
  `;
}
