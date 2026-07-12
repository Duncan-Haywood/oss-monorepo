import { isEmailSuppressed } from "../db";
import { brand } from "../brand";
import { previewUrlWithOutreachTracking } from "../leads/preview-open";
import { escapeHtmlForEmail, plainTextToEmailHtml } from "../inquiries/reply";
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

const resendApiKey = process.env.RESEND_API_KEY;

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  leadSlug?: string;
}

export async function sendEmail({ to, subject, html, leadSlug }: SendEmailParams) {
  const normalizedTo = to.toLowerCase().trim();

  // 1. Check suppression list
  const suppressed = await isEmailSuppressed(normalizedTo);
  if (suppressed) {
    console.warn(`[Email Skipped] Address ${to} is in the suppression list.`);
    return { success: false, reason: "suppressed" };
  }

  // Determine base URL for unsubscribe link
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const unsubscribeUrl = `${baseUrl}/api/unsubscribe?email=${encodeURIComponent(normalizedTo)}`;

  // Wrap HTML content with standard CAN-SPAM footer
  const fullHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #18181b; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="margin-bottom: 30px;">
        ${html}
      </div>
      <hr style="border: 0; border-top: 1px solid #e4e4e7; margin: 30px 0;" />
      <footer style="font-size: 12px; color: #71717a; text-align: center; line-height: 1.5;">
        <p>This email was sent by ${brand.name} to business contacts of interest.</p>
        <p>${brand.legalEntity} · ${brand.postalAddress}</p>
        <p>
          <a href="${unsubscribeUrl}" style="color: #2563eb; text-decoration: underline;">Unsubscribe</a> | 
          <a href="${baseUrl}/privacy" style="color: #2563eb; text-decoration: underline;">Privacy Policy</a>
        </p>
      </footer>
    </div>
  `;

  // 2. Check if Resend is configured
  if (!resendApiKey || resendApiKey.startsWith("re_placeholder") || resendApiKey === "re_...") {
    console.log(`[Mock Email Sent]
To: ${to}
Subject: ${subject}
Lead: ${leadSlug || "None"}
Content Preview: ${html.substring(0, 150)}...
CAN-SPAM Footer: Applied (${brand.postalAddress})
Unsubscribe URL: ${unsubscribeUrl}`);
    return { success: true, mock: true };
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
        from: `${brand.name} <outreach@updates.localsitestudio.com>`,
        to: [to],
        subject,
        html: fullHtml,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resend API response: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`[Email Sent via Resend] ID: ${data.id} to ${to}`);
    return { success: true, emailId: data.id };
  } catch (error) {
    console.error(`Failed to send email to ${to} via Resend:`, error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Sends the initial outreach email with a preview link (Email 1).
 */
export async function sendOutreachEmail(to: string, businessName: string, slug: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const previewUrl = previewUrlWithOutreachTracking(`${baseUrl}/preview/${slug}`);
  const checkoutUrl = `${baseUrl}/checkout?slug=${encodeURIComponent(slug)}`;

  const subject = `${businessName} — we built your website (free preview)`;
  const html = `
    <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 16px;">Hello ${businessName} Team,</h2>
    <p style="margin-bottom: 16px;">We've built a custom preview website for your business. It is fully mobile-responsive and tailored to your services.</p>
    <p style="margin-bottom: 24px;">You can view the site and test it live at the link below:</p>
    <div style="margin-bottom: 24px; text-align: center;">
      <a href="${previewUrl}" style="background-color: #18181b; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">View Your Preview Site</a>
    </div>
    <p style="margin-bottom: 16px;">If you'd like to launch this site under your own custom domain, set up contact forms, or enable online booking/payments, you can <a href="${checkoutUrl}" style="color: #2563eb;">claim it on checkout</a> from the preview page.</p>
    <p style="margin-bottom: 8px;">Best regards,</p>
    <p style="font-weight: 500; margin-top: 0;">The ${brand.name} Team</p>
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
  const previewUrl = previewUrlWithOutreachTracking(`${baseUrl}/preview/${slug}`);
  const checkoutUrl = `${baseUrl}/checkout?slug=${encodeURIComponent(slug)}`;

  const subject = `Quick nudge: your ${businessName} preview is ready`;
  const html = `
    <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 16px;">Still thinking it over?</h2>
    <p style="margin-bottom: 16px;">Your preview for <strong>${businessName}</strong> is still live — contact form, map, and mobile layout included.</p>
    <p style="margin-bottom: 24px;">Most owners pick a plan in a few minutes from the preview page:</p>
    <div style="margin-bottom: 16px; text-align: center;">
      <a href="${previewUrl}" style="background-color: #18181b; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">Open preview</a>
    </div>
    <p style="margin-bottom: 16px; text-align: center; font-size: 14px;">
      Or go straight to <a href="${checkoutUrl}" style="color: #2563eb;">checkout</a>.
    </p>
    <p style="margin-bottom: 8px;">Best regards,</p>
    <p style="font-weight: 500; margin-top: 0;">The ${brand.name} Team</p>
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
  const previewUrl = previewUrlWithOutreachTracking(`${baseUrl}/preview/${slug}`);
  const checkoutUrl = `${baseUrl}/checkout?slug=${encodeURIComponent(slug)}`;

  const subject = `Last note about the ${businessName} site preview`;
  const html = `
    <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 16px;">Closing the loop</h2>
    <p style="margin-bottom: 16px;">This is our last automated note about the preview we built for <strong>${businessName}</strong>.</p>
    <p style="margin-bottom: 16px;">If now isn't the right time, no worries — you can still open the preview later, or reply to this email if you have questions.</p>
    <div style="margin-bottom: 16px; text-align: center;">
      <a href="${previewUrl}" style="background-color: #18181b; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">View preview one more time</a>
    </div>
    <p style="margin-bottom: 16px; text-align: center; font-size: 14px;">
      Ready to launch? <a href="${checkoutUrl}" style="color: #2563eb;">Choose a plan</a>.
    </p>
    <p style="margin-bottom: 8px;">Thank you,</p>
    <p style="font-weight: 500; margin-top: 0;">The ${brand.name} Team</p>
  `;

  return sendEmail({ to, subject, html, leadSlug: slug });
}

/**
 * Abandoned-checkout recovery nudge — operator-triggered when a Stripe Checkout
 * Session was created but not completed (see src/lib/checkout/abandoned-recovery.ts).
 * Bundle plan checkouts only — commerce Buy now uses sendCommerceAbandonedRecovery.
 */
export async function sendCheckoutAbandonedRecovery(
  to: string,
  businessName: string,
  slug: string,
  tier: string,
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const checkoutUrl = `${baseUrl}/checkout?slug=${encodeURIComponent(slug)}&tier=${encodeURIComponent(tier)}`;

  const subject = `Still want to launch ${businessName}?`;
  const html = `
    <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 16px;">Your checkout is still open</h2>
    <p style="margin-bottom: 16px;">Looks like you started setting up a plan for <strong>${businessName}</strong> but didn't finish. Nothing was charged.</p>
    <p style="margin-bottom: 24px;">Pick up right where you left off — your plan and details are still saved:</p>
    <div style="margin-bottom: 16px; text-align: center;">
      <a href="${checkoutUrl}" style="background-color: #18181b; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">Finish checkout</a>
    </div>
    <p style="margin-bottom: 16px; text-align: center; font-size: 14px;">Questions first? Just reply to this email.</p>
    <p style="margin-bottom: 8px;">Best regards,</p>
    <p style="font-weight: 500; margin-top: 0;">The ${brand.name} Team</p>
  `;

  return sendEmail({ to, subject, html, leadSlug: slug });
}

/**
 * Commerce Buy now abandoned-cart recovery — links back to the client's preview
 * catalog, never /checkout?tier= (that would pitch a Local Site Studio plan).
 */
export async function sendCommerceAbandonedRecovery(
  to: string,
  businessName: string,
  slug: string,
  skuLabel: string,
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const catalogUrl = `${baseUrl}/preview/${encodeURIComponent(slug)}#catalog`;
  const safeSku = escapeHtmlForEmail(skuLabel);
  const safeBiz = escapeHtmlForEmail(businessName);

  const subject = `Still interested in ${skuLabel} from ${businessName}?`;
  const html = `
    <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 16px;">Your order is still open</h2>
    <p style="margin-bottom: 16px;">Looks like you started checking out <strong>${safeSku}</strong> from <strong>${safeBiz}</strong> but didn't finish. Nothing was charged.</p>
    <p style="margin-bottom: 24px;">Jump back to the menu to complete your purchase:</p>
    <div style="margin-bottom: 16px; text-align: center;">
      <a href="${catalogUrl}" style="background-color: #18181b; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">Return to menu</a>
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
 * Honors the same suppression + CAN-SPAM footer path as outreach mail.
 */
export async function sendInquiryReply(params: {
  to: string;
  businessName: string;
  leadSlug: string;
  replyBody: string;
  originalMessage: string;
  inquirerName?: string;
}) {
  const { to, businessName, leadSlug, replyBody, originalMessage, inquirerName } =
    params;
  const greeting = inquirerName?.trim()
    ? `Hello ${escapeHtmlForEmail(inquirerName.trim())},`
    : "Hello,";
  const subject = `Re: your message to ${businessName}`;
  const html = `
    <p style="margin-bottom: 16px;">${greeting}</p>
    ${plainTextToEmailHtml(replyBody)}
    <p style="margin: 24px 0 8px 0; font-weight: 500;">The ${brand.name} Team</p>
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

  return sendEmail({ to, subject, html, leadSlug });
}

