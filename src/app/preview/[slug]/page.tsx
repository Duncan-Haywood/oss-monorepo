import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CategoryPreview } from "@/components/preview/category-preview";
import { PreviewOpenBeacon } from "@/components/preview/preview-open-beacon";
import { loadPreviewCommerceItems } from "@/lib/commerce/preview-commerce";
import { loadPreviewSetupFeeWaived } from "@/lib/checkout/preview-setup-fee";
import { isCuratedDemoLeadSlug, resolvePreviewLead } from "@/lib/leads/demo-catalog";
import { resolvePreviewOpenAttrParam } from "@/lib/leads/preview-open";
import { planPreviewPageAccess } from "@/lib/leads/preview-page-access";
import { loadPreviewPageLead } from "@/lib/leads/preview-page-lead";
import {
  isLeadPreviewIndexable,
  leadMetaDescription,
  leadMetaTitle,
  leadPreviewJsonLdIfIndexable,
  previewUrl,
  safeJsonLdScript,
} from "@/lib/seo";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/security/rate-limit";

type PreviewPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function generateMetadata({ params }: PreviewPageProps): Promise<Metadata> {
  const { slug } = await params;
  const clientIp = clientIpFromHeaders(await headers());
  const plan = await planPreviewPageAccess(slug, clientIp, {
    loadLead: loadPreviewPageLead,
    checkRateLimit,
  });
  if (plan.kind === "not_found") notFound();
  // A rate-limited hit skips the DB lookup entirely (planPreviewPageAccess
  // never calls loadLead) — fall back to the pure, DB-free slug inference so
  // a throttled crawler/bot still gets valid metadata instead of an error
  // (preview-page-rate-limit, mirrors preview-og-image-rate-limit's
  // renderSiteOgImage fallback).
  const lead = plan.kind === "ok" ? plan.lead : resolvePreviewLead(slug);
  const title = leadMetaTitle(lead);
  const description = leadMetaDescription(lead);
  const url = previewUrl(slug);
  // Cold-prospected / not-yet-consenting leads must not be indexed under the
  // platform domain (consent + duplicate-content hygiene). Only curated demo
  // showcases and paid/live customers are publicly indexable — kept in sync
  // with the sitemap via the shared isLeadPreviewIndexable predicate.
  const indexable = isLeadPreviewIndexable(lead, {
    isCuratedDemo: isCuratedDemoLeadSlug(slug),
  });

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website" },
    twitter: { card: "summary", title, description },
    ...(indexable ? {} : { robots: { index: false, follow: false } }),
  };
}

export default async function PreviewPage({ params, searchParams }: PreviewPageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const clientIp = clientIpFromHeaders(await headers());
  const plan = await planPreviewPageAccess(slug, clientIp, {
    loadLead: loadPreviewPageLead,
    checkRateLimit,
  });
  if (plan.kind === "not_found") notFound();
  // Same DB-free fallback as generateMetadata above on a rate-limited hit.
  const lead = plan.kind === "ok" ? plan.lead : resolvePreviewLead(slug);
  // Stage-gate + slug-scoped orders — never listOrders() the full ledger on
  // public cold-outreach previews (preview-page-uncapped-listOrders). Skip
  // entirely on a rate-limited hit — there's no real per-lead DB record to
  // key off of, and the whole point of the fallback is avoiding this call.
  const commerceItems =
    plan.kind === "ok" ? await loadPreviewCommerceItems(lead, slug) : [];
  // Same stage-gate-before-DB-call precedent as commerceItems above (see
  // loadPreviewSetupFeeWaived) — skips the listOrdersByLeadSlug call entirely
  // for the high-volume cold-outreach preview path.
  const setupFeeWaived =
    plan.kind === "ok" ? await loadPreviewSetupFeeWaived(lead, slug) : false;
  // Same consent predicate as sitemap + robots — never emit LocalBusiness
  // JSON-LD on a noindex cold-prospect preview (preview-jsonld-indexable-only).
  // commerceItems is already stage/eligibility-gated by loadPreviewCommerceItems
  // above, so it's always [] here for a non-indexable lead.
  const jsonLd = leadPreviewJsonLdIfIndexable(lead, {
    isCuratedDemo: isCuratedDemoLeadSlug(slug),
    commerceItems,
  });
  // Bound before PreviewOpenBeacon — API route already caps, but trackByStage
  // still re-emits uncapped searchParams onto the beacon fetch URL
  // (preview-page-src-utm-field-length-cap).
  const src = resolvePreviewOpenAttrParam(firstParam(query.src));
  const utmSource = resolvePreviewOpenAttrParam(firstParam(query.utm_source));
  const trackByStage =
    lead.stage === "outreach_sent" || lead.stage === "discovery_call";

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLdScript(jsonLd) }}
        />
      ) : null}
      <PreviewOpenBeacon
        slug={slug}
        src={src}
        utmSource={utmSource}
        trackByStage={trackByStage}
      />
      <CategoryPreview lead={lead} commerceItems={commerceItems} setupFeeWaived={setupFeeWaived} />
    </>
  );
}
