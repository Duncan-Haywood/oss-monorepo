import { Link } from "react-router-dom";
import { Card, DataTable } from "../components/DocPrimitives";
import { DocLayout } from "../components/DocLayout";
import { reportRegistry } from "../generated/report-manifest";

export function ReportsIndexPage() {
  return (
    <DocLayout
      title="Reports"
      subtitle="Long-form assessments as TSX modules in apps/docs/src/reports/"
    >
      <Card variant="ok">
        <p>
          Reports are authored in <strong>TSX</strong> and registered at build time via{" "}
          <code>scripts/build-report-manifest.ts</code>. Edit source files under{" "}
          <code>apps/docs/src/reports/</code>, then run <code>pnpm docs:sync</code> or{" "}
          <code>pnpm docs:build</code>.
        </p>
      </Card>

      <DataTable
        headers={["Report", "Slug", "Open"]}
        rows={reportRegistry.map((entry) => [
          entry.title,
          <code key={`${entry.slug}-slug`}>{entry.slug}</code>,
          <Link to={`/reports/${entry.slug}`} key={entry.slug}>
            View
          </Link>,
        ])}
      />

      <footer>
        <Link to="/commercial-viability">Commercial viability (summary)</Link>
        {" · "}
        <Link to="/">← Home</Link>
      </footer>
    </DocLayout>
  );
}
