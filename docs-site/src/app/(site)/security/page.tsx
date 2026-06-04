import type { Metadata } from "next";
import styles from "./security.module.css";

export const metadata: Metadata = {
  title: "Access & deployment",
};

export default function SecurityPage() {
  return (
    <article className={styles.page}>
      <h1>Private deployment, domain, and security</h1>
      <p>
        The docs app is designed for a private Vercel deployment with password protection at the
        edge and optional platform-level controls.
      </p>

      <section>
        <h2>1. Application password (required in production)</h2>
        <p>Set these environment variables on Vercel (or your host):</p>
        <pre>
          <code>{`DOCS_ACCESS_PASSWORD=<long-random-password>
DOCS_SESSION_SECRET=<long-random-secret>`}</code>
        </pre>
        <ul>
          <li>Visitors sign in at <code>/login</code> and receive an HTTP-only session cookie.</li>
          <li>
            Automation can send <code>Authorization: Basic user:password</code> using the same
            password.
          </li>
          <li>
            If either variable is missing in production, the middleware returns{" "}
            <code>503</code> for all routes except login.
          </li>
        </ul>
      </section>

      <section>
        <h2>2. Custom domain</h2>
        <ol>
          <li>Import the <code>docs-site</code> directory as a Vercel project (root directory).</li>
          <li>Add a domain such as <code>docs.shootflow.example</code> in Project → Settings → Domains.</li>
          <li>Create the DNS CNAME/A record Vercel provides.</li>
          <li>Enable HTTPS (automatic on Vercel).</li>
        </ol>
      </section>

      <section>
        <h2>3. Platform hardening (recommended)</h2>
        <ul>
          <li>
            Vercel <strong>Deployment Protection</strong> (password or SSO) on the Production
            environment for defense in depth.
          </li>
          <li>
            Restrict preview deployments or disable public previews for this project.
          </li>
          <li>
            Keep <code>robots: noindex</code> (already set in layout metadata).
          </li>
          <li>Rotate <code>DOCS_ACCESS_PASSWORD</code> when team membership changes.</li>
        </ul>
      </section>

      <section>
        <h2>4. Local development</h2>
        <p>
          Without env vars, local <code>next dev</code> allows access so you can preview content.
          Run <code>npm run sync</code> before dev/build whenever <code>docs/</code> changes.
        </p>
        <pre>
          <code>{`cd docs-site
npm install
npm run dev`}</code>
        </pre>
      </section>
    </article>
  );
}
