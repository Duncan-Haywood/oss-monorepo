import { notFound } from "next/navigation";
import { DocsPageHeader } from "@/components/DocsLayout";
import { HtmlReportFrame } from "@/components/HtmlReportFrame";
import { getHtmlReportBySlug, listHtmlReports } from "@/lib/html-manifest";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return listHtmlReports().map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const page = getHtmlReportBySlug(slug);
  if (!page) {
    return { title: "Report not found" };
  }
  return { title: `${page.title} · ShootFlow Docs` };
}

export default async function HtmlReportPage({ params }: PageProps) {
  const { slug } = await params;
  const page = getHtmlReportBySlug(slug);
  if (!page) {
    notFound();
  }

  return (
    <>
      <DocsPageHeader title={page.title} description="Ingested HTML report from the repository docs folder." />
      <HtmlReportFrame
        title={page.title}
        src={page.publicPath}
        sourceFile={page.sourceFile}
      />
    </>
  );
}
