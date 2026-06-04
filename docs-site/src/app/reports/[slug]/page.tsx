import { notFound } from "next/navigation";
import { DocsShell } from "@/components/DocsShell";
import { HtmlDocument } from "@/components/HtmlDocument";
import { htmlReportManifest } from "@/generated/html-manifest";
import { loadHtmlReport } from "@/lib/load-html-report";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return htmlReportManifest.pages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const report = await loadHtmlReport(slug);
  return { title: report?.title ?? "Report" };
}

export default async function HtmlReportPage({ params }: PageProps) {
  const { slug } = await params;
  const report = await loadHtmlReport(slug);
  if (!report) notFound();

  return (
    <DocsShell
      title={report.title}
      breadcrumb={[
        { label: "Reports", href: "/reports" },
        { label: report.title },
      ]}
    >
      <HtmlDocument report={report} />
    </DocsShell>
  );
}
