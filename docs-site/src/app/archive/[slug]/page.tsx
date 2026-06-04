import { notFound } from "next/navigation";
import { DocsLayout } from "@/components/DocsLayout";
import { IngestedContent } from "@/components/IngestedContent";
import { getIngestedPage } from "@/generated/content";
import { FULL_NAV } from "@/lib/navigation";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const { INGESTED_PAGES } = await import("@/generated/content");
  return INGESTED_PAGES.filter((p) => p.kind === "markdown").map((p) => ({
    slug: p.slug,
  }));
}

export default async function ArchivePage({ params }: PageProps) {
  const { slug } = await params;
  const page = getIngestedPage(slug);
  if (!page || page.kind !== "markdown") notFound();

  return (
    <DocsLayout
      title={page.title}
      subtitle="Full markdown archive (build-ingested)"
      sourceFile={page.sourceFile}
      nav={FULL_NAV}
    >
      <IngestedContent page={page} />
    </DocsLayout>
  );
}
