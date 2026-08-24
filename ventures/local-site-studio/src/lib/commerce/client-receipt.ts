/**
 * Pure helpers for emailing a commerceAddon lead when their end-customer
 * completes a Buy now Checkout Session — closes the Commerce "order
 * notifications" sold promise without Stripe Connect.
 * See /docs/process (commerce-buy-now-client-receipt).
 */

import { brand } from "@/lib/brand";
import { escapeHtmlForEmail } from "@/lib/inquiries/reply";
import { formatPriceUsd } from "./catalog";

/**
 * True when the lead has a non-empty email we can deliver the order notice to.
 * Callers still decide whether a commerce_sku session applies; this only
 * gates the client-facing send (operator inquiry + ledger always run).
 */
export function leadEligibleForCommerceBuyNowClientReceipt(lead: {
  email?: string | null;
}): boolean {
  return Boolean(lead.email && lead.email.trim().length > 0);
}

export function commerceBuyNowClientReceiptSubject(
  businessName: string,
  skuName: string,
): string {
  return `New order: ${skuName} — ${businessName}`;
}

/**
 * Pure HTML body for the client-facing Buy now order notice (wrapped later by
 * sendEmail with CAN-SPAM footer). Escapes all customer/SKU text.
 */
export function formatCommerceBuyNowClientReceiptHtml(input: {
  businessName: string;
  skuName: string;
  amountTotalUsd: number;
  customerEmail?: string;
  stripeSessionId: string;
  previewUrl?: string;
  /**
   * Units purchased (Stripe adjustable_quantity — see
   * commerce-checkout-adjustable-quantity). Shown whenever known (including
   * exactly 1) so the business owner never has to infer how many units to
   * fulfill from the total price alone — a SKU price change between Session
   * creation and completion makes amountTotalUsd ÷ current catalog price an
   * unreliable quantity signal. Omitted entirely when undefined (legacy rows
   * recorded before quantity capture shipped), matching prior behavior.
   */
  quantity?: number;
}): string {
  const {
    businessName,
    skuName,
    amountTotalUsd,
    customerEmail,
    stripeSessionId,
    previewUrl,
    quantity,
  } = input;
  const price = formatPriceUsd(Math.round(amountTotalUsd * 100));
  const customerLine = customerEmail?.trim()
    ? `<p style="margin-bottom: 8px;"><strong>Customer email:</strong> ${escapeHtmlForEmail(customerEmail.trim())}</p>`
    : `<p style="margin-bottom: 8px; color: #71717a;">No customer email was collected at checkout.</p>`;
  const quantityLine =
    typeof quantity === "number"
      ? `<p style="margin: 0 0 8px 0;"><strong>Quantity:</strong> ${escapeHtmlForEmail(String(quantity))}</p>`
      : "";
  const previewLine = previewUrl
    ? `<p style="margin: 16px 0; font-size: 14px;">Your catalog: <a href="${escapeHtmlForEmail(previewUrl)}" style="color: #2563eb;">${escapeHtmlForEmail(previewUrl)}</a></p>`
    : "";

  return `
    <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 16px;">New paid order</h2>
    <p style="margin-bottom: 16px;">Hi ${escapeHtmlForEmail(businessName)} — a customer just completed a Buy now purchase on your site.</p>
    <div style="margin-bottom: 16px; padding: 16px; border: 1px solid #e4e4e7; border-radius: 8px;">
      <p style="margin: 0 0 8px 0;"><strong>Item:</strong> ${escapeHtmlForEmail(skuName)}</p>
      ${quantityLine}
      <p style="margin: 0 0 8px 0;"><strong>Amount paid:</strong> ${escapeHtmlForEmail(price)}</p>
      ${customerLine}
      <p style="margin: 0; font-size: 12px; color: #71717a;">Stripe session: ${escapeHtmlForEmail(stripeSessionId)}</p>
    </div>
    ${previewLine}
    <p style="margin-bottom: 16px;">Fulfill this order on your side. Payouts from collected checkout funds are still reconciled manually until automated payouts ship.</p>
    <p style="margin-bottom: 8px;">Questions? Just reply to this email.</p>
    <p style="font-weight: 500; margin-top: 0;">The ${escapeHtmlForEmail(brand.name)} Team</p>
  `;
}
