import Link from "next/link";
import type { ReactNode } from "react";

type DocsShellProps = {
  title: string;
  description?: string;
  children: ReactNode;
  breadcrumb?: { label: string; href?: string }[];
};

export function DocsShell({
  title,
  description,
  children,
  breadcrumb,
}: DocsShellProps) {
  return (
    <div className="site">
      <header className="site-header">
        <div className="site-header-inner">
          <Link href="/" className="brand">
            ShootFlow Docs
          </Link>
          <span className="badge">Private</span>
        </div>
      </header>
      <div className="site-body">
        <aside className="site-nav">
          <NavLinks />
        </aside>
        <main className="site-main">
          {breadcrumb && breadcrumb.length > 0 && (
            <nav className="breadcrumb" aria-label="Breadcrumb">
              <Link href="/">Home</Link>
              {breadcrumb.map((item, i) => (
                <span key={`${item.label}-${i}`}>
                  <span className="sep">/</span>
                  {item.href ? (
                    <Link href={item.href}>{item.label}</Link>
                  ) : (
                    <span>{item.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
          <header className="page-header">
            <h1>{title}</h1>
            {description ? <p className="lede">{description}</p> : null}
          </header>
          <div className="page-content">{children}</div>
        </main>
      </div>
    </div>
  );
}

function NavLinks() {
  return (
    <nav aria-label="Documentation">
      <p className="nav-section">Guides</p>
      <ul>
        <li>
          <Link href="/">Overview</Link>
        </li>
        <li>
          <Link href="/docs">Markdown docs</Link>
        </li>
        <li>
          <Link href="/reports">HTML reports</Link>
        </li>
      </ul>
      <p className="nav-section">Access</p>
      <ul>
        <li>
          <Link href="/security">Security &amp; domain</Link>
        </li>
      </ul>
    </nav>
  );
}
