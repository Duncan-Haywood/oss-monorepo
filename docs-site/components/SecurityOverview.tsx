export function SecurityOverview() {
  return (
    <section className="security-callout">
      <h2>Access control</h2>
      <p>
        This site is intended for private deployment. Production requires{" "}
        <code>DOCS_SITE_PASSWORD</code> (HTTP Basic via Next.js middleware) and
        should also use Vercel Deployment Protection (password or SSO) on the
        project. Set <code>DOCS_PROTECTION_BYPASS_SECRET</code> only for trusted
        automation that must reach protected previews.
      </p>
      <p>
        Assign a custom domain in the Vercel project (for example{" "}
        <code>docs.shootflow.internal</code>) and restrict DNS to your team.
        Documents are generated at build time from repository <code>docs/</code>{" "}
        sources — the runtime app does not write back to the repo.
      </p>
    </section>
  );
}
