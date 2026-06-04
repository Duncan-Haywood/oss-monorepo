import { Link, Navigate, useParams } from "react-router-dom";
import { DocLayout } from "../components/DocLayout";
import {
  reportLegacyRedirects,
  reportRegistry,
} from "../generated/report-manifest";

export function ReportPage() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return <Navigate to="/reports" replace />;

  const legacy = reportLegacyRedirects.find((r) => r.from === slug);
  if (legacy) {
    return <Navigate to={`/reports/${legacy.to}`} replace />;
  }

  const entry = reportRegistry.find((r) => r.slug === slug);
  if (!entry) {
    return (
      <DocLayout title="Report not found">
        <p className="stub">
          Unknown report. See <Link to="/reports">all reports</Link>.
        </p>
      </DocLayout>
    );
  }

  const View = entry.View;
  return (
    <DocLayout
      title={entry.title}
      subtitle={`TSX report · ${entry.sourcePath}`}
      footer={
        <>
          <Link to="/reports">← All reports</Link>
          {" · "}
          <Link to="/commercial-viability">Commercial viability summary</Link>
        </>
      }
    >
      <View />
    </DocLayout>
  );
}
