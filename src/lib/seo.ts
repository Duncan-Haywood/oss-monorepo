/**
 * SEO helpers shared by the marketing site and per-client preview pages.
 * Starter sells "Basic SEO" (see landing page copy) — this is what backs it:
 * per-page metadata, canonical URLs, and LocalBusiness structured data.
 */
import type { BusinessCategory, Lead } from "@/lib/leads/types";

const DEFAULT_SITE_URL = "http://localhost:3000";

/** Absolute site origin, no trailing slash. Falls back to localhost outside Vercel/prod. */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`;
  return DEFAULT_SITE_URL;
}

export function previewUrl(slug: string): string {
  return `${siteUrl()}/preview/${slug}`;
}

/** schema.org LocalBusiness subtype per category — falls back to the generic type. */
const SCHEMA_TYPE_BY_CATEGORY: Record<BusinessCategory, string> = {
  restaurant: "Restaurant",
  salon: "HairSalon",
  trades: "HomeAndConstructionBusiness",
  generic: "LocalBusiness",
};

export function leadMetaTitle(lead: Lead): string {
  return `${lead.businessName} — ${lead.city}, ${lead.state} | ${lead.tagline}`;
}

export function leadMetaDescription(lead: Lead): string {
  return lead.description;
}

/** JSON-LD LocalBusiness object for a lead's preview site. Serialize with JSON.stringify. */
export function leadLocalBusinessJsonLd(lead: Lead): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": SCHEMA_TYPE_BY_CATEGORY[lead.category],
    name: lead.businessName,
    description: lead.description,
    url: previewUrl(lead.slug),
    telephone: lead.phone,
    address: {
      "@type": "PostalAddress",
      streetAddress: lead.address,
      addressLocality: lead.city,
      addressRegion: lead.state,
    },
  };
}
