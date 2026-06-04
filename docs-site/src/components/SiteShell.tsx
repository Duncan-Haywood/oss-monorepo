import Link from "next/link";
import type { ReactNode } from "react";
import { generatedDocs } from "@/generated/doc-registry";
import styles from "./SiteShell.module.css";

type SiteShellProps = {
  children: ReactNode;
};

const reports = generatedDocs
  .filter((doc) => doc.section === "reports")
  .sort((a, b) => a.title.localeCompare(b.title));

const internal = generatedDocs
  .filter((doc) => doc.section === "internal")
  .sort((a, b) => a.title.localeCompare(b.title));

export function SiteShell({ children }: SiteShellProps) {
  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <Link href="/">ShootFlow Docs</Link>
          <span className={styles.privateBadge}>Private</span>
        </div>
        <nav className={styles.nav} aria-label="Documentation">
          <section>
            <h2>Handbook</h2>
            <ul>
              <li>
                <Link href="/">Overview</Link>
              </li>
              <li>
                <Link href="/security">Access &amp; deployment</Link>
              </li>
            </ul>
          </section>
          {reports.length > 0 ? (
            <section>
              <h2>Reports (from HTML)</h2>
              <ul>
                {reports.map((doc) => (
                  <li key={doc.href}>
                    <Link href={doc.href}>{doc.title}</Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {internal.length > 0 ? (
            <section>
              <h2>Internal (from Markdown)</h2>
              <ul>
                {internal.map((doc) => (
                  <li key={doc.href}>
                    <Link href={doc.href}>{doc.title}</Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </nav>
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
