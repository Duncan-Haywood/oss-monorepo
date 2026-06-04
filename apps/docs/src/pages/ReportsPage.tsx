import { Link } from "react-router-dom";
import { DocLayout } from "../components/DocLayout";
import { DataTable } from "../components/DocPrimitives";
import { htmlReportManifest } from "../generated/htmlReportManifest";

export function ReportsPage() {
  return (
    <DocLayout
      title="HTML reports"
      subtitle="Standalone assessments synced at build time from docs/ and reports/"
    >
      <h2>Synced at build</h2>
      <p>
        Long-form HTML reports are copied into the static bundle by{" "}
        <code>scripts/sync-html-docs.ts</code> before each Vite build. Product
        narrative pages remain hand-authored TSX; reports open in a framed viewer
        behind the same passcode gate.
      </p>

      {htmlReportManifest.length === 0 ? (
        <p className="stub">No HTML reports found. Add *.html under docs/ or reports/.</p>
      ) : (
        <DataTable
          headers={["Report", "Source", "Open"]}
          rows={htmlReportManifest.map((r) => [
            r.title,
            <code key={r.slug}>{r.sourceLabel}</code>,
            <Link key={`link-${r.slug}`} to={`/reports/${r.slug}`}>
              View
            </Link>,
          ])}
        />
      )}

      <h2>Rebuild</h2>
      <pre>{`pnpm docs:sync-html   # copy HTML → apps/docs/public/html-reports
pnpm docs:build       # sync + Vite build → apps/docs/dist`}</pre>
    </DocLayout>
  );
}
