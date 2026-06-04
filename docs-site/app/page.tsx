import Link from "next/link";
import { SiteShell } from "@/components/SiteShell";
import { SecurityOverview } from "@/components/SecurityOverview";
import { docsManifest, entriesBySection } from "@/lib/manifest";

export default function HomePage() {
  const reports = entriesBySection("reports");
  const guides = entriesBySection("guides");

  return (
    <SiteShell>
      <header className="doc-hero">
        <h1>ShootFlow documentation</h1>
        <p style={{ color: "var(--muted)", maxWidth: "720px" }}>
          TSX shell and navigation with content compiled from repository{" "}
          <code>docs/</code> HTML reports and Markdown guides at build time.
        </p>
      </header>

      <SecurityOverview />

      <div className="home-grid" style={{ marginTop: "2rem" }}>
        <div className="home-card">
          <h2>Commercial &amp; viability reports</h2>
          <p>{reports.length} HTML reports synced from docs/*.html</p>
          <ul>
            {reports.slice(0, 4).map((e) => (
              <li key={e.slug}>
                <Link href={`/docs/${e.slug}`}>{e.title}</Link>
              </li>
            ))}
            {reports.length > 4 ? (
              <li>
                <Link href={`/docs/${reports[0]?.slug}`}>View all in sidebar →</Link>
              </li>
            ) : null}
          </ul>
        </div>

        <div className="home-card">
          <h2>Product &amp; business guides</h2>
          <p>{guides.length} Markdown guides rendered at build time</p>
          <ul>
            {guides.map((e) => (
              <li key={e.slug}>
                <Link href={`/docs/${e.slug}`}>{e.title}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="home-card">
          <h2>Build pipeline</h2>
          <p>
            <code>npm run sync-docs</code> ingests ../docs, writes{" "}
            <code>generated/manifest.json</code> and per-doc JSON payloads.{" "}
            <code>npm run build</code> runs sync then <code>next build</code>.
          </p>
          <p style={{ marginBottom: 0 }}>
            Last sync: {docsManifest.generatedAt}
          </p>
        </div>
      </div>
    </SiteShell>
  );
}
