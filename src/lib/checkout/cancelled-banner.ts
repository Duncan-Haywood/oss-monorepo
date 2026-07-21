/**
 * /checkout?cancelled=1 banner copy.
 *
 * Bug this fixes: the banner used to gate its "your preview is still
 * available at ..." link on prefill.slug being truthy, not on whether a real
 * CRM lead was actually found. Every organic buyer (homepage pricing CTAs,
 * the /websites-for-* category landing pages — none of which pass a
 * ?slug=) gets a synthetic `organic-<hex>` slug minted at Checkout Session
 * create (see organic-attribution.ts) purely for internal fulfillment
 * bookkeeping, and that slug rides along in the Stripe cancel_url.
 * loadCheckoutPrefillLead (prefill-slug.ts) returns that slug as truthy even
 * when no lead exists for it — so the banner promised a "preview" that
 * resolvePreviewLead (demo-catalog.ts) then rendered as an obviously fake,
 * unrelated business ("Organic A1b2c3d4e5f6"), right at the exact moment
 * (checkout cancellation) copy should be reassuring, not confusing.
 *
 * Fix: gate the preview link on a real resolved `lead`, never on the slug
 * string alone.
 */

import { leadPreviewPath } from "@/lib/leads/slug-path";
import type { Lead } from "@/lib/leads/types";

export type CancelledCheckoutBanner =
  | { kind: "with_preview"; previewPath: string }
  | { kind: "no_preview" };

export function cancelledCheckoutBanner(lead: Lead | null): CancelledCheckoutBanner {
  if (!lead) {
    return { kind: "no_preview" };
  }
  return { kind: "with_preview", previewPath: leadPreviewPath(lead.slug) };
}
