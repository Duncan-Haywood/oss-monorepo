import type { Metadata } from "next";
import { CategoryPreview } from "@/components/preview/category-preview";
import { PreviewOpenBeacon } from "@/components/preview/preview-open-beacon";
import { getCommerceCatalog, getLeadBySlug, listOrders } from "@/lib/db";
import { leadEligibleForCommerceCatalog } from "@/lib/commerce/catalog";
import { isCuratedDemoLeadSlug, resolvePreviewLead } from "@/lib/leads/demo-catalog";
import {
  isLeadPreviewIndexable,
  leadLocalBusinessJsonLd,
  leadMetaDescription,
  leadMetaTitle,
  previewUrl,
  safeJsonLdScript,
} from "@/lib/seo";

type PreviewPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function resolveLead(slug: string) {
  const dbLead = await getLeadBySlug(slug);
  return dbLead || resolvePreviewLead(slug);
}

export async function generateMetadata({ params }: PreviewPageProps): Promise<Metadata> {
  const { slug } = await params;
  const lead = await resolveLead(slug);
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
  const lead = await resolveLead(slug);
  const jsonLd = leadLocalBusinessJsonLd(lead);
  const src = firstParam(query.src);
  const utmSource = firstParam(query.utm_source);
  const trackByStage =
    lead.stage === "outreach_sent" || lead.stage === "discovery_call";

  const orders = (await listOrders()).filter((o) => o.leadSlug === slug);
  const showCommerce = leadEligibleForCommerceCatalog(lead, orders);
  const catalog = showCommerce ? await getCommerceCatalog(slug) : null;
  const commerceItems = catalog?.items ?? [];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdScript(jsonLd) }}
      />
      <PreviewOpenBeacon
        slug={slug}
        src={src}
        utmSource={utmSource}
        trackByStage={trackByStage}
      />
      <CategoryPreview lead={lead} commerceItems={commerceItems} />
    </>
  );
}
