import Link from "next/link";
import type { ReactNode } from "react";

export interface NavItem {
  href: string;
  label: string;
  description?: string;
}

interface DocsLayoutProps {
  title: string;
  subtitle?: string;
  nav: NavItem[];
  children: ReactNode;
  sourceFile?: string;
}

export function DocsLayout({
  title,
  subtitle,
  nav,
  children,
  sourceFile,
}: DocsLayoutProps) {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <Link href="/">ShootFlow Docs</Link>
          <span className="badge">Private</span>
        </div>
        <nav aria-label="Documentation">
          <ul>
            {nav.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>
                  <span className="nav-label">{item.label}</span>
                  {item.description ? (
                    <span className="nav-desc">{item.description}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="content-wrap">
        <header className="page-header">
          <h1>{title}</h1>
          {subtitle ? <p className="subtitle">{subtitle}</p> : null}
          {sourceFile ? (
            <p className="source">
              Built from <code>docs/{sourceFile}</code>
            </p>
          ) : null}
        </header>
        <article className="page-body">{children}</article>
        <p className="doc-support">
          Free to run.{" "}
          <a href="https://github.com/sponsors/Duncan-Haywood" rel="noopener">
            Support
          </a>{" "}
          is entirely optional and never changes what the product does.
        </p>
      </div>
    </div>
  );
}
