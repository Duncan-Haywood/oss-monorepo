import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";
import { ARCHIVE_NAV, FULL_NAV, PRIMARY_NAV, REPORT_NAV } from "@/lib/navigation";

export default function HomePage() {
  return (
    <DocsLayout
      title="ShootFlow private documentation"
      subtitle="Curated TSX guides plus build-ingested HTML reports and markdown archives."
      nav={FULL_NAV}
    >
      <p>
        This site is generated from repository documentation under{" "}
        <code>docs/</code>. Most navigation and policy pages are authored in
        TSX; commercial viability HTML reports are ingested at build time.
      </p>

      <div className="card-grid">
        {PRIMARY_NAV.filter((n) => n.href !== "/").map((item) => (
          <Link key={item.href} href={item.href} className="card">
            <h2>{item.label}</h2>
            <p>{item.description}</p>
          </Link>
        ))}
      </div>

      <section className="doc-section">
        <h2>HTML reports (build-ingested)</h2>
        <ul>
          {REPORT_NAV.map((item) => (
            <li key={item.href}>
              <Link href={item.href}>{item.label}</Link>
              {item.description ? (
                <>
                  {" "}
                  — <code>docs/{item.description}</code>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="doc-section">
        <h2>Full markdown archives</h2>
        <ul>
          {ARCHIVE_NAV.map((item) => (
            <li key={item.href}>
              <Link href={item.href}>{item.label}</Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="callout">
        Production deployments require <code>DOCS_SITE_PASSWORD</code> and a
        custom domain with Vercel Deployment Protection enabled. See{" "}
        <Link href="/docs/security">Site security</Link>.
      </div>
    </DocsLayout>
  );
}
