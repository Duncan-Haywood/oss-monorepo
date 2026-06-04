import { Link } from "react-router-dom";
import { Card, DataTable } from "../components/DocPrimitives";
import { DocLayout } from "../components/DocLayout";
import { docSourceManifest } from "../generated/source-manifest";

export function ArchiveIndexPage() {
  return (
    <DocLayout
      title="HTML & Markdown archive"
      subtitle="Compiled from docs/ and reports/ at build time — TSX pages remain the canonical product docs"
    >
      <Card variant="ok">
        <p>
          Source HTML and Markdown in the repository are synced into{" "}
          <code>apps/docs/public/generated/</code> by{" "}
          <code>pnpm docs:sync</code> before each production build. Edit the
          TSX pages for narrative product docs; use the archive for long-form
          commercial assessments.
        </p>
      </Card>

      <h2>Available reports</h2>
      <DataTable
        headers={["Report", "Source", "Kind"]}
        rows={docSourceManifest.map((entry) => [
          <Link to={`/archive/${entry.slug}`} key={entry.slug}>
            {entry.title}
          </Link>,
          <code key={`${entry.slug}-src`}>{entry.sourcePath}</code>,
          entry.kind,
        ])}
      />

      <footer>
        <Link to="/">← Home</Link>
      </footer>
    </DocLayout>
  );
}
