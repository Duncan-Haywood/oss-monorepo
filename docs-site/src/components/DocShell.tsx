import Link from "next/link";
import { htmlReportNav, primaryNav } from "@/lib/docs-nav";

type DocShellProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

export function DocShell({ title, description, children }: DocShellProps) {
  const domain = process.env.NEXT_PUBLIC_DOCS_SITE_DOMAIN;
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <Link href="/">ShootFlow Docs</Link>
          {domain ? <span className="domain">{domain}</span> : null}
        </div>
        <nav>
          <p className="nav-label">Guides</p>
          <ul>
            {primaryNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.title}</Link>
              </li>
            ))}
          </ul>
          {htmlReportNav.length > 0 ? (
            <>
              <p className="nav-label">HTML reports</p>
              <ul>
                {htmlReportNav.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href}>{item.title}</Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </nav>
        <p className="sidebar-foot">Private documentation. Access requires a valid session token.</p>
      </aside>
      <main className="content">
        <header className="page-header">
          <h1>{title}</h1>
          {description ? <p className="lede">{description}</p> : null}
        </header>
        {children}
      </main>
    </div>
  );
}
