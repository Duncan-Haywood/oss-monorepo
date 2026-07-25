import { isEmailSuppressed } from "../db";
import { brand } from "../brand";
import { formatResendFromHeader } from "./email-from-env-readiness";
import { signUnsubscribeToken } from "./unsubscribe-token";
import { previewUrlWithOutreachTracking } from "../leads/preview-open";
import { leadPreviewAbsoluteUrl } from "../leads/slug-path";
import { escapeHtmlForEmail, plainTextFromEmailHtml, plainTextToEmailHtml } from "../inquiries/reply";
import {
  formatMarketingPackEmailHtml,
  marketingPackDeliverySubject,
} from "../marketing/deliver-pack";
import type { MarketingContentVariant } from "../marketing/types";
import {
  clientVoicePackDeliverySubject,
  formatClientVoicePackEmailHtml,
} from "../voice/deliver-pack";
import type { ClientVoiceScriptVariant } from "../voice/types";
import {
  commerceBuyNowClientReceiptSubject,
  formatCommerceBuyNowClientReceiptHtml,
} from "../commerce/client-receipt";
import { getBundle } from "../pricing/bundles";
import { monthlyMarketingEmailCount, monthlyMarketingSocialPostCount } from "../marketing/monthly-pack";
import { buildStarterUpsellCheckoutPath } from "../billing/starter-upsell";
import { formatDnsInstructionsForEmail } from "../deploy/dns-email";
import type { DeployHandoff } from "../deploy/types";

const resendApiKey = process.env.RESEND_API_KEY;

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  leadSlug?: string;
  /**
   * When true, skip the marketing suppression list. Use for post-payment
   * fulfillment (bundle receipt, DNS go-live handoff, Commerce Buy now
   * client receipt), Starter sold product notifies that land on lead.email
   * (contact-form inquiry alert), operator inquiry replies to website
   * visitors (sendInquiryReply), and sold Growth/Complete pack delivery
   * (sendMarketingPackToClientEmail / sendClientVoicePackToClientEmail) —
   * a cold-outreach unsubscribe must not block paid go-live instructions,
   * website inquiry delivery, the CRM reply half of that same sold
   * contact-form loop, or features a paying client is billed for.
   * Outreach, abandoned recovery, and Starter upsell must leave this unset.
   */
  skipSuppression?: boolean;
  /**
   * Optional Reply-To address — use when the recipient's most natural
   * response (hitting Reply) should route to a third party rather than back
   * to this app's own EMAIL_FROM (e.g. the contact-form notify to a Starter
   * client's own inbox should Reply-To the website visitor who submitted the
   * form, not the platform). Validated via sanitizeReplyToEmail before use:
   * this flows into Resend's `reply_to` field, which becomes a raw outbound
   * email header — an unvalidated, visitor-submitted value would be a
   * header-injection vector, so a malformed or control-character-bearing
   * value is silently dropped rather than passed through.
   */
  replyTo?: string;
}

const REPLY_TO_EMAIL_PATTERN =
  /^[^\s<>()[\]:;@,\\"]+@[^\s<>()[\]:;@,\\"]+\.[^\s<>()[\]:;@,\\"]+$/;

/**
 * A Reply-To value is sent to Resend as plain JSON but becomes a raw
 * outbound Reply-To email header — validate a plausible, single,
 * control-character-free address instead of passing arbitrary
 * visitor-submitted text through (same header-injection class
 * sanitizeEmailSubject's CR/LF strip guards against for Subject).
 */
export function sanitizeReplyToEmail(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || /[\x00-\x1f\x7f]/.test(trimmed)) return undefined;
  return REPLY_TO_EMAIL_PATTERN.test(trimmed) ? trimmed : undefined;
}

/**
 * Keep provider-facing subjects single-line and printable. Most subjects are
 * built from operator/client-controlled names, so sanitize at the shared send
 * boundary rather than relying on each template to remember the rule.
 */
