import { Link, useParams } from "react-router-dom";
import { DocLayout } from "../components/DocLayout";
import { htmlReports } from "../generated/htmlReports";

export function HtmlReportPage() {
  const { slug } = useParams<{ slug: string }>();
  const report = htmlReports.find((r) => r.slug === slug);

  if (!report) {
    return (
      <DocLayout title="Report not found">
        <p>
          Unknown report slug. <Link to="/reports">Back to reports index</Link>
        </p>
      </DocLayout>
    );
  }

  const src = `./${report.assetPath}`;

  return (
    <DocLayout
      title={report.title}
      subtitle={`Ingested from ${report.sourceFile}`}
      footer={
        <p>
          <Link to="/reports">← All HTML reports</Link>
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
