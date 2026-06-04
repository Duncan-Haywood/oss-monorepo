import { DocsLayout } from "@/components/DocsLayout";
import { FULL_NAV } from "@/lib/navigation";

export default function SecurityPage() {
  return (
    <DocsLayout
      title="Site security & deployment"
      subtitle="How to host this private docs site on a custom domain."
      nav={FULL_NAV}
    >
      <section className="doc-section">
        <h2>Authentication</h2>
        <p>
          Production requires at least one of <code>DOCS_SITE_PASSWORD</code> or{" "}
          <code>DOCS_SITE_TOKEN</code> (fail closed if neither is set). Supported methods:
        </p>
        <ul>
          <li>
            <strong>HTTP Basic</strong> — <code>DOCS_SITE_PASSWORD</code> with optional{" "}
            <code>DOCS_SITE_USERNAME</code> (default <code>shootflow</code>)
          </li>
          <li>
            <strong>Session cookie</strong> — <code>DOCS_SITE_SESSION_SECRET</code> after
            successful Basic Auth (12 hours)
          </li>
          <li>
            <strong>Token login</strong> — <code>DOCS_SITE_TOKEN</code> via <code>/login</code>{" "}
            or <code>Authorization: Bearer</code>
          </li>
        </ul>
        <p>
          Local <code>npm run dev</code> allows open access when auth env vars are unset.
        </p>

        <h2>Vercel deployment</h2>
        <ol>
          <li>
            Import the repo with root directory <code>docs-site</code>.
          </li>
          <li>
            Set environment variables: <code>DOCS_SITE_PASSWORD</code> and/or{" "}
            <code>DOCS_SITE_TOKEN</code>, plus <code>DOCS_SITE_SESSION_SECRET</code> when using
            Basic Auth.
          </li>
          <li>
            Add a custom domain (e.g. <code>docs.yourdomain.com</code>) in
            Project → Domains.
          </li>
          <li>
            Enable <strong>Vercel Authentication</strong> or Deployment
            Protection (Password / SSO) as a second layer in Project →
            Deployment Protection.
          </li>
          <li>
            Set <code>robots: noindex</code> (already in layout metadata).
          </li>
        </ol>

        <h2>Build pipeline</h2>
        <pre>{`cd docs-site
npm ci
npm run build   # runs scripts/build-docs.mjs then next build`}</pre>
        <p>
          The prebuild step ingests <code>../docs/*.html</code> and selected
          markdown archives into <code>src/generated/content.ts</code>.
        </p>

        <h2>Security headers</h2>
        <p>
          <code>next.config.ts</code> sets X-Frame-Options, X-Content-Type-Options,
          Referrer-Policy, and Permissions-Policy on all routes.
        </p>

        <div className="callout">
          Do not commit passwords. Rotate <code>DOCS_SITE_SESSION_SECRET</code> if
          credentials leak. Pair app-level Basic Auth with Vercel Deployment
          Protection for defense in depth.
        </div>
      </section>
    </DocsLayout>
  );
}