export function sanitizeEmailSubject(subject: string): string {
  const printable = Array.from(subject, (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || (code >= 127 && code <= 159) ? " " : character;
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim();

  return printable || "Notification";
}

export async function sendEmail({
  to,
  subject,
  html,
  leadSlug,
  skipSuppression = false,
  replyTo,
}: SendEmailParams) {
  const safeSubject = sanitizeEmailSubject(subject);
  const normalizedTo = to.toLowerCase().trim();
  const safeReplyTo = sanitizeReplyToEmail(replyTo);

  // 1. Check suppression list (marketing only — see skipSuppression)
  if (!skipSuppression) {
    const suppressed = await isEmailSuppressed(normalizedTo);
    if (suppressed) {
      console.warn(`[Email Skipped] Address ${to} is in the suppression list.`);
      return { success: false as const, reason: "suppressed" };
    }
  }

  // Determine base URL for unsubscribe link
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const unsubscribeToken = signUnsubscribeToken(normalizedTo);
  const unsubscribeUrl = `${baseUrl}/api/unsubscribe?email=${encodeURIComponent(normalizedTo)}&token=${encodeURIComponent(unsubscribeToken)}`;

  // Wrap HTML content with standard CAN-SPAM footer.
  // brand.* are env-sourced operator strings — same escapeHtmlForEmail rule as
  // businessName (marketing/voice/commerce templates already escape brand.name).
  const safeBrand = escapeHtmlForEmail(brand.name);
  const safeLegalEntity = escapeHtmlForEmail(brand.legalEntity);
  const safePostalAddress = escapeHtmlForEmail(brand.postalAddress);
  // href attributes need the same escape as body text — mirror client-receipt /
  // deliver-pack / dns-email / daily-digest (escapeHtmlForEmail on every URL).
  const safeUnsubscribeUrl = escapeHtmlForEmail(unsubscribeUrl);
  const safePrivacyUrl = escapeHtmlForEmail(`${baseUrl}/privacy`);
  const fullHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #18181b; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="margin-bottom: 30px;">
        ${html}
      </div>
      <hr style="border: 0; border-top: 1px solid #e4e4e7; margin: 30px 0;" />
      <footer style="font-size: 12px; color: #71717a; text-align: center; line-height: 1.5;">
        <p>This email was sent by ${safeBrand} to business contacts of interest.</p>
        <p>${safeLegalEntity} · ${safePostalAddress}</p>
        <p>
          <a href="${safeUnsubscribeUrl}" style="color: #2563eb; text-decoration: underline;">Unsubscribe</a> | 
          <a href="${safePrivacyUrl}" style="color: #2563eb; text-decoration: underline;">Privacy Policy</a>
        </p>
      </footer>
    </div>
  `;

  // 2. Check if Resend is configured
  if (!resendApiKey || resendApiKey.startsWith("re_placeholder") || resendApiKey === "re_...") {
    console.log(`[Mock Email Sent]
To: ${to}
Reply-To: ${safeReplyTo || "None"}
Subject: ${safeSubject}
Lead: ${leadSlug || "None"}
Content Preview: ${html.substring(0, 150)}...
CAN-SPAM Footer: Applied (${brand.postalAddress})
Unsubscribe URL: ${unsubscribeUrl}`);
    return { success: true as const, mock: true };
  }

  // 3. Make HTTP request to Resend
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // EMAIL_FROM (brand.emailFrom) — never hardcode a platform domain.
        from: formatResendFromHeader(brand.name, brand.emailFrom),
        to: [to],
        // Only set when replyTo passed sanitizeReplyToEmail — omit the field
        // entirely rather than send an empty/invalid reply_to to Resend.
        ...(safeReplyTo ? { reply_to: safeReplyTo } : {}),
        subject: safeSubject,
        html: fullHtml,
        // Deliverability/spam-score signal — every send needs a text part,
        // not just the HTML-only body this file used to send exclusively.
        text: plainTextFromEmailHtml(fullHtml),
        // Gmail/Yahoo bulk-sender requirements (effective 2024-02) require a
        // List-Unsubscribe + List-Unsubscribe-Post header pair pointing at a
        // one-click endpoint on every outbound message, not just a footer
        // link buried in the HTML body — inbox providers read these headers
        // directly to decide spam-folder placement and to offer their own
        // native "Unsubscribe" affordance next to the sender name. The URL
        // is the exact same signed unsubscribeUrl already in the footer
        // (raw, not HTML-escaped — this is a mail header value, not markup),
        // and /api/unsubscribe now has a POST handler (RFC 8058) so a mail
        // client's automated one-click request actually succeeds instead of
        // 405ing (see verifyAndSuppress / POST in
        // src/app/api/unsubscribe/route.ts) — advertising one-click support
        // via headers alone, without that POST handler, would itself be a
        // spam signal once a provider probes it.
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resend API response: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`[Email Sent via Resend] ID: ${data.id} to ${to}`);
    return { success: true as const, emailId: data.id };
  } catch (error) {
    console.error(`Failed to send email to ${to} via Resend:`, error);
    return { success: false as const, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Sends the initial outreach email with a preview link (Email 1).
 */
export async function sendOutreachEmail(to: string, businessName: string, slug: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const previewUrl = previewUrlWithOutreachTracking(leadPreviewAbsoluteUrl(baseUrl, slug));
  const checkoutUrl = `${baseUrl}/checkout?slug=${encodeURIComponent(slug)}`;
  const safePreviewUrl = escapeHtmlForEmail(previewUrl);
  const safeCheckoutUrl = escapeHtmlForEmail(checkoutUrl);

  const subject = `${businessName} — we built your website (free preview)`;
  const html = `
    <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 16px;">Hello ${escapeHtmlForEmail(businessName)} Team,</h2>
    <p style="margin-bottom: 16px;">We've built a custom preview website for your business. It is fully mobile-responsive and tailored to your services.</p>
    <p style="margin-bottom: 24px;">You can view the site and test it live at the link below:</p>
    <div style="margin-bottom: 24px; text-align: center;">
      <a href="${safePreviewUrl}" style="background-color: #18181b; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">View Your Preview Site</a>
    </div>
    <p style="margin-bottom: 16px;">If you'd like to launch this site under your own custom domain, set up contact forms, or enable online booking/payments, you can <a href="${safeCheckoutUrl}" style="color: #2563eb;">claim it on checkout</a> from the preview page.</p>
    <p style="margin-bottom: 8px;">Best regards,</p>
    <p style="font-weight: 500; margin-top: 0;">The ${escapeHtmlForEmail(brand.name)} Team</p>
  `;

  return sendEmail({ to, subject, html, leadSlug: slug });
}

/**
 * Email 2 — short reminder with preview + checkout. Operator-triggered after Email 1 gap.
 */
export async function sendOutreachFollowUp2(
  to: string,
  businessName: string,
  slug: string,
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const previewUrl = previewUrlWithOutreachTracking(leadPreviewAbsoluteUrl(baseUrl, slug));
  const checkoutUrl = `${baseUrl}/checkout?slug=${encodeURIComponent(slug)}`;
  const safePreviewUrl = escapeHtmlForEmail(previewUrl);
  const safeCheckoutUrl = escapeHtmlForEmail(checkoutUrl);

  const subject = `Quick nudge: your ${businessName} preview is ready`;
  const html = `
    <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 16px;">Still thinking it over?</h2>
    <p style="margin-bottom: 16px;">Your preview for <strong>${escapeHtmlForEmail(businessName)}</strong> is still live — contact form, map, and mobile layout included.</p>
    <p style="margin-bottom: 24px;">Most owners pick a plan in a few minutes from the preview page:</p>
    <div style="margin-bottom: 16px; text-align: center;">
      <a href="${safePreviewUrl}" style="background-color: #18181b; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">Open preview</a>
    </div>
    <p style="margin-bottom: 16px; text-align: center; font-size: 14px;">
      Or go straight to <a href="${safeCheckoutUrl}" style="color: #2563eb;">checkout</a>.
    </p>
    <p style="margin-bottom: 8px;">Best regards,</p>
    <p style="font-weight: 500; margin-top: 0;">The ${escapeHtmlForEmail(brand.name)} Team</p>
  `;

  return sendEmail({ to, subject, html, leadSlug: slug });
}

/**
 * Email 3 — final soft close before we stop the sequence.
 */
export async function sendOutreachFollowUp3(
  to: string,
  businessName: string,
  slug: string,
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const previewUrl = previewUrlWithOutreachTracking(leadPreviewAbsoluteUrl(baseUrl, slug));
  const checkoutUrl = `${baseUrl}/checkout?slug=${encodeURIComponent(slug)}`;
  const safePreviewUrl = escapeHtmlForEmail(previewUrl);
  const safeCheckoutUrl = escapeHtmlForEmail(checkoutUrl);

  const subject = `Last note about the ${businessName} site preview`;
  const html = `
    <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 16px;">Closing the loop</h2>
    <p style="margin-bottom: 16px;">This is our last automated note about the preview we built for <strong>${escapeHtmlForEmail(businessName)}</strong>.</p>
    <p style="margin-bottom: 16px;">If now isn't the right time, no worries — you can still open the preview later, or reply to this email if you have questions.</p>
    <div style="margin-bottom: 16px; text-align: center;">
      <a href="${safePreviewUrl}" style="background-color: #18181b; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">View preview one more time</a>
    </div>
    <p style="margin-bottom: 16px; text-align: center; font-size: 14px;">
      Ready to launch? <a href="${safeCheckoutUrl}" style="color: #2563eb;">Choose a plan</a>.
    </p>
    <p style="margin-bottom: 8px;">Thank you,</p>
    <p style="font-weight: 500; margin-top: 0;">The ${escapeHtmlForEmail(brand.name)} Team</p>
  `;

  return sendEmail({ to, subject, html, leadSlug: slug });
}

/**
 * Which escalation tier a recovery nudge falls into. Mirrors the outreach
 * Email 1/2/3 cadence (sendOutreachEmail/FollowUp2/FollowUp3): tier 1 is the
 * original reassurance framing, tier 2 answers the most common objection
 * (easy to finish, real human on the other end), tier 3 is a final soft
 * close. nudgeNumber is 1-indexed (the first nudge ever sent for a session);
 * anything past 3 stays on the tier-3 copy rather than growing new variants
 * forever — RECOVERY_COOLDOWN_DAYS lets an operator re-click indefinitely.
 */
function recoveryNudgeTier(nudgeNumber: number): 1 | 2 | 3 {
  if (nudgeNumber <= 1) return 1;
  if (nudgeNumber === 2) return 2;
  return 3;
}

/**
 * Abandoned-checkout recovery nudge — operator-triggered when a Stripe Checkout
 * Session was created but not completed (see src/lib/checkout/abandoned-recovery.ts).
 * Bundle plan checkouts only — commerce Buy now uses sendCommerceAbandonedRecovery.
 *
 * nudgeNumber (default 1, see recoveryNudgeTier) varies subject/copy across
 * repeat sends on the same session so a second or third nudge doesn't read as
 * a copy-paste of the first — see recovery-email-escalating-cadence.
 */
export async function sendCheckoutAbandonedRecovery(
  to: string,
  businessName: string,
  slug: string,
  tier: string,
  nudgeNumber = 1,
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const checkoutUrl = `${baseUrl}/checkout?slug=${encodeURIComponent(slug)}&tier=${encodeURIComponent(tier)}`;
  const safeCheckoutUrl = escapeHtmlForEmail(checkoutUrl);
  const safeBiz = escapeHtmlForEmail(businessName);

  const nudgeTier = recoveryNudgeTier(nudgeNumber);
  const subject =
    nudgeTier === 1
      ? `Still want to launch ${businessName}?`
      : nudgeTier === 2
        ? `Any questions about launching ${businessName}?`
        : `Last reminder: your ${businessName} checkout is still open`;
  const heading =
    nudgeTier === 1
      ? "Your checkout is still open"
      : nudgeTier === 2
        ? "It only takes a couple of minutes"
        : "Closing the loop";
  const body =
    nudgeTier === 1
      ? `<p style="margin-bottom: 16px;">Looks like you started setting up a plan for <strong>${safeBiz}</strong> but didn't finish. Nothing was charged.</p><p style="margin-bottom: 24px;">Pick up right where you left off — your plan and details are still saved:</p>`
      : nudgeTier === 2
        ? `<p style="margin-bottom: 16px;">Your plan for <strong>${safeBiz}</strong> is still saved and nothing has been charged yet. Most owners finish checkout in a couple of minutes — pricing and setup are shown up front, and there's no sales call.</p><p style="margin-bottom: 24px;">If something's unclear, just reply to this email and a real person will answer:</p>`
        : `<p style="margin-bottom: 16px;">This is our last automated note about the plan we saved for <strong>${safeBiz}</strong>. Nothing was charged.</p><p style="margin-bottom: 16px;">If now isn't the right time, no worries — the link below still works whenever you're ready, or reply if you have questions.</p>`;
  const cta = nudgeTier === 3 ? "Finish checkout when ready" : "Finish checkout";
  const html = `
    <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 16px;">${heading}</h2>
    ${body}
    <div style="margin-bottom: 16px; text-align: center;">
      <a href="${safeCheckoutUrl}" style="background-color: #18181b; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">${cta}</a>
    </div>
    <p style="margin-bottom: 16px; text-align: center; font-size: 14px;">Questions first? Just reply to this email.</p>
    <p style="margin-bottom: 8px;">Best regards,</p>
    <p style="font-weight: 500; margin-top: 0;">The ${escapeHtmlForEmail(brand.name)} Team</p>
  `;

  return sendEmail({ to, subject, html, leadSlug: slug });
}

/**
 * Commerce Buy now abandoned-cart recovery — links back to the client's preview
 * catalog, never /checkout?tier= (that would pitch a Local Site Studio plan).
 *
 * nudgeNumber (default 1, see recoveryNudgeTier) mirrors
 * sendCheckoutAbandonedRecovery's escalating-cadence copy.
 */
export async function sendCommerceAbandonedRecovery(
  to: string,
  businessName: string,
  slug: string,
  skuLabel: string,
  nudgeNumber = 1,
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const catalogUrl = `${leadPreviewAbsoluteUrl(baseUrl, slug)}#catalog`;
  const safeSku = escapeHtmlForEmail(skuLabel);
  const safeBiz = escapeHtmlForEmail(businessName);
  const safeCatalogUrl = escapeHtmlForEmail(catalogUrl);

  const nudgeTier = recoveryNudgeTier(nudgeNumber);
  const subject =
    nudgeTier === 1
      ? `Still interested in ${skuLabel} from ${businessName}?`
      : nudgeTier === 2
        ? `Quick question about your ${skuLabel} order`
        : `Last reminder: your ${skuLabel} order is still open`;
  const heading =
    nudgeTier === 1
      ? "Your order is still open"
      : nudgeTier === 2
        ? "Still there whenever you're ready"
        : "Closing the loop";
  const body =
    nudgeTier === 1
      ? `<p style="margin-bottom: 16px;">Looks like you started checking out <strong>${safeSku}</strong> from <strong>${safeBiz}</strong> but didn't finish. Nothing was charged.</p><p style="margin-bottom: 24px;">Jump back to the menu to complete your purchase:</p>`
      : nudgeTier === 2
        ? `<p style="margin-bottom: 16px;"><strong>${safeSku}</strong> from <strong>${safeBiz}</strong> is still in your cart and nothing has been charged. If something didn't work at checkout or you have a question, just reply to this email.</p><p style="margin-bottom: 24px;">Otherwise, pick up where you left off:</p>`
        : `<p style="margin-bottom: 16px;">This is the last automated note about <strong>${safeSku}</strong> from <strong>${safeBiz}</strong>. Nothing was charged.</p><p style="margin-bottom: 16px;">The menu link below still works whenever you're ready, or reply if you have questions.</p>`;
  const cta = nudgeTier === 3 ? "Return to menu when ready" : "Return to menu";
  const html = `
    <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 16px;">${heading}</h2>
    ${body}
    <div style="margin-bottom: 16px; text-align: center;">
      <a href="${safeCatalogUrl}" style="background-color: #18181b; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">${cta}</a>
    </div>
    <p style="margin-bottom: 16px; text-align: center; font-size: 14px;">Questions? Just reply to this email.</p>
    <p style="margin-bottom: 8px;">Best regards,</p>
    <p style="font-weight: 500; margin-top: 0;">${safeBiz}</p>
    <p style="font-size: 12px; color: #71717a; margin-top: 4px;">Powered by ${escapeHtmlForEmail(brand.name)}</p>
  `;

  return sendEmail({ to, subject, html, leadSlug: slug });
}

/**
 * Operator reply to a website contact-form inquiry (dashboard inbox).
 * Starter sold CRM product mail to the visitor — skip marketing suppression
 * so a cold-outreach unsubscribe on the same address cannot permanently
 * block the Reply half of the contact-form loop (inquiry is already marked
 * replied via persist-then-notify). Still uses the CAN-SPAM footer.
 */
export async function sendInquiryReply(params: {
  to: string;
  businessName: string;
  leadSlug: string;
  replyBody: string;
  originalMessage: string;
  inquirerName?: string;
  replyTo?: string;
}) {
  const {
    to,
    businessName,
    leadSlug,
    replyBody,
    originalMessage,
    inquirerName,
    replyTo,
  } = params;
  const greeting = inquirerName?.trim()
    ? `Hello ${escapeHtmlForEmail(inquirerName.trim())},`
    : "Hello,";
  const subject = `Re: your message to ${businessName}`;
  const html = `
    <p style="margin-bottom: 16px;">${greeting}</p>
    ${plainTextToEmailHtml(replyBody)}
    <p style="margin: 24px 0 8px 0; font-weight: 500;">The ${escapeHtmlForEmail(brand.name)} Team</p>
    <p style="margin-bottom: 8px; font-size: 12px; color: #71717a;">
      On behalf of <strong>${escapeHtmlForEmail(businessName)}</strong>
    </p>
    <hr style="border: 0; border-top: 1px solid #e4e4e7; margin: 24px 0;" />
    <p style="margin-bottom: 8px; font-size: 12px; color: #71717a;">
      Your original message:
    </p>
    <blockquote style="margin: 0; padding: 12px 16px; border-left: 3px solid #d4d4d8; color: #52525b; font-size: 13px;">
      ${plainTextToEmailHtml(originalMessage)}
    </blockquote>
  `;

  return sendEmail({
    to,
    subject,
    html,
    leadSlug,
    skipSuppression: true,
    replyTo,
  });
}

/**
 * Operator daily digest — internal notification, not outreach to a prospect.
 * Skips the suppression check and CAN-SPAM footer (those exist to protect
 * prospects who opted out, not the operator's own inbox) but reuses the same
 * Resend call / mock fallback as every other send helper here.
 */
export async function sendOperatorDailyDigest(to: string, html: string) {
  const subject = sanitizeEmailSubject(`${brand.name} — daily digest`);

  if (!resendApiKey || resendApiKey.startsWith("re_placeholder") || resendApiKey === "re_...") {
    console.log(`[Mock Email Sent]
To: ${to}
Subject: ${subject}
Content Preview: ${html.substring(0, 150)}...`);
    return { success: true as const, mock: true };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // EMAIL_FROM (brand.emailFrom) — never hardcode a platform domain.
        from: formatResendFromHeader(brand.name, brand.emailFrom),
        to: [to],
        subject,
        html,
        text: plainTextFromEmailHtml(html),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resend API response: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`[Email Sent via Resend] ID: ${data.id} to ${to}`);
    return { success: true as const, emailId: data.id };
  } catch (error) {
    console.error(`Failed to send daily digest to ${to} via Resend:`, error);
    return { success: false as const, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Paid Starter → Growth/Complete upsell nudge — operator-triggered from
 * /dashboard/leads when the lead has a Starter-only order and no recurring yet.
 * See src/lib/billing/starter-upsell.ts + /docs/process (paid-starter-upsell-nudge).
 */
export async function sendStarterUpsellEmail(params: {
  to: string;
  businessName: string;
  slug: string;
  targetTier: "growth" | "complete";
  monthlyPriceUsd: number;
}) {
  const { to, businessName, slug, targetTier, monthlyPriceUsd } = params;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  // Reuse the dedicated, tested path builder (src/lib/billing/starter-upsell.ts)
  // instead of hand-duplicating the slug/tier query string here — this file
  // and that helper were both added in the same original commit
  // (paid-starter-upsell-nudge) but were never actually wired together, so a
  // future change to the query-string shape there (e.g. adding a UTM param,
  // fixing the un-trimmed slug this hand-duplicate lacked) could silently
  // fail to reach this, the only place the link is actually sent to a
  // customer. See starter-upsell-checkout-url-single-source-of-truth.
  const checkoutUrl = `${baseUrl}${buildStarterUpsellCheckoutPath(slug, targetTier)}`;
  const previewUrl = leadPreviewAbsoluteUrl(baseUrl, slug);
  const safeCheckoutUrl = escapeHtmlForEmail(checkoutUrl);
  const safePreviewUrl = escapeHtmlForEmail(previewUrl);
  const tierLabel = targetTier === "complete" ? "Complete" : "Growth";
  // Cadence derives from MONTHLY_MARKETING_PACK_TYPES, never hand-typed —
  // see monthly-marketing-pack-cadence-single-source-of-truth (prompt_process.tsx).
  const monthlyMarketingCadence = `${monthlyMarketingSocialPostCount()} social/GBP posts + ${monthlyMarketingEmailCount()} emails`;
  const marketingLine =
    targetTier === "complete"
      ? `AI marketing (${monthlyMarketingCadence}/month) plus a client AI phone agent that answers your business line.`
      : `an AI marketing engine: ${monthlyMarketingCadence} per month, written from your site data.`;

  const subject = `${businessName} — add ${tierLabel} marketing ($${monthlyPriceUsd}/mo)`;
  const html = `
    <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 16px;">Ready for more customers?</h2>
    <p style="margin-bottom: 16px;">Your <strong>${escapeHtmlForEmail(businessName)}</strong> site is already live on ${escapeHtmlForEmail(brand.name)} Starter. The next step is <strong>${tierLabel}</strong> at <strong>$${monthlyPriceUsd}/mo</strong> — ${marketingLine}</p>
    <p style="margin-bottom: 16px;">Setup is already covered by what you paid. Upgrade when you want the monthly engine turned on:</p>
    <div style="margin-bottom: 16px; text-align: center;">
      <a href="${safeCheckoutUrl}" style="background-color: #18181b; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">Upgrade to ${tierLabel}</a>
    </div>
    <p style="margin-bottom: 16px; text-align: center; font-size: 14px;">
      Or revisit your <a href="${safePreviewUrl}" style="color: #2563eb;">site preview</a> first.
    </p>
    <p style="margin-bottom: 8px;">Questions? Just reply — happy to walk through Growth vs Complete.</p>
    <p style="font-weight: 500; margin-top: 0;">The ${escapeHtmlForEmail(brand.name)} Team</p>
  `;

  return sendEmail({ to, subject, html, leadSlug: slug });
}

/**
 * Recurring-renewal payment-failed dunning notice — sent from the Stripe
 * webhook's invoice.payment_failed handler (see recurring-payment-failed-
 * dunning-notice). One send per failed billing attempt (Stripe fires a
 * distinct invoice.payment_failed per Smart Retry attempt), not per
 * subscription.updated status change, so a single failed renewal does not
 * double-send. Passes skipSuppression: true — this is billing-critical like
 * the receipt/DNS/Commerce-receipt sends, not cold marketing (a prior
 * outreach unsubscribe must not hide a card-decline notice from a paying
 * customer). manageBillingUrl reuses the original Checkout Session's
 * /checkout/success page (stripeSessionId never expires server-side, unlike
 * the Checkout Session's own 24h hosted `url`) so this needs no fresh Stripe
 * Billing Portal API call from inside the webhook.
 */
export async function sendPaymentFailedNotice(params: {
  to: string;
  businessName: string;
  slug: string;
  stripeSessionId: string;
}) {
  const { to, businessName, slug, stripeSessionId } = params;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const manageBillingUrl = `${baseUrl}/checkout/success?session_id=${encodeURIComponent(stripeSessionId)}`;
  const safeBiz = escapeHtmlForEmail(businessName);
  const safeBrand = escapeHtmlForEmail(brand.name);
  const safeManageBillingUrl = escapeHtmlForEmail(manageBillingUrl);

  const subject = `Action needed: your ${brand.name} payment did not go through`;
  const html = `
    <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 16px;">We couldn't process your latest payment</h2>
    <p style="margin-bottom: 16px;">Your card on file for <strong>${safeBiz}</strong> was declined for this month's ${escapeHtmlForEmail(brand.name)} subscription. Your service stays paused until this is resolved.</p>
    <div style="margin-bottom: 16px; text-align: center;">
      <a href="${safeManageBillingUrl}" style="background-color: #18181b; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">Update payment method</a>
    </div>
    <p style="margin-bottom: 8px;">Once your card is updated, Stripe will automatically retry the charge and your subscription resumes.</p>
    <p style="font-weight: 500; margin-top: 0;">The ${safeBrand} Team</p>
  `;

  return sendEmail({ to, subject, html, leadSlug: slug, skipSuppression: true });
}

/**
 * Recurring-renewal payment-recovered confirmation — sent from the Stripe
 * webhook's invoice.paid handler, but only when that event actually cleared
 * a prior recurringCanceledAt pause (see payment-recovered-confirmation-
 * notice). sendPaymentFailedNotice told the customer their service paused;
 * without this twin the customer who updates their card gets no signal that
 * service resumed and may assume they're still locked out. Passes
 * skipSuppression: true — billing-critical, same class as the dunning
 * notice, not cold marketing. Reuses the same /checkout/success Manage-
 * billing link so this needs no fresh Stripe Billing Portal API call from
 * inside the webhook.
 */
export async function sendPaymentRecoveredNotice(params: {
  to: string;
  businessName: string;
  slug: string;
  stripeSessionId: string;
}) {
  const { to, businessName, slug, stripeSessionId } = params;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const manageBillingUrl = `${baseUrl}/checkout/success?session_id=${encodeURIComponent(stripeSessionId)}`;
  const safeBiz = escapeHtmlForEmail(businessName);
  const safeBrand = escapeHtmlForEmail(brand.name);
  const safeManageBillingUrl = escapeHtmlForEmail(manageBillingUrl);

  const subject = `Your ${brand.name} payment succeeded — service resumed`;
  const html = `
    <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 16px;">You're all set</h2>
    <p style="margin-bottom: 16px;">We successfully charged your card on file for <strong>${safeBiz}</strong>'s ${escapeHtmlForEmail(brand.name)} subscription. Your service is active again — nothing else to do.</p>
    <div style="margin-bottom: 16px; text-align: center;">
      <a href="${safeManageBillingUrl}" style="background-color: #18181b; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">Manage billing</a>
    </div>
    <p style="font-weight: 500; margin-top: 0;">The ${safeBrand} Team</p>
  `;

  return sendEmail({ to, subject, html, leadSlug: slug, skipSuppression: true });
}

/**
 * Subscription-pause notice — sent from the Stripe webhook's
 * customer.subscription.updated handler specifically when Stripe
 * pause_collection is set (billing paused with the Subscription otherwise
 * left active/trialing — see subscription-pause-collection-notice). This is
 * a distinct customer-facing event from a failed card charge: no invoice
 * ever fails, so sendPaymentFailedNotice's "your payment did not go through"
 * copy would misinform a customer whose card is fine but whose collection
 * was paused (by the operator, a support agent, or the customer via Billing
 * Portal). Passes skipSuppression: true — billing-critical, same class as
 * the dunning notice, not cold marketing.
 */
export async function sendSubscriptionPausedNotice(params: {
  to: string;
  businessName: string;
  slug: string;
  stripeSessionId: string;
}) {
  const { to, businessName, slug, stripeSessionId } = params;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const manageBillingUrl = `${baseUrl}/checkout/success?session_id=${encodeURIComponent(stripeSessionId)}`;
  const safeBiz = escapeHtmlForEmail(businessName);
  const safeBrand = escapeHtmlForEmail(brand.name);
  const safeManageBillingUrl = escapeHtmlForEmail(manageBillingUrl);

  const subject = `Your ${brand.name} subscription billing is paused`;
  const html = `
    <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 16px;">Your subscription is paused</h2>
    <p style="margin-bottom: 16px;">Billing has been paused for <strong>${safeBiz}</strong>'s ${escapeHtmlForEmail(brand.name)} subscription — no further charges will be made while it stays paused. Your account is not being charged and your card was not declined.</p>
    <div style="margin-bottom: 16px; text-align: center;">
      <a href="${safeManageBillingUrl}" style="background-color: #18181b; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">Manage billing</a>
    </div>
    <p style="margin-bottom: 8px;">If this wasn't expected, visit Manage billing above or reply to this email and we'll help sort it out.</p>
    <p style="font-weight: 500; margin-top: 0;">The ${safeBrand} Team</p>
  `;

  return sendEmail({ to, subject, html, leadSlug: slug, skipSuppression: true });
}

/**
 * Restore twin of sendSubscriptionPausedNotice — sent from
 * customer.subscription.updated when Stripe pause_collection is cleared
 * (billing resumes) after having been set (see
 * subscription-pause-collection-notice). Passes skipSuppression: true, same
 * class as sendPaymentRecoveredNotice.
 */
export async function sendSubscriptionResumedNotice(params: {
  to: string;
  businessName: string;
  slug: string;
  stripeSessionId: string;
}) {
  const { to, businessName, slug, stripeSessionId } = params;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const manageBillingUrl = `${baseUrl}/checkout/success?session_id=${encodeURIComponent(stripeSessionId)}`;
  const safeBiz = escapeHtmlForEmail(businessName);
  const safeBrand = escapeHtmlForEmail(brand.name);
  const safeManageBillingUrl = escapeHtmlForEmail(manageBillingUrl);

  const subject = `Your ${brand.name} subscription billing has resumed`;
  const html = `
    <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 16px;">Billing has resumed</h2>
    <p style="margin-bottom: 16px;">Billing has resumed for <strong>${safeBiz}</strong>'s ${escapeHtmlForEmail(brand.name)} subscription — your service is active again.</p>
    <div style="margin-bottom: 16px; text-align: center;">
      <a href="${safeManageBillingUrl}" style="background-color: #18181b; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">Manage billing</a>
    </div>
    <p style="font-weight: 500; margin-top: 0;">The ${safeBrand} Team</p>
  `;

  return sendEmail({ to, subject, html, leadSlug: slug, skipSuppression: true });
}

/**
 * Operator-triggered delivery of this month's marketing pack to the client
 * (Growth/Complete sold content handoff without Buffer/GBP OAuth).
 * Passes skipSuppression: true — this is paid feature delivery to lead.email,
 * not cold marketing (see marketing-voice-pack-skip-suppression).
 * See src/lib/marketing/deliver-pack.ts + /docs/process (deliver-marketing-pack-to-client).
 */
export async function sendMarketingPackToClientEmail(params: {
  to: string;
  businessName: string;
  slug: string;
  yearMonth: string;
  variants: MarketingContentVariant[];
  previewUrl?: string;
}) {
  const { to, businessName, slug, yearMonth, variants, previewUrl } = params;
  const subject = marketingPackDeliverySubject(businessName, yearMonth);
  const html = formatMarketingPackEmailHtml({
    businessName,
    yearMonth,
    variants,
    previewUrl,
  });

  return sendEmail({ to, subject, html, leadSlug: slug, skipSuppression: true });
}

/**
 * Operator-triggered delivery of the Complete voice FAQ/script pack to the client
 * (phone-script handoff without Twilio). Passes skipSuppression: true — paid
 * Complete feature delivery to lead.email, not cold marketing (see
 * marketing-voice-pack-skip-suppression). See src/lib/voice/deliver-pack.ts +
 * /docs/process (deliver-client-voice-pack-to-client).
 */
export async function sendClientVoicePackToClientEmail(params: {
  to: string;
  businessName: string;
  slug: string;
  variants: ClientVoiceScriptVariant[];
  previewUrl?: string;
}) {
  const { to, businessName, slug, variants, previewUrl } = params;
  const subject = clientVoicePackDeliverySubject(businessName);
  const html = formatClientVoicePackEmailHtml({
    businessName,
    variants,
    previewUrl,
  });

  return sendEmail({ to, subject, html, leadSlug: slug, skipSuppression: true });
}

/**
 * Notify a commerceAddon lead that their end-customer completed a Buy now
 * purchase (Commerce "order notifications" sold promise). Billing-critical —
 * skips marketing suppression so a prior cold-outreach unsubscribe cannot
 * block order-notification delivery after money is taken. Distinct from
 * sendReceiptEmail (platform bundle buyer receipt).
 * See src/lib/commerce/client-receipt.ts + /docs/process (commerce-buy-now-client-receipt).
 */
export async function sendCommerceBuyNowClientReceipt(params: {
  to: string;
  businessName: string;
  slug: string;
  skuName: string;
  amountTotalUsd: number;
  stripeSessionId: string;
  customerEmail?: string;
  previewUrl?: string;
  quantity?: number;
}) {
  const {
    to,
    businessName,
    slug,
    skuName,
    amountTotalUsd,
    stripeSessionId,
    customerEmail,
    previewUrl,
    quantity,
  } = params;
  const subject = commerceBuyNowClientReceiptSubject(businessName, skuName);
  const html = formatCommerceBuyNowClientReceiptHtml({
    businessName,
    skuName,
    amountTotalUsd,
    customerEmail,
    stripeSessionId,
    previewUrl,
    quantity,
  });

  return sendEmail({
    to,
    subject,
    html,
    leadSlug: slug,
    skipSuppression: true,
    replyTo: customerEmail,
  });
}

/**
 * Sends a transactional order receipt email.
 * Always delivers after payment — skip marketing suppression so a prior
 * cold-outreach unsubscribe cannot block go-live fulfillment.
 */
export async function sendReceiptEmail(to: string, businessName: string, tier: string, amount: number) {
  // Prefer catalog display name (Growth) over raw id UPPERCASE; always escape —
  // webhook now enum-gates tier, but callers/tests may still pass free text
  // (bundle-webhook-tier-enum-guard).
  const tierLabel = getBundle(tier)?.name ?? tier.toUpperCase();
  const safeTier = escapeHtmlForEmail(tierLabel);
  const subject = `Your receipt for ${businessName} - ${brand.name}`;
  const html = `
    <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 16px;">Thank you for your order!</h2>
    <p style="margin-bottom: 16px;">We have received your payment for the <strong>${safeTier}</strong> setup plan for <strong>${escapeHtmlForEmail(businessName)}</strong>.</p>
    <p style="margin-bottom: 16px;">Total paid: <strong>$${amount.toFixed(2)}</strong></p>
    <p style="margin-bottom: 24px;">Our team is already beginning to configure your final custom domain and publish your site. You'll receive a separate email shortly with DNS setup instructions and next steps.</p>
    <p style="margin-bottom: 8px;">Warmly,</p>
    <p style="font-weight: 500; margin-top: 0;">The ${escapeHtmlForEmail(brand.name)} Team</p>
  `;

  return sendEmail({ to, subject, html, skipSuppression: true });
}

/**
 * Deliver the post-payment DNS / go-live handoff instructions to a bundle
 * buyer. Extracted out of the checkout.session.completed webhook handler
 * (which built this HTML inline) so a dashboard "Resend" action can reuse
 * the exact same template instead of duplicating it — the "extract the DNS
 * email into a reusable helper" follow-up PR #765 (bundle-order-missing-
 * buyer-email-visibility) deliberately deferred, closed by
 * bundle-dns-handoff-email-manual-resend. skipSuppression: true — same
 * billing-critical class as sendReceiptEmail above (post-payment handoff,
 * not cold marketing).
 */
export async function sendBundleDnsHandoffEmail(params: {
  to: string;
  businessName: string;
  slug: string;
  handoff: DeployHandoff;
}) {
  const { to, businessName, slug, handoff } = params;
  const safeBiz = escapeHtmlForEmail(businessName);
  const safeBrand = escapeHtmlForEmail(brand.name);
  const subject = `Next steps: go live with ${businessName} — ${brand.name}`;
  const html = `
                <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 16px;">Your site is ready to publish</h2>
                <p style="margin-bottom: 16px;">Payment received for <strong>${safeBiz}</strong>. Here is your production handoff:</p>
                ${formatDnsInstructionsForEmail(handoff)}
                <p style="margin-bottom: 8px;">Reply to this email if you want us to finish DNS for you.</p>
                <p style="font-weight: 500; margin-top: 0;">The ${safeBrand} Team</p>
              `;

  return sendEmail({ to, subject, html, leadSlug: slug, skipSuppression: true });
}

/**
 * Deliver a freshly-generated Stripe Connect Express onboarding link
 * directly to the client (stripe-connect-onboarding-link-email-delivery,
 * closing the tier-6 gap named in AGENT_PROTOCOL — "onboarding-link
 * expiry/retry handling"). Stripe account_onboarding Account Links are
 * single-use and expire quickly if not opened, so the prior operator flow
 * (dashboard "copy to clipboard" + manually pasting into a separate email/
 * text to the client) routinely handed the client an already-dead link by
 * the time they clicked it. Emailing the link in the same request that
 * generates it removes that manual hand-off delay entirely. skipSuppression:
 * true — this is a post-sale money-onboarding step, same billing-critical
 * class as the dunning/billing-portal notices, not cold marketing. Callers
 * must still treat the link as short-lived (createStripeConnectOnboardingLinkAction
 * mints one immediately before this call, never a cached/stored one) and may
 * re-send if the client didn't act on it in time.
 */
export async function sendStripeConnectOnboardingLinkEmail(params: {
  to: string;
  businessName: string;
  slug: string;
  onboardingUrl: string;
}) {
  const { to, businessName, slug, onboardingUrl } = params;
  const safeBiz = escapeHtmlForEmail(businessName);
  const safeBrand = escapeHtmlForEmail(brand.name);
  const safeOnboardingUrl = escapeHtmlForEmail(onboardingUrl);

  const subject = `Action needed: set up payouts for ${businessName}`;
  const html = `
    <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 16px;">Set up your payout account</h2>
    <p style="margin-bottom: 16px;">Hi <strong>${safeBiz}</strong> — to receive payouts from your Buy now sales, finish setting up your Stripe payout account below.</p>
    <div style="margin-bottom: 16px; text-align: center;">
      <a href="${safeOnboardingUrl}" style="background-color: #18181b; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">Set up payouts</a>
    </div>
    <p style="margin-bottom: 16px; font-size: 14px; color: #52525b;">This link is single-use and expires quickly — please open it now rather than saving it for later. If it's expired by the time you click it, just reply to this email and we'll send a fresh one.</p>
    <p style="font-weight: 500; margin-top: 0;">The ${safeBrand} Team</p>
  `;

  return sendEmail({ to, subject, html, leadSlug: slug, skipSuppression: true });
}
