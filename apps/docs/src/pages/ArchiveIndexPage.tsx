import { Link } from "react-router-dom";
import { Card, DataTable } from "../components/DocPrimitives";
import { DocLayout } from "../components/DocLayout";
import { docSourceManifest } from "../generated/source-manifest";
import { htmlReportManifest } from "../generated/htmlReportManifest";

export function ArchiveIndexPage() {
  return (
    <DocLayout
      title="HTML & Markdown archive"
      subtitle="Build-time sync from docs/ and reports/ — TSX pages remain canonical"
    >
      <Card variant="ok">
        <p>
          <strong>Iframe reports</strong> (<code>/reports/:slug</code>) copy full HTML
          files. <strong>Inline archive</strong> (<code>/archive/:slug</code>) embeds
          extracted body content and Markdown. Run <code>pnpm docs:sync</code> before
          build.
        </p>
      </Card>

      <h2>Iframe HTML reports</h2>
      <DataTable
        headers={["Report", "Source", "Open"]}
        rows={htmlReportManifest.map((entry) => [
          entry.title,
          <code key={`${entry.slug}-src`}>{entry.sourceLabel}</code>,
          <Link to={`/reports/${entry.slug}`} key={entry.slug}>
            View
          </Link>,
        ])}
      />

      <h2>Inline archive (extracted / Markdown)</h2>
      <DataTable
        headers={["Document", "Source", "Kind", "Open"]}
        rows={docSourceManifest.map((entry) => [
          entry.title,
          <code key={`${entry.slug}-path`}>{entry.sourcePath}</code>,
          entry.kind,
          <Link to={`/archive/${entry.slug}`} key={entry.slug}>
            View
          </Link>,
        ])}
      />

      <footer>
        <Link to="/commercial-viability">Commercial viability (TSX)</Link>
        {" · "}
        <Link to="/">← Home</Link>
      </footer>
    </DocLayout>
  );
}
