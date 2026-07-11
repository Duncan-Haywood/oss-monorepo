import { CategoryPreview } from "@/components/preview/category-preview";
import { resolvePreviewLead } from "@/lib/leads/demo-catalog";

type PreviewPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function PreviewPage({ params }: PreviewPageProps) {
  const { slug } = await params;
  const lead = resolvePreviewLead(slug);
  return <CategoryPreview lead={lead} />;
}
