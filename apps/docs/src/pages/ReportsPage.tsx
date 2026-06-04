import { Link } from "react-router-dom";
import { DocLayout } from "../components/DocLayout";
import { DataTable } from "../components/DocPrimitives";
import { htmlReports } from "../generated/htmlReports";

export function ReportsPage() {
  return (
    <DocLayout
      title="HTML reports"
      subtitle="Standalone assessments ingested at build time from docs/ and reports/"
    >
      <h2>Ingested at build</h2>
      <p>
        Long-form HTML reports are copied into the static bundle by{" "}
        <code>scripts/ingest-html-docs.ts</code> before Vite builds. Product
        narrative pages remain hand-authored TSX; reports open in a framed viewer
        behind the same passcode gate.
      </p>

      {htmlReports.length === 0 ? (
        <p className="stub">No HTML reports found. Add *.html under docs/ or reports/.</p>
      ) : (
        <DataTable
          headers={["Report", "Source", "Open"]}
          rows={htmlReports.map((r) => [
            r.title,
            <code key={r.slug}>{r.sourceFile}</code>,
            <Link key={`link-${r.slug}`} to={`/reports/${r.slug}`}>
              View
            </Link>,
          ])}
        />
      )}

      <h2>Rebuild</h2>
      <pre>{`pnpm docs:ingest   # copy HTML → apps/docs/public/reports
pnpm docs:build    # ingest + typecheck + vite build`}</pre>
    </DocLayout>
  );
}
