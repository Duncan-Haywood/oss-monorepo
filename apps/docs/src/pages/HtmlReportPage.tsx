import { useParams, Navigate } from "react-router-dom";
import { DocLayout } from "../components/DocLayout";
import { htmlReportManifest } from "../generated/htmlReportManifest";

export function HtmlReportPage() {
  const { slug } = useParams<{ slug: string }>();
  const report = htmlReportManifest.find((r) => r.slug === slug);

  if (!report) {
    return <Navigate to="/" replace />;
  }

  const base = import.meta.env.BASE_URL;
  const src = `${base}${report.assetPath}`;

  return (
    <DocLayout
      title={report.title}
      subtitle={`Imported from ${report.sourceLabel} at build time`}
      footer={
        <p>
          <a href={src} target="_blank" rel="noopener noreferrer">
            Open full-page HTML
          </a>
        </p>
      }
    >
      <iframe
        className="html-report-frame"
        title={report.title}
        src={src}
        sandbox="allow-same-origin"
      />
    </DocLayout>
  );
}
