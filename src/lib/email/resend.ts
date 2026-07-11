import { isEmailSuppressed } from "../db";
import { brand } from "../brand";

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
 * Sends the initial outreach email with a preview link.
 */
export async function sendOutreachEmail(to: string, businessName: string, slug: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const previewUrl = `${baseUrl}/preview/${slug}`;

  const subject = `Preview site generated for ${businessName}`;
  const html = `
    <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 16px;">Hello ${businessName} Team,</h2>
    <p style="margin-bottom: 16px;">We've built a custom preview website for your business. It is fully mobile-responsive and tailored to your services.</p>
    <p style="margin-bottom: 24px;">You can view the site and test it live at the link below:</p>
    <div style="margin-bottom: 24px; text-align: center;">
      <a href="${previewUrl}" style="background-color: #18181b; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">View Your Preview Site</a>
    </div>
    <p style="margin-bottom: 16px;">If you'd like to launch this site under your own custom domain, set up contact forms, or enable online booking/payments, you can claim it directly from the preview page.</p>
    <p style="margin-bottom: 8px;">Best regards,</p>
    <p style="font-weight: 500; margin-top: 0;">The ${brand.name} Team</p>
  `;

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
