export function SecurityGuide() {
  return (
    <article className="md-doc">
      <h2>Authentication layers</h2>
      <p>
        ShootFlow docs use defense in depth. Configure both middleware credentials
        and Vercel Deployment Protection where possible.
      </p>

      <h3>1. Edge middleware (required for private previews)</h3>
      <p>Set these Vercel environment variables on the docs project:</p>
      <ul>
        <li>
          <code>DOCS_AUTH_USER</code> — basic-auth username
        </li>
        <li>
          <code>DOCS_AUTH_PASSWORD</code> — basic-auth password (use a long random
          secret)
        </li>
        <li>
          <code>DOCS_AUTH_ENFORCE</code> — set to <code>false</code> only for local
          development without credentials
        </li>
      </ul>
      <p>
        When credentials are set, every route except static assets requires a
        valid <code>Authorization: Basic …</code> header. Browsers will prompt once
        per session.
      </p>

      <h3>2. Vercel Deployment Protection (recommended)</h3>
      <p>
        In the Vercel project → Settings → Deployment Protection, enable{" "}
        <strong>Password Protection</strong> for production and preview URLs. This
        adds a platform-level gate even if middleware is misconfigured.
      </p>
      <p>
        For CI and automation, use{" "}
        <code>VERCEL_AUTOMATION_BYPASS_SECRET</code> per Vercel docs — never commit
        the secret.
      </p>

      <h3>3. Custom domain</h3>
      <ol>
        <li>
          Add a domain in Vercel (e.g. <code>docs.yourstudio.com</code>).
        </li>
        <li>
          Point DNS (CNAME to <code>cname.vercel-dns.com</code> or A records per
          Vercel instructions).
        </li>
        <li>
          Restrict access: keep password protection on production; avoid listing
          the URL publicly.
        </li>
      </ol>

      <h3>4. Build pipeline</h3>
      <pre>
        <code>{`cd docs-site
npm ci
npm run build   # runs build:content then next build`}</code>
      </pre>
      <p>
        <code>build:content</code> reads <code>../docs/*.html</code> and writes{" "}
        <code>src/generated/</code> JSON plus a TypeScript manifest for routes.
      </p>

      <h3>5. Local development</h3>
      <p>
        Without <code>DOCS_AUTH_*</code> and with <code>DOCS_AUTH_ENFORCE=false</code>,
        the site runs open on localhost. Do not deploy without credentials.
      </p>
    </article>
  );
}
