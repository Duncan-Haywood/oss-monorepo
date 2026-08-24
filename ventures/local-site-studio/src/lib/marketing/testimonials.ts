/**
 * Homepage social-proof scaffold — dormant until real client quotes exist.
 *
 * Empty-backlog audit (business-growth angle, distinct from the security/
 * observability/a11y sweeps already exhausted today) found zero testimonial,
 * review, or "N businesses live" signal anywhere on the site — every
 * conversion surface (homepage, /websites-for-* category pages, checkout)
 * sells purely on price and feature bullets. For a self-serve, no-sales-call
 * product where a stranger is asked to pay in the same session they first see
 * the preview, that is a real, evidence-backed conversion lever left unbuilt.
 *
 * This ships the CAPABILITY, not fabricated content: TESTIMONIALS starts
 * empty and the homepage section renders nothing until it isn't (see
 * src/components/marketing/testimonials.tsx). Per NEXT_STEPS's own
 * stripe-price-objects item, this business has not yet taken a real Stripe
 * payment — inventing quotes or a "trusted by N businesses" counter before
 * a single real client exists would be dishonest, and this codebase's own
 * AGENT_PROTOCOL treats email/receipt copy accuracy as a hard requirement.
 * Once the operator has a real, consenting client, add an entry here (name/
 * business only with their permission) and the section appears automatically
 * — no code change needed. See social-proof-testimonials-scaffold in
 * BUSINESS_DECISIONS (prompt_process.tsx).
 */
import type { BusinessCategory } from "@/lib/leads/types";

export interface Testimonial {
  /** The client's own words — operator must have their permission to publish. */
  quote: string;
  authorName: string;
  businessName: string;
  category?: BusinessCategory;
}

/**
 * Operator: add real, permissioned client quotes here as they come in.
 * Deliberately empty at ship time — see file doc comment above.
 */
export const TESTIMONIALS: Testimonial[] = [];

/** "— Jane Doe, Joe's Bakery" — shared so the component and any future reuse (e.g. a category-page variant) format attribution identically. */
export function formatTestimonialAttribution(testimonial: Testimonial): string {
  return `— ${testimonial.authorName}, ${testimonial.businessName}`;
}
