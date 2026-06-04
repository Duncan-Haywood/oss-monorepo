import Link from "next/link";
import { markdownDocs } from "@/lib/docs-registry";
import { htmlReportManifest } from "@/generated/html-manifest";

export function HomeOverview() {
  return (
    <div className="home-grid">
      <section className="card">
        <h2>Product &amp; strategy</h2>
        <p>
          Markdown sources from the repo, rendered inside TSX routes with a
          shared shell and navigation.
        </p>
        <ul>
          {markdownDocs.map((doc) => (
            <li key={doc.slug}>
              <Link href={doc.href}>{doc.title}</Link>
              <span className="muted"> — {doc.description}</span>
            </li>
          ))}
        </ul>
        <p>
          <Link href="/docs">Browse all markdown docs →</Link>
        </p>
      </section>

      <section className="card">
        <h2>HTML assessments</h2>
        <p>
          Standalone HTML reports under <code>docs/</code> are ingested at build
          time (<code>npm run build:content</code>) and published as TSX-backed
          report routes.
        </p>
        <ul>
          {htmlReportManifest.pages.length === 0 ? (
            <li className="muted">
              Run <code>npm run build:content</code> to ingest HTML reports.
            </li>
          ) : (
            htmlReportManifest.pages.map((page) => (
              <li key={page.slug}>
                <Link href={page.href}>{page.title}</Link>
              </li>
            ))
          )}
        </ul>
        <p>
          <Link href="/reports">Browse all reports →</Link>
        </p>
      </section>

      <section className="card accent">
        <h2>Private deployment</h2>
        <p>
          This site is intended for password-protected Vercel hosting with an
          optional custom domain. See{" "}
          <Link href="/security">security setup</Link> for environment variables
          and platform protection layers.
        </p>
      </section>
    </div>
  );
}
