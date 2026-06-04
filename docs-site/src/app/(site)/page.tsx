import Link from "next/link";
import { generatedDocs } from "@/generated/doc-registry";
import styles from "./home.module.css";

export default function HomePage() {
  const reportCount = generatedDocs.filter((doc) => doc.section === "reports").length;
  const internalCount = generatedDocs.filter((doc) => doc.section === "internal").length;

  return (
    <div className={styles.page}>
      <h1>ShootFlow private documentation</h1>
      <p className={styles.lead}>
        This site is authored in TSX and built from the repository&apos;s <code>docs/</code>{" "}
        folder. HTML reports and Markdown files are synced at build time into generated routes.
      </p>

      <div className={styles.grid}>
        <section className={styles.card}>
          <h2>Build pipeline</h2>
          <ol>
            <li>
              <code>npm run sync</code> reads <code>docs/*.html</code> and <code>docs/*.md</code>
            </li>
            <li>Generated <code>src/app/reports|internal/&lt;slug&gt;/page.tsx</code> routes</li>
            <li>
              <code>next build</code> produces the deployable site
            </li>
          </ol>
        </section>
        <section className={styles.card}>
          <h2>Access control</h2>
          <p>
            Production requires <code>DOCS_ACCESS_PASSWORD</code> and{" "}
            <code>DOCS_SESSION_SECRET</code>. HTTP Basic Auth with the same password is also
            supported for automation.
          </p>
          <p>
            <Link href="/security">Deployment &amp; domain setup</Link>
          </p>
        </section>
      </div>

      <p className={styles.stats}>
        Synced catalog: {reportCount} HTML report{reportCount === 1 ? "" : "s"},{" "}
        {internalCount} markdown document{internalCount === 1 ? "" : "s"}.
      </p>
    </div>
  );
}