/**
 * Operator daily digest — internal notification, not outreach to a prospect.
 * Skips the suppression check and CAN-SPAM footer (those exist to protect
 * prospects who opted out, not the operator's own inbox) but reuses the same
 * Resend call / mock fallback as every other send helper here.
 */
export async function sendOperatorDailyDigest(to: string, html: string) {
  const subject = `${brand.name} — daily digest`;

  if (!resendApiKey || resendApiKey.startsWith("re_placeholder") || resendApiKey === "re_...") {
    console.log(`[Mock Email Sent]
To: ${to}
Subject: ${subject}
Content Preview: ${html.substring(0, 150)}...`);
    return { success: true, mock: true };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${brand.name} <outreach@updates.localsitestudio.com>`,
        to: [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resend API response: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`[Email Sent via Resend] ID: ${data.id} to ${to}`);
    return { success: true, emailId: data.id };
  } catch (error) {
    console.error(`Failed to send daily digest to ${to} via Resend:`, error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
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
  const checkoutUrl = `${baseUrl}/checkout?slug=${encodeURIComponent(slug)}&tier=${encodeURIComponent(targetTier)}`;
  const previewUrl = `${baseUrl}/preview/${encodeURIComponent(slug)}`;
  const tierLabel = targetTier === "complete" ? "Complete" : "Growth";
  const marketingLine =
    targetTier === "complete"
      ? "AI marketing (8 social/GBP posts + 2 emails/month) plus a client AI phone agent that answers your business line."
      : "an AI marketing engine: 8 social/GBP posts + 2 emails per month, written from your site data.";

  const subject = `${businessName} — add ${tierLabel} marketing ($${monthlyPriceUsd}/mo)`;
  const html = `
    <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 16px;">Ready for more customers?</h2>
    <p style="margin-bottom: 16px;">Your <strong>${escapeHtmlForEmail(businessName)}</strong> site is already live on ${brand.name} Starter. The next step is <strong>${tierLabel}</strong> at <strong>$${monthlyPriceUsd}/mo</strong> — ${marketingLine}</p>
    <p style="margin-bottom: 16px;">Setup is already covered by what you paid. Upgrade when you want the monthly engine turned on:</p>
    <div style="margin-bottom: 16px; text-align: center;">
      <a href="${checkoutUrl}" style="background-color: #18181b; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">Upgrade to ${tierLabel}</a>
    </div>
    <p style="margin-bottom: 16px; text-align: center; font-size: 14px;">
      Or revisit your <a href="${previewUrl}" style="color: #2563eb;">site preview</a> first.
    </p>
    <p style="margin-bottom: 8px;">Questions? Just reply — happy to walk through Growth vs Complete.</p>
    <p style="font-weight: 500; margin-top: 0;">The ${brand.name} Team</p>
  `;

  return sendEmail({ to, subject, html, leadSlug: slug });
}

/**
 * Operator-triggered delivery of this month's marketing pack to the client
 * (Growth/Complete sold content handoff without Buffer/GBP OAuth).
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

  return sendEmail({ to, subject, html, leadSlug: slug });
}

/**
 * Operator-triggered delivery of the Complete voice FAQ/script pack to the client
 * (phone-script handoff without Twilio). See src/lib/voice/deliver-pack.ts +
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

  return sendEmail({ to, subject, html, leadSlug: slug });
}

/**
 * Sends a transactional order receipt email.
 */
export async function sendReceiptEmail(to: string, businessName: string, tier: string, amount: number) {
  const subject = `Your receipt for ${businessName} - ${brand.name}`;
  const html = `
    <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 16px;">Thank you for your order!</h2>
    <p style="margin-bottom: 16px;">We have received your payment for the <strong>${tier.toUpperCase()}</strong> setup plan for <strong>${businessName}</strong>.</p>
    <p style="margin-bottom: 16px;">Total paid: <strong>$${amount.toFixed(2)}</strong></p>
    <p style="margin-bottom: 24px;">Our team is already beginning to configure your final custom domain and publish your site. We will reach out within 24 hours with your dashboard access credentials.</p>
    <p style="margin-bottom: 8px;">Warmly,</p>
    <p style="font-weight: 500; margin-top: 0;">The ${brand.name} Team</p>
  `;

  return sendEmail({ to, subject, html });
}
