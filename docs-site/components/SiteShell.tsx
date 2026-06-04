import Link from "next/link";
import type { ReactNode } from "react";
import { docsManifest, entriesBySection } from "@/lib/manifest";

type SiteShellProps = {
  children: ReactNode;
  activeSlug?: string;
};

function NavSection({
  title,
  slugs,
  activeSlug,
}: {
  title: string;
  slugs: ReturnType<typeof entriesBySection>;
  activeSlug?: string;
}) {
  if (slugs.length === 0) {
    return null;
  }

  return (
    <div className="nav-section">
      <h2>{title}</h2>
      <ul>
        {slugs.map((entry) => (
          <li key={entry.slug}>
            <Link
              href={`/docs/${entry.slug}`}
              aria-current={entry.slug === activeSlug ? "page" : undefined}
            >
              {entry.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteShell({ children, activeSlug }: SiteShellProps) {
  const reports = entriesBySection("reports");
  const guides = entriesBySection("guides");
  const legal = entriesBySection("legal");

  return (
    <div className="site-shell">
      <aside className="site-nav">
        <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
          <h1>ShootFlow Docs</h1>
        </Link>
        <p className="tagline">Private product &amp; strategy documentation</p>
        <NavSection title="Reports (HTML)" slugs={reports} activeSlug={activeSlug} />
        <NavSection title="Guides (Markdown)" slugs={guides} activeSlug={activeSlug} />
        <NavSection title="Legal" slugs={legal} activeSlug={activeSlug} />
        <p className="tagline" style={{ marginTop: "2rem" }}>
          Synced {docsManifest.entries.length} docs ·{" "}
          {new Date(docsManifest.generatedAt).toLocaleString()}
        </p>
      </aside>
      <main className="site-main">{children}</main>
    </div>
  );
}
