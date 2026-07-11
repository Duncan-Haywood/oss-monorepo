import { CategoryPreview } from "@/components/preview/category-preview";
import { getLeadBySlug } from "@/lib/db";
import { resolvePreviewLead } from "@/lib/leads/demo-catalog";

type PreviewPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function PreviewPage({ params }: PreviewPageProps) {
  const { slug } = await params;
  
  // Try to find the lead in the database first, then fallback to demo resolver
  const dbLead = await getLeadBySlug(slug);
  const lead = dbLead || resolvePreviewLead(slug);

  return <CategoryPreview lead={lead} />;
}
