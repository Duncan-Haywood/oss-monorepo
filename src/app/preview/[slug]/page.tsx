import type { Metadata } from "next";
import { CategoryPreview } from "@/components/preview/category-preview";
import { PreviewOpenBeacon } from "@/components/preview/preview-open-beacon";
import { getLeadBySlug } from "@/lib/db";
import { resolvePreviewLead } from "@/lib/leads/demo-catalog";
import { leadLocalBusinessJsonLd, leadMetaDescription, leadMetaTitle, previewUrl } from "@/lib/seo";

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

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website" },
    twitter: { card: "summary", title, description },
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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PreviewOpenBeacon
        slug={slug}
        src={src}
        utmSource={utmSource}
        trackByStage={trackByStage}
      />
      <CategoryPreview lead={lead} />
    </>
  );
}
