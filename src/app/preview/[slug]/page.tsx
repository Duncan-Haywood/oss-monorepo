import type { Metadata } from "next";
import { CategoryPreview } from "@/components/preview/category-preview";
import { getLeadBySlug } from "@/lib/db";
import { resolvePreviewLead } from "@/lib/leads/demo-catalog";
import { leadLocalBusinessJsonLd, leadMetaDescription, leadMetaTitle, previewUrl } from "@/lib/seo";

type PreviewPageProps = {
  params: Promise<{ slug: string }>;
};

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

export default async function PreviewPage({ params }: PreviewPageProps) {
  const { slug } = await params;
  const lead = await resolveLead(slug);
  const jsonLd = leadLocalBusinessJsonLd(lead);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <CategoryPreview lead={lead} />
    </>
  );
}
