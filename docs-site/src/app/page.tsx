import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";
import { FULL_NAV, PRIMARY_NAV, REPORT_NAV } from "@/lib/navigation";

export default function HomePage() {
  return (
    <DocsLayout
      title="ShootFlow private documentation"
      subtitle="TSX guides and build-generated TSX pages from repository docs."
      nav={FULL_NAV}
    >
      <p>
        Documentation lives under <code>docs/</code> in the repository. The build
        step converts HTML reports and markdown sources into Next.js{" "}
        <code>page.tsx</code> files; architecture, CLI, and security pages are
        hand-authored in TSX.
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
        <h2>Commercial viability reports (TSX from HTML)</h2>
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

      <div className="callout">
        Production deployments require <code>DOCS_SITE_PASSWORD</code> and/or{" "}
        <code>DOCS_SITE_TOKEN</code>, plus a custom domain with Vercel Deployment
        Protection. See <Link href="/docs/security">Site security</Link>.
      </div>
    </DocsLayout>
  );
}
