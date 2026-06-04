import Link from "next/link";
import { DocsShell } from "@/components/DocsShell";
import { htmlReportManifest } from "@/generated/html-manifest";

export const metadata = {
  title: "HTML reports",
};

export default function ReportsIndexPage() {
  return (
    <DocsShell
      title="HTML reports"
      description="Commercial and viability assessments ingested from docs/*.html at build time."
      breadcrumb={[{ label: "Reports" }]}
    >
      {htmlReportManifest.pages.length === 0 ? (
        <p className="muted">
          No reports ingested yet. Run <code>npm run build:content</code> from{" "}
          <code>docs-site/</code>.
        </p>
      ) : (
        <ul>
          {htmlReportManifest.pages.map((page) => (
            <li key={page.slug}>
              <Link href={page.href}>{page.title}</Link>
              <span className="muted"> — {page.sourceFile}</span>
            </li>
          ))}
        </ul>
      )}
    </DocsShell>
  );
}
