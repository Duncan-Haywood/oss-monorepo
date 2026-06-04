import { Link } from "react-router-dom";
import { Card, DataTable } from "../components/DocPrimitives";
import { DocLayout } from "../components/DocLayout";
import { htmlDocs } from "../generated/htmlManifest";

export function ReportsIndexPage() {
  const docsEntries = htmlDocs.filter((d) => d.category === "docs");
  const reportEntries = htmlDocs.filter((d) => d.category === "reports");

  return (
    <DocLayout
      title="Imported HTML & Markdown"
      subtitle="Standalone reports in docs/ and reports/ are compiled into this site at build time"
    >
      <Card>
        <p>
          Author new product documentation as <strong>TSX pages</strong> under{" "}
          <code>apps/docs/src/pages</code>. Drop legacy or analyst HTML/Markdown
          into <code>docs/</code> or <code>reports/</code>;{" "}
          <code>pnpm docs:sync</code> generates typed modules and routes here.
        </p>
      </Card>

      <h2>docs/</h2>
      {docsEntries.length === 0 ? (
        <p className="muted">No synced files in docs/ yet.</p>
      ) : (
        <DataTable
          headers={["Title", "Source", "Route"]}
          rows={docsEntries.map((d) => [
            d.title,
            d.sourcePath,
            <Link key={d.slug} to={`/reports/${d.slug}`}>
              /reports/{d.slug}
            </Link>,
          ])}
        />
      )}

      <h2>reports/</h2>
      {reportEntries.length === 0 ? (
        <p className="muted">No synced files in reports/ yet.</p>
      ) : (
        <DataTable
          headers={["Title", "Source", "Route"]}
          rows={reportEntries.map((d) => [
            d.title,
            d.sourcePath,
            <Link key={d.slug} to={`/reports/${d.slug}`}>
              /reports/{d.slug}
            </Link>,
          ])}
        />
      )}
    </DocLayout>
  );
}
