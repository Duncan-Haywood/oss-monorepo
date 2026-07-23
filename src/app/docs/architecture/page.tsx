import type { Metadata } from "next";
import { DocLink, DocPage } from "@/components/docs/doc-page";
import { brand } from "@/lib/brand";
import { docPageMetadata } from "@/lib/seo";
import { getBundle } from "@/lib/pricing/bundles";

export const metadata: Metadata = docPageMetadata("/docs/architecture");

export default function ArchitectureDocPage() {
  return (
    <DocPage
      title="Architecture"
      subtitle={`Automation-first platform operated by ${brand.legalEntity}`}
      related={[
        { href: "/docs/product-bundles", label: "Product bundles" },
        { href: "/docs/voice-agent-flow", label: "Voice agent flow" },
        { href: "/docs/compliance", label: "Compliance" },
      ]}
    >
      <h2>Design principles</h2>
      <table>
        <thead>
          <tr>
            <th>Stakeholder</th>
            <th>Goal</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Local business owner</td>
            <td>Preview link, optional AI call, self-serve checkout</td>
          </tr>
          <tr>
            <td>Operator</td>
            <td>Zero touch — monitor metrics, handle alerts only</td>
          </tr>
          <tr>
            <td>System</td>
            <td>Voice gathers branding, updates preview, hands off to Stripe</td>
          </tr>
        </tbody>
      </table>

      <h2 id="data-ingestion">1. Data ingestion</h2>
      <p>
        Operator CSV bulk import on <code>/dashboard/leads</code> (see{" "}
        <code>src/lib/leads/csv-import.ts</code>) tags each lead with a <code>dataSource</code> for
        compliance. <code>importLeadsCsvAction</code> hard-rejects{" "}
        <code>csvText</code> longer than <code>MAX_CSV_IMPORT_TEXT_LENGTH</code> (512&nbsp;000)
        via <code>parseCsvImportText</code> before <code>parseLeadsCsv</code> /{" "}
        <code>splitCsvIntoLines</code> — auth is not a payload-size throttle, and soft-cap would
        truncate mid-row (MAX_ROWS=100 alone is not enough: line-splitting runs over the full
        string first). A per-IP <code>checkRateLimit</code> call (
        <code>csv-import:&#123;clientIp&#125;</code>) also throttles the action itself, mirroring
        every other loop-heavy dashboard action in this file (Commerce catalog Sync to Stripe,
        Archive orphans, Buffer schedule) — the byte cap alone only bounds a single request&apos;s
        size, not how often an unauthenticated caller (when{" "}
        <code>OPERATOR_DASHBOARD_PASSWORD</code> is unset) can repeat the up-to-100-row
        sequential <code>upsertLead</code> loop below. The optional batch <code>dataSource</code>{" "}
        tag is soft-capped via shared{" "}
        <code>normalizeLeadDataSource</code> / <code>MAX_LEAD_DATA_SOURCE_LENGTH</code> (64) —
        compliance free text, not an opaque lookup key — on both CSV import and{" "}
        <strong>Add lead</strong> before upsert. Optional <code>hours</code> cells use the same{" "}
        <code>weekday · weekend</code> encoding as SQLite persistence (
        <code>parseLeadHours</code> splits on the <em>first</em> middot only so a weekend value
        that itself contains <code>·</code> survives round-trip). Line splitting goes through{" "}
        <code>splitCsvIntoLines</code> (RFC 4180 quoted fields may embed newlines) rather than a
        raw <code>.split(&quot;\n&quot;)</code>. Field caps: businessName ≤ 200 chars (hard
        reject), description ≤ 2000 chars (soft truncate), services ≤ 100 entries with each
        token ≤ 100 chars, plus soft caps on city/state/address/tagline, hours weekday/weekend
        segments, and phone/email aligned with <code>MAX_CONTACT_*</code> so CRM ingest cannot
        diverge by path. Manual <strong>Add lead</strong> reuses the same caps via{" "}
        <code>normalizeLeadCreateFields</code> (<code>src/lib/leads/create-fields.ts</code>) so
        the dashboard form cannot bypass CSV length policy. Re-imports and manual add-lead treat slug
        collisions as create-path conflicts: existing leads are skipped (CSV) or rejected (add form)
        so pipeline fields (stage / outreach / notes / snooze) are never silently reset via{" "}
        <code>upsertLead</code>. When Convex is configured, Add lead and CSV import pass{" "}
        <code>requireConvex</code> (<code>LEAD_UPSERT_CONVEX_PRIMARY</code>) so a mutation failure
        surfaces a retry instead of claiming success after a SQLite-only write other instances
        cannot see. The <strong>Add Lead</strong> form&apos;s Pipeline Stage dropdown offers{" "}
        <code>discovery_call</code> directly (same <code>STAGES</code> list as the dashboard
        stage-move dropdown) — <code>addLeadAction</code> records outreach cadence step 1 for a
        lead created straight into either <code>outreach_sent</code> or{" "}
        <code>discovery_call</code>, sending a real Email 1 only for <code>outreach_sent</code>,
        mirroring the same record-without-send-for-discovery_call rule as{" "}
        <code>updateLeadStageAction</code> and <code>importLeadsCsvAction</code>. Action-level
        Vitest in <code>add-lead-action.test.ts</code> locks that Add lead glue (auth,
        slug/businessName gates, sanitize, field-length soft-caps / hard-reject, existing-slug
        conflict, requireConvex fail-closed, outreach_sent mark-before-Resend, discovery_call
        record-without-send) and{" "}
        <code>import-leads-csv-action.test.ts</code> locks bulk Import CSV (auth, empty /
        invalid CSV, per-row requireConvex, existing-slug skip, partial Convex failure, outreach
        cadence mark for rows imported directly into outreach_sent or discovery_call) beside
        upsert-persist helpers. A CSV row whose batch <strong>Initial stage</strong> is set to{" "}
        <strong>Outreach Sent</strong> or <strong>Discovery Call</strong> records cadence step 1 (
        <code>recordLeadOutreach</code>, same <code>OUTREACH_CADENCE_CONVEX_PRIMARY</code>
        fail-closed contract as Add lead) so it stays reachable by the Follow-ups due / Cold
        leads queues (both gate on <code>outreachStep &gt;= 1</code> for either stage) —
        deliberately does <em>not</em> send a live Email 1 the way Add lead does for a single
        row: CSV import is for recording outreach already sent through another channel, not a
        request to mass-email up to <code>MAX_ROWS</code> businesses in one click. Dashboard
        stage moves likewise pass{" "}
        <code>LEAD_STAGE_CONVEX_PRIMARY</code> (Mark live already fail-closes via{" "}
        <code>DEPLOY_HANDOFF_CONVEX_PRIMARY</code>; action-level Vitest in{" "}
        <code>mark-handoff-live-action.test.ts</code> locks that Mark live glue — auth, empty
        slug, no-handoff, requireConvex fail-closed, success revalidate — beside handoff-persist
        helpers) so funnel state cannot desync from
        Convex-first readers — especially the <code>outreach_sent</code> path, where the
        outreach mark already fails closed. When <code>OPERATOR_DASHBOARD_PASSWORD</code> is set,{" "}
        <code>src/proxy.ts</code> gates <code>/dashboard/*</code> and lead mutation server actions
        require a signed session cookie — action-level Vitest in{" "}
        <code>src/app/dashboard/login/actions.test.ts</code> locks login/logout glue
        (unconfigured redirect, invalid password, per-IP rate limit at 5 attempts/60s via{" "}
        <code>checkRateLimit</code> key <code>login:&lt;clientIp&gt;</code> before password
        comparison, cookie set/clear) beside{" "}
        <code>src/lib/auth/safe-next-path.ts</code> (shared by the login page&apos;s
        already-authenticated redirect and <code>loginOperatorAction</code> — rejects
        protocol-relative double-slash hosts, backslash host tricks, non-dashboard paths, and
        login self-targets; never trust <code>startsWith(&quot;/&quot;)</code> alone) — also
        rejects literal and percent-encoded <code>..</code> path segments and login
        self-loop variants after decode + single-dot collapse (hash{" "}
        <code>/dashboard/login#…</code>, <code>/dashboard/./login</code>, percent-encoded{" "}
        <code>%6cogin</code>), failing closed on malformed escapes, since a browser
        normalizes those to <code>/dashboard/login</code> or out of{" "}
        <code>/dashboard/*</code> before the redirect is ever sent +{" "}
        <code>operator.test.ts</code> token crypto +{" "}
        <code>requireOperatorAuth</code> / <code>isOperatorAuthenticated</code> cookie-read
        (open demo when unset or whitespace-only after trim, reject missing/invalid/expired,
        accept valid session) — <code>getPassword</code> /{" "}
        <code>tryCreateSessionFromPassword</code> trim env + form input so a trailing space in
        the secret or a pasted login field cannot lock the operator out — and hard-reject
        form passwords longer than <code>MAX_OPERATOR_PASSWORD_LENGTH</code> (256) before{" "}
        <code>Buffer.from</code> / timing-safe compare (rate limits blunt attempt count, not
        per-attempt payload size; soft-cap would change the secret) — and{" "}
        <code>verifyOperatorSessionToken</code> hard-rejects cookie values longer than{" "}
        <code>MAX_OPERATOR_SESSION_TOKEN_LENGTH</code> (128; genuine tokens ~66 chars) before HMAC /{" "}
        <code>Buffer.from</code> (proxy verifies on every <code>/dashboard/*</code> with no rate
        limit; soft-cap would change the opaque token — same class as unsubscribe token length) —
        and <code>safeNextPath</code> falls back to <code>/dashboard</code> when the
        client-supplied <code>next</code> path exceeds <code>MAX_SAFE_NEXT_PATH_LENGTH</code>{" "}
        (2048; same optional redirect length policy as billing-portal <code>returnUrl</code> —
        soft-cap would change the destination; hard-reject would strand login) — and{" "}
        <code>src/proxy.ts</code> dashboardAuthGate must call <code>safeNextPath(pathname)</code>{" "}
        before minting the login redirect <code>Location</code> (and clear inherited query/hash)
        so a multi-KB <code>/dashboard/…</code> probe cannot echo into the redirect header even
        though the login page would later fall back —{" "}
        <code>src/proxy.ts</code> dashboardAuthGate also verifies via exported{" "}
        <code>getPassword()</code> (never raw <code>process.env</code>) so a secret-manager
        paste cannot accept login then infinite-redirect at the Host gate — and{" "}
        <code>proxy.test.ts</code> Host gate + trim-parity + over-long next / inherited-query
        cases. Until the password is a
        non-placeholder secret,{" "}
        <DocLink href="/dashboard">/dashboard</DocLink> and{" "}
        <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> show an amber open-dashboard
        banner via <code>assessOperatorAuthEnvReadiness</code> — distinct from Stripe / Resend /
        Anthropic / digest banners. <code>src/proxy.ts</code> also rewrites the root path to a
        lead&apos;s <code>/preview/[slug]</code> when the request Host is a platform preview
        subdomain (<code>{"{slug}.{productionRootDomain}"}</code>) that resolves to a real lead, or
        a client&apos;s own domain saved via <strong>Save domain</strong> on{" "}
        <code>/dashboard/leads</code> (Starter &ldquo;Preview subdomain → custom domain
        handoff&rdquo; promise) — action-level Vitest in{" "}
        <code>assign-custom-domain-action.test.ts</code> locks that Save domain glue (auth, empty
        slug, trim-to-null clear, URL→bare-host normalize, invalid/platform-host reject,
        collision reject when another lead owns the domain, no-handoff, requireConvex
        fail-closed, success revalidate) via <code>parseOperatorCustomDomain</code> beside
        handoff / custom-domain-routing helpers;{" "}
        <code>assign-vercel-project-action.test.ts</code> locks Assign Vercel project isolation
        (auth, trim/clear project id, no-handoff, requireConvex fail-closed, success revalidate).
        See{" "}
        <DocLink href="/docs/production-deploy">Production deploy</DocLink>.
        Orchestration Vitest in <code>src/proxy.test.ts</code> locks auth redirect/allow,
        preview-subdomain-before-platform-host ordering, unrecognized-subdomain{" "}
        <code>next()</code> (no demo-catalog fallthrough), over-long Host labels never
        calling <code>getLeadBySlug</code> / <code>getLeadSlugByCustomDomain</code>{" "}
        (<code>isPublicLeadSlugPathLengthOk</code> + <code>isPlausibleCustomDomainHost</code> —
        spoofed Host is not DNS-bounded), and never Host-diverting{" "}
        <code>/api/*</code> or <code>/dashboard/*</code> — helper suites alone are not enough.
        Google Places API and other licensed sources remain future work after legal review. No UI
        scraping.
      </p>
      <p>
        <code>src/lib/db.ts</code> imports <code>&quot;server-only&quot;</code>, so it cannot be
        imported directly by Vitest (mirrors the <code>stripe-sync.ts</code> testability pattern:
        every existing test mocks <code>@/lib/db</code> wholesale rather than exercising its real
        Convex/SQLite fallback). The static Convex API map (<code>const api</code> in{" "}
        <code>db.ts</code>) is still locked without importing that module:{" "}
        <code>src/lib/db/convex-api-map-audit.ts</code> diffs every public{" "}
        <code>query</code>/<code>mutation</code> export under <code>convex/*.ts</code> against the
        map and fails when a live function is unregistered (a missing registration throws at call
        time, gets swallowed by the Convex→SQLite fallback, and splits writes across instances).
        Only the deliberate dead orphans <code>orders.createOrder</code> /{" "}
        <code>orders.getByStripeSessionId</code> (superseded by <code>leads.markLeadPaid</code>)
        stay allowlisted. Every SQLite row-mapping/JSON-parsing helper in <code>db.ts</code>{" "}
        is pulled out into a sibling <code>sqlite-row-mapping.ts</code> (no{" "}
        <code>server-only</code> import) with direct Vitest coverage, so that logic actually runs
        under test instead of being permanently hidden behind the module mock:{" "}
        <code>src/lib/leads/sqlite-row-mapping.ts</code> (<code>lead.hours</code> string
        round-trip, <code>lead.services</code> JSON serialize/parse, category/tier defaulting),{" "}
        <code>src/lib/deploy/sqlite-row-mapping.ts</code> (deploy handoff{" "}
        <code>dnsInstructions</code>/<code>notes</code> JSON parse — also fixed a missing{" "}
        <code>Array.isArray</code> guard these two had relative to every other JSON-parsing helper
        in <code>db.ts</code>, so a corrupted column value now degrades to <code>[]</code> instead
        of returning a wrong-shaped value), plus{" "}
        <code>src/lib/marketing/sqlite-row-mapping.ts</code>,{" "}
        <code>src/lib/commerce/sqlite-row-mapping.ts</code> (catalog + Commerce order rows),{" "}
        <code>src/lib/voice/sqlite-row-mapping.ts</code>,{" "}
        <code>src/lib/inquiries/sqlite-row-mapping.ts</code>,{" "}
        <code>src/lib/checkout/sqlite-row-mapping.ts</code>, and{" "}
        <code>src/lib/orders/sqlite-row-mapping.ts</code>.
      </p>
      <p>
        Dual-backend list queries must return the <em>same row order</em> regardless of which
        backend is configured, or the same data renders differently on SQLite vs. Convex.
        The Convex list handlers therefore mirror their SQLite <code>ORDER BY</code> twins:{" "}
        <code>leads.list</code> sorts <code>_creationTime</code> descending to match{" "}
        <code>getLeads</code> (<code>ORDER BY createdAt DESC</code>; the <code>leads</code> table
        has no explicit <code>createdAt</code> field, so <code>_creationTime</code> is the closest
        proxy — a bare <code>.collect()</code> returns <em>ascending</em> creation order and
        reversed the <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> table between
        backends).         <code>checkoutSessions.listOpen</code> sorts the app{" "}
        <code>createdAt</code> ascending (abandoned-recovery works oldest carts first) and{" "}
        <code>inquiries.listBySlug</code> sorts the app <code>createdAt</code> descending before
        slicing to <code>limit</code> — both because their <code>by_status</code>/
        <code>by_leadSlug</code> indexes have no <code>createdAt</code> sort field, so a raw{" "}
        <code>.order()</code> would sort by <code>_creationTime</code> instead of the app column.
        Likewise <code>commerceOrders.list</code> / <code>listUnpaid</code> collect then sort
        app <code>createdAt</code> ISO descending (then slice for <code>list</code>&apos;s
        limit) to match SQLite <code>ORDER BY createdAt DESC</code> — bare{" "}
        <code>.order(&quot;desc&quot;)</code> was a residual after the leads/checkout/inquiries
        fold and would diverge the Commerce payouts panel when app{" "}
        <code>createdAt</code> ≠ insert clock. <code>db.ts</code> re-applies{" "}
        <code>sortCommerceOrdersNewestFirst</code> on the Convex path as belt-and-suspenders
        (same pattern as <code>listOrders</code> + <code>sortOrdersNewestFirst</code>).
      </p>
      <p>
        See <DocLink href="/docs/compliance">Compliance</DocLink>.
      </p>

      <h2>2. Site generation</h2>
      <p>
        Category templates (restaurant, salon, trades, generic) render at{" "}
        <code>/preview/[slug]</code> from the lead catalog (
        <code>src/lib/leads</code>). Demo slugs: <code>example-bakery</code>,{" "}
        <code>serene-salon</code>, <code>mountain-plumbing</code>. Commerce catalog
        items load via <code>loadPreviewCommerceItems</code> (
        <code>@/lib/commerce/preview-commerce</code> — not re-exported from the{" "}
        <code>@/lib/commerce</code> barrel, which <code>leads-client</code> imports
        as a client module) — stage-gated on{" "}
        <code>leadStageEligibleForCommerceCatalog</code> (paid/live only) and
        slug-scoped via <code>listOrdersByLeadSlug</code> (
        <code>orders.by_leadSlug</code> / SQLite <code>WHERE l.slug = ?</code>),
        never a full-ledger <code>listOrders()</code> collect on cold outreach
        previews. The same slug-scoped helper backs Manage billing (
        <code>createBillingPortalForLead</code>) and per-lead dashboard
        eligibility (Starter upsell, marketing/voice packs, commerce catalog);
        full-ledger <code>listOrders()</code> stays on digest + dashboard
        aggregate surfaces only. Path slug length is
        hard-capped via <code>loadPreviewPageLead</code> (
        <code>isPublicLeadSlugPathLengthOk</code> /{" "}
        <code>MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH</code>=120 — same gate as contact +
        preview-open) before CRM lookup or <code>resolvePreviewLead</code> minting;
        over-long paths <code>notFound()</code> so a multi-KB token cannot render
        synthetic preview HTML/JSON-LD.{" "}
        <code>resolvePreviewLead</code> (slug keyword → category + recommended tier) and the
        demo catalog have direct Vitest coverage in{" "}
        <code>src/lib/leads/demo-catalog.test.ts</code>; the length gate has{" "}
        <code>src/lib/leads/preview-page-lead.test.ts</code>. Per-category shell / accent / CTA
        tokens live in <code>src/lib/previews/themes.ts</code> (
        <code>CATEGORY_THEMES</code> + <code>getCategoryTheme</code>) with direct Vitest
        coverage in <code>src/lib/previews/themes.test.ts</code> so a silent label or
        atmosphere drift cannot ship without failing the suite. Tier upsell cards link to
        checkout with <code>slug</code> + recommended <code>tier</code>.
      </p>

      <h2 id="seo">2b. SEO &amp; discoverability</h2>
      <p>
        Starter sells &ldquo;Basic SEO&rdquo; (see landing page copy) — <code>/preview/[slug]</code>{" "}
        renders per-lead <code>generateMetadata</code> (title, description, canonical URL, Open
        Graph/Twitter tags) plus a schema.org <code>LocalBusiness</code> JSON-LD block (subtype by
        category: Restaurant, HairSalon, HomeAndConstructionBusiness). <code>/sitemap.xml</code>{" "}
        lists marketing pages plus only the lead previews we are entitled to publish — curated
        demo-catalog showcases and real customers who consented by buying / going live (stage{" "}
        <code>paid</code> or <code>live</code>). Cold-prospected leads (a real business at{" "}
        <code>discovered</code>/<code>outreach_sent</code>/etc. that never engaged) are excluded
        from the sitemap AND emit <code>robots: noindex,nofollow</code> from{" "}
        <code>generateMetadata</code>, so we never invite Google to index a third party&apos;s
        AI-generated demo under our domain without consent. Three surfaces share one predicate —{" "}
        <code>isLeadPreviewIndexable</code> (<code>src/lib/seo.ts</code>) keyed on{" "}
        <code>isCuratedDemoLeadSlug</code> (<code>src/lib/leads/demo-catalog.ts</code>) — so the
        sitemap, the page-level robots directive, and LocalBusiness JSON-LD emission cannot drift.
        Cold-prospected / closed previews omit the JSON-LD block entirely via{" "}
        <code>leadPreviewJsonLdIfIndexable</code> (robots=noindex alone is not enough — crawlers
        still parse structured data). Public preview HTML, meta description, and JSON-LD also
        soft-cap create-path free-text via <code>softCapLeadForPublicSurface</code> (
        <code>src/lib/leads/public-fields.ts</code>) at the same MAX_* ceilings as CSV/Add lead —
        pre-cap Convex/SQLite rows cannot emit unbounded description/tagline/services into
        unauthenticated output. <code>/robots.txt</code> allows crawling except{" "}
        <code>/dashboard</code> and <code>/api</code>. Canonical origin comes from{" "}
        <code>NEXT_PUBLIC_APP_URL</code> (see{" "}
        <code>src/lib/seo.ts</code>) — set it in production so canonical/OG URLs and the sitemap
        don&apos;t point at localhost. Until it is a non-localhost public origin,{" "}
        <DocLink href="/dashboard">/dashboard</DocLink> and{" "}
        <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> show an orange canonical-URL
        banner via <code>assessAppUrlEnvReadiness</code> (
        <code>src/lib/seo/app-url-env-readiness.ts</code>) — missing / whitespace / localhost /{" "}
        <code>example.com</code> placeholders are flagged (env presence only; distinct from Stripe
        / Resend / auth banners). Until <code>NEXT_PUBLIC_PRODUCTION_DOMAIN</code> is a bare
        public production root, the same dashboards show a cyan production-root banner via{" "}
        <code>assessProductionDomainEnvReadiness</code> (
        <code>src/lib/deploy/production-domain-env-readiness.ts</code>) — missing / whitespace /
        localhost / <code>example.com</code> / <code>preview.*</code> placeholders are flagged;
        <code>NEXT_PUBLIC_PREVIEW_DOMAIN</code> alone does not count as ready (handoff{" "}
        <code>suggestedHost</code> otherwise silently falls back). Until{" "}
        <code>VERCEL_TOKEN</code> is a non-placeholder secret, the same dashboards show a blue
        Vercel-automation banner via <code>assessVercelTokenEnvReadiness</code> (
        <code>src/lib/deploy/vercel-token-env-readiness.ts</code>) — missing / whitespace /
        changeme|token|xxx placeholders are flagged so paid handoffs cannot silently skip Domains
        API automation. Until shared <code>VERCEL_PROJECT_ID</code> is a non-placeholder id, the
        same dashboards show an indigo shared-project banner via{" "}
        <code>assessVercelProjectIdEnvReadiness</code> (
        <code>src/lib/deploy/vercel-project-id-env-readiness.ts</code>) — Domains API still skips
        unless every handoff gets Assign project. Dashboard{" "}
        <code>assignVercelProjectAction</code> hard-rejects{" "}
        <code>vercelProjectId</code> longer than{" "}
        <code>MAX_VERCEL_PROJECT_ID_LENGTH</code> (100) via{" "}
        <code>parseVercelProjectId</code> (
        <code>src/lib/deploy/vercel-project-id.ts</code>) before{" "}
        <code>assignVercelProjectAndProvision</code> — auth is not a payload-size
        throttle, and soft-cap would change the opaque Domains API key (blank still
        clears a dedicated project). Dashboard{" "}
        <code>replyToInquiryAction</code> /{" "}
        <code>updateInquiryStatusAction</code> hard-reject{" "}
        <code>inquiryId</code> longer than{" "}
        <code>MAX_INQUIRY_ID_LENGTH</code> (128) via{" "}
        <code>parseInquiryId</code> (
        <code>src/lib/inquiries/inquiry-id.ts</code>) before Convex/SQLite or
        Resend — opaque app-owned <code>inq_*</code> keys must not be soft-capped
        (same auth-gated id class as Assign-project). Slug-keyed dashboard
        actions (Mark live, Assign project/domain, stage/notes/snooze, follow-up,
        packs, commerce catalog, Billing portal, …) hard-reject{" "}
        <code>slug</code> longer than{" "}
        <code>MAX_LEAD_SLUG_LENGTH</code> (63) via{" "}
        <code>parseLeadSlugLookup</code> (
        <code>src/lib/leads/slug.ts</code>) before Convex/SQLite / Stripe /
        Resend — CRM lookup keys match create-path DNS max (commerce Buy now
        reuses the same helper); soft-cap would change the opaque key. Until{" "}
        <code>NEXT_PUBLIC_CONVEX_URL</code> is a non-placeholder deployment URL, the same
        dashboards show a pink multi-instance persistence banner via{" "}
        <code>assessConvexUrlEnvReadiness</code> (
        <code>src/lib/convex/convex-url-env-readiness.ts</code>) — missing / whitespace /
        example.convex.cloud|changeme placeholders are flagged;{" "}
        <code>resolveConvexDeploymentUrl</code> also gates <code>src/lib/db.ts</code> client
        init so whitespace-only cannot construct <code>ConvexHttpClient</code>. Local
        single-process SQLite remains fine for solo demos. Once{" "}
        <code>NEXT_PUBLIC_CONVEX_URL</code> is configured, a second pink banner (
        <code>assessConvexApiSecretEnvReadiness</code>,{" "}
        <code>src/lib/convex/convex-api-secret-env-readiness.ts</code>) warns when the
        server-only <code>CONVEX_API_SECRET</code> is unset — every{" "}
        <code>convex/*.ts</code> public function requires it (see{" "}
        <code>requireApiSecret</code> above), so a missing secret fails every Convex call
        closed and silently falls back to SQLite with no other dashboard signal.{" "}
        <code>siteUrl()</code>&apos;s precedence (
        <code>NEXT_PUBLIC_APP_URL</code> trimmed + trailing-slash-stripped &gt;{" "}
        <code>VERCEL_URL</code> &gt; localhost default) and the per-category JSON-LD{" "}
        <code>@type</code> mapping have direct Vitest coverage in{" "}
        <code>src/lib/seo.test.ts</code>. The JSON-LD block is embedded via{" "}
        <code>dangerouslySetInnerHTML</code>, so it is serialized with{" "}
        <code>safeJsonLdScript</code> (not a raw <code>JSON.stringify</code>) — lead fields
        (business name, description, address) are free text from CSV import or a future Places
        scrape, and an unescaped <code>&lt;/script&gt;</code> in one would end the JSON-LD tag
        early and let injected HTML run for every real visitor to that lead&apos;s preview site.
      </p>
      <p>
        Separately, the root layout (<code>src/app/layout.tsx</code>) embeds a sitewide schema.org{" "}
        <code>Organization</code> JSON-LD block (<code>homepageOrganizationJsonLd</code>,{" "}
        <code>src/lib/seo.ts</code>) describing the platform itself, not a client business — it
        renders on every route (marketing, preview, dashboard) the same way the header/footer
        branding already does, since the operator always consents to describing itself and there
        is no indexable-only gate to apply. It intentionally omits{" "}
        <code>brand.postalAddress</code>: unlike every other <code>brand.*</code> fallback, that
        one defaults to a bracketed placeholder string rather than plausible real content, and
        publishing it verbatim as structured data would misrepresent a placeholder as a real
        address. Also serialized via <code>safeJsonLdScript</code>.
      </p>

      <h2 id="security-headers">2c. Security headers</h2>
      <p>
        <code>next.config.ts</code>&apos;s <code>headers()</code> applies{" "}
        <code>SECURITY_HEADERS</code> (<code>src/lib/security/security-headers.ts</code>, a
        directly-Vitest-tested data module — <code>next.config.ts</code> itself sits outside this
        app&apos;s module graph and isn&apos;t covered by <code>vitest.config.ts</code>&apos;s
        include globs) to every route: <code>X-Frame-Options: DENY</code> (nothing in this app is
        meant to be framed by another origin — the only <code>iframe</code> is{" "}
        <code>/preview/[slug]</code>&apos;s own Google Maps embed, this app framing Maps, not the
        reverse), <code>X-Content-Type-Options: nosniff</code>,{" "}
        <code>Referrer-Policy: strict-origin-when-cross-origin</code>,{" "}
        <code>Permissions-Policy</code> denying camera/microphone/geolocation/browsing-topics, and
        a two-year <code>Strict-Transport-Security</code>. Deliberately excludes{" "}
        <code>Content-Security-Policy</code>: that header can only be applied statically to{" "}
        <em>every</em> route from <code>next.config.ts</code>, but a CSP strict enough to matter
        needs a per-request nonce, and nonce-based CSP requires dynamic rendering to reach the
        page (Next.js disables static optimization/ISR wherever the nonce is applied) — this
        app&apos;s marketing/docs pages are static by default, so a sitewide nonce&apos;d policy
        set here would permanently block Next&apos;s own framework hydration script on every one
        of them.
      </p>
      <p>
        Content-Security-Policy is instead set per-request from{" "}
        <code>src/proxy.ts</code> (Next 16&apos;s Proxy runs on the Node.js runtime by default,
        unlike the old Edge-only Middleware), via the two-tier policy in{" "}
        <code>src/lib/security/content-security-policy.ts</code>. Routes Next already renders
        dynamically per request — <code>/dashboard</code> (this app&apos;s most sensitive
        surface: operator auth plus every mutating action), <code>/checkout</code>, and{" "}
        <code>/preview</code> — get the strict tier:{" "}
        <code>script-src &apos;self&apos; &apos;nonce-&lt;value&gt;&apos;
        &apos;strict-dynamic&apos;</code> and a matching <code>style-src</code>, with a fresh
        nonce minted every request and folded into the <em>request</em> headers (not just the
        response) so Next can read it back out during SSR and auto-apply it to its own
        framework/hydration scripts, exactly as{" "}
        <a href="https://nextjs.org/docs/app/guides/content-security-policy">
          Next&apos;s CSP guide
        </a>{" "}
        documents. A rewrite always applies the strict tier for its destination regardless of the
        original request path — the preview-subdomain and custom-domain rewrites in{" "}
        <code>src/proxy.ts</code> both land on <code>/preview/[slug]</code> even though the
        inbound path was <code>&quot;/&quot;</code>. Every other route (the static marketing/docs
        pages, <code>/api/*</code>) gets a nonce-free but still-hardened tier —{" "}
        <code>object-src &apos;none&apos;; base-uri &apos;self&apos;; form-action
        &apos;self&apos;; frame-ancestors &apos;none&apos;; upgrade-insecure-requests</code>{" "}
        — deliberately omitting <code>default-src</code>/<code>script-src</code>/
        <code>style-src</code> so an unset directive stays unrestricted and static-page hydration
        keeps working unchanged, the same no-CSP-for-scripts behavior this app already shipped,
        just with real fetch-directive hardening layered on top of it. Neither of this app&apos;s
        two inline <code>&lt;script&gt;</code> tags (both{" "}
        <code>type=&quot;application/ld+json&quot;</code>, the JSON-LD in{" "}
        <code>src/app/layout.tsx</code> and <code>src/app/preview/[slug]/page.tsx</code>) needs
        the nonce threaded in on either tier: <code>script-src</code> only governs elements the
        browser would actually execute as script, and a JSON-LD data block is never executed. The
        strict tier also sets <code>frame-src &apos;self&apos; https://www.google.com
        https://maps.google.com</code>, allowlisting <code>/preview/[slug]</code>&apos;s Google
        Maps embed (<code>src/components/preview/maps-embed.tsx</code>) — with no{" "}
        <code>frame-src</code>, <code>default-src &apos;self&apos;</code> blocks that cross-origin
        iframe in a real browser, a regression the original rollout&apos;s curl-only verification
        missed since curl never enforces CSP or renders an iframe.
      </p>

      <h2 id="preview-hosting">3. Preview hosting</h2>
      <p>
        Primary app on Vercel. Previews at <code>{"{slug}"}.preview.domain.com</code> via wildcard DNS.
      </p>

      <h2>4. Outreach (automated)</h2>
      <p>Email primary; optional outbound voice; inbound callback routes to platform voice agent.</p>
      <p>
        Until <code>RESEND_API_KEY</code> is a non-placeholder secret,{" "}
        <DocLink href="/dashboard">/dashboard</DocLink> and{" "}
        <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> show a sky outreach-blocked
        banner via <code>assessResendEmailEnvReadiness</code> (
        <code>src/lib/email/resend-env-readiness.ts</code>) — missing / whitespace-only /{" "}
        <code>re_placeholder…</code> / <code>re_...</code> match <code>sendEmail</code>&apos;s
        mock gate so operators cannot mistake silent mock success for real delivery. Distinct from
        Stripe core / Price-ID banners. Until <code>EMAIL_FROM</code> is a non-placeholder
        Resend-verified address, the same dashboards show a lime From-address banner via{" "}
        <code>assessEmailFromEnvReadiness</code> (
        <code>src/lib/email/email-from-env-readiness.ts</code>) — <code>sendEmail</code> /{" "}
        <code>sendOperatorDailyDigest</code> use <code>formatResendFromHeader(brand.name,
        brand.emailFrom)</code> for the Resend <code>from</code> header (never a hardcoded
        platform domain). Until <code>ANTHROPIC_API_KEY</code> is a non-placeholder
        secret, the same dashboards show a teal AI-packs-on-stub banner via{" "}
        <code>assessAnthropicEnvReadiness</code> (
        <code>src/lib/ai/anthropic-env-readiness.ts</code>) — matching the Stub* factory gate in
        marketing/voice generators (plus documented <code>sk-ant-...</code> placeholders). Until{" "}
        <code>OPERATOR_DIGEST_EMAIL</code> is a non-placeholder inbox, the same dashboards show an
        emerald daily-digest-blocked banner via{" "}
        <code>assessOperatorDigestEmailEnvReadiness</code> (
        <code>src/lib/digest/operator-digest-email-env-readiness.ts</code>) — matching{" "}
        <code>sendDailyDigestAction</code>&apos;s trim gate (plus documented{" "}
        <code>you@example.com</code> placeholders) so operators see that pipeline-health digest
        delivery is unconfigured before clicking <strong>Send daily digest</strong>.
        Action-level Vitest in{" "}
        <code>src/app/dashboard/leads/send-daily-digest-action.test.ts</code> locks auth, the
        destination trim gate, uncapped <code>listUnrepliedInquiries</code> /{" "}
        <code>listUnpaidCommerceOrders</code> / <code>listMarketingPacksForMonth</code> wiring,
        and <code>sendOperatorDailyDigest</code> success/mock/failure —{" "}
        <code>daily-digest.test.ts</code> alone does not cover that glue.
      </p>
      <p>
        Every automated marketing send (outreach Email 1-3, Starter upsell, abandoned-checkout
        recovery) calls <code>sendEmail</code> (<code>src/lib/email/resend.ts</code>), which
        checks the CAN-SPAM unsubscribe suppression list before sending and{" "}
        <code>GET /api/unsubscribe</code> writes to it. Every outbound{" "}
        <code>sendEmail</code> call also sets <code>List-Unsubscribe</code> +{" "}
        <code>List-Unsubscribe-Post: List-Unsubscribe=One-Click</code> headers pointing at the
        same signed <code>unsubscribeUrl</code> (Gmail/Yahoo bulk-sender requirements, effective
        2024-02) — <code>POST /api/unsubscribe</code> (RFC 8058 one-click, added alongside the
        headers so a mail client&apos;s automated request actually succeeds instead of 405ing,
        since an advertised-but-broken one-click target is itself a spam signal) shares{" "}
        <code>verifyAndSuppress</code>, the exact same rate-limit / token-verify / length-cap /{" "}
        <code>requireConvex</code> guards <code>GET</code> uses below, differing only in response
        shape (plain-text acknowledgement, never the HTML confirmation page a human sees). Post-payment transactional sends —{" "}
        <code>sendReceiptEmail</code>, the bundle DNS go-live <code>sendEmail</code> in the Stripe
        webhook, and <code>sendCommerceBuyNowClientReceipt</code> — pass{" "}
        <code>skipSuppression: true</code> so a cold-outreach unsubscribe cannot block receipt /
        DNS instructions / Commerce order notification after money is taken (marker-only gating
        left Stripe redelivering forever against the same suppress). Starter sold contact-form
        CRM also skips: <code>POST /api/contact/[slug]</code> inquiry notify to{" "}
        <code>lead.email</code>, and operator <code>sendInquiryReply</code> to the visitor —
        persist-then-notify must not mark an inquiry replied while marketing suppression
        permanently blocks the visitor reply.{" "}
        <code>replyToInquiryAction</code> also looks up the lead via{" "}
        <code>getLeadBySlug</code> and passes its email as <code>sendInquiryReply</code>&apos;s{" "}
        <code>replyTo</code> (same <code>sanitizeReplyToEmail</code> validation as the notify
        direction above) — closing the CRM reply loop both ways: the visitor&apos;s first message
        already Reply-To&apos;s back to them from the notify email, and now the operator&apos;s
        reply Reply-To&apos;s to the business owner&apos;s own inbox instead of this
        app&apos;s <code>EMAIL_FROM</code>, so a visitor&apos;s follow-up no longer vanishes into a
        noreply address. Falls back to no <code>Reply-To</code> (prior behavior) when the lead has
        no email on file. Sold Growth/Complete pack delivery on{" "}
        <code>lead.email</code> also skips: <code>sendMarketingPackToClientEmail</code> and{" "}
        <code>sendClientVoicePackToClientEmail</code> pass <code>skipSuppression: true</code> so a
        cold-outreach unsub cannot permanently block paid monthly marketing content or Complete
        phone scripts the client is billed for.{" "}
        <code>sendOperatorDailyDigest</code> also skips suppression (operator inbox, not a
        prospect). The unsubscribe
        link embeds an HMAC token (<code>signUnsubscribeToken</code> /{" "}
        <code>verifyUnsubscribeToken</code>, <code>src/lib/email/unsubscribe-token.ts</code>,
        keyed on <code>RESEND_API_KEY</code>) bound to that recipient&apos;s address — the route
        rejects a missing or mismatched token with <code>400</code> before calling{" "}
        <code>suppressEmail</code>, so an attacker who merely knows an address (scraped from the
        same public listings CSV import targets) cannot silently suppress it. The same route also
        rate-limits by client IP via <code>checkRateLimit</code> (
        <code>src/lib/security/rate-limit.ts</code>, key <code>unsubscribe:&lt;clientIp&gt;</code>,
        same per-instance fixed-window helper as contact / checkout / preview-open; the helper
        purges expired buckets and caps active client keys at <code>MAX_RATE_LIMIT_BUCKETS</code>
        so rotating forwarded IPs cannot grow the process map without bound){" "}
        <em>before</em> token verify, returning <code>429</code> + <code>Retry-After</code> on
        exceed so a harvested footer link or a script hammering HMAC +{" "}
        <code>suppressEmail</code> cannot unboundedly mutate the global suppression list. The
        route also hard-rejects <code>email</code> query params longer than{" "}
        <code>MAX_CONTACT_EMAIL_LENGTH</code> and <code>token</code> query params longer than{" "}
        <code>MAX_UNSUBSCRIBE_TOKEN_LENGTH</code> (HMAC-SHA256 base64url is 43 chars; ceiling
        128) before HMAC verify — rate limits blunt request count, not per-request payload /
        crypto work / suppressions-row size; soft-cap would break signed footer tokens
        (truncation ≠ the address the token was minted for, and truncating an opaque token
        fails every genuine link). The
        suppression
        list (SQLite + Convex <code>suppressions</code>) follows the same Convex-first,
        SQLite-fallback pattern as every other table for operator reads — but the public
        unsubscribe route passes <code>requireConvex</code> (
        <code>UNSUBSCRIBE_CONVEX_PRIMARY</code>) when Convex is configured so a mutation failure
        returns <code>500</code> instead of claiming success after a SQLite-only write that other
        instances&apos; <code>isEmailSuppressed</code> (Convex-first) would never see. Operators
        can view the full suppression list on <DocLink href="/dashboard">/dashboard/leads</DocLink>{" "}
        (<code>SuppressedEmailsPanel</code>, reading <code>getSuppressedEmails</code>) and remove a
        mistaken/stale entry via <code>unsuppressEmailAction</code> (
        <code>convex/suppressions.ts</code>&apos;s <code>unsuppress</code> mutation +{" "}
        <code>unsuppressEmail</code> in <code>src/lib/db.ts</code>, both passing{" "}
        <code>requireConvex</code> so the removal is never silently SQLite-only) — this is a
        correction path, not a way to re-permit contact after a genuine opt-out; removal does not
        constitute renewed consent. Every
        dynamic value in outbound HTML — including env-sourced{" "}
        <code>brand.name</code> / <code>brand.legalEntity</code> /{" "}
        <code>brand.postalAddress</code> in signatures and the shared footer, the email
        echoed on the <code>GET /api/unsubscribe</code> success page, and every{" "}
        <code>href</code> built from <code>NEXT_PUBLIC_APP_URL</code> / preview / checkout /
        unsubscribe URLs in <code>src/lib/email/resend.ts</code> (same contract as
        client-receipt, marketing/voice deliver-pack, DNS handoff, and daily-digest) — goes
        through <code>escapeHtmlForEmail</code>; subject lines and From display names stay plain
        text.
        Two-layer brand env reads live in <code>src/lib/brand.ts</code> (getters; whitespace-only
        counts as unset; <code>NEXT_PUBLIC_BRAND_NAME</code> &gt; legacy{" "}
        <code>NEXT_PUBLIC_APP_NAME</code>) with direct Vitest coverage in{" "}
        <code>src/lib/brand.test.ts</code>. Until <code>NEXT_PUBLIC_BRAND_NAME</code> is a
        non-placeholder public brand, <DocLink href="/dashboard">/dashboard</DocLink> and{" "}
        <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> show a rose brand-copy
        banner via <code>assessBrandNameEnvReadiness</code> — matching{" "}
        <code>brand.isConfigured</code> (legacy APP_NAME does not clear it) so Email 1 cannot
        silently ship as <code>Your Brand</code> while Resend/Stripe/APP_URL look ready. Until{" "}
        <code>NEXT_PUBLIC_COMPANY_ADDRESS</code> is a non-placeholder postal address, the same
        dashboards show a yellow CAN-SPAM-address banner via{" "}
        <code>assessCompanyAddressEnvReadiness</code> (
        <code>src/lib/brand/company-address-env-readiness.ts</code>) — missing / whitespace /
        bracket-stub values leave every outreach footer on the documented{" "}
        <code>brand.postalAddress</code> fallback.
      </p>

      <h2>5. Platform voice agent</h2>
      <p>Vapi/Retell → <code>/api/voice/platform/webhook</code> → site config updater + Stripe checkout link.</p>

      <h2 id="payments">6. Payments (self-serve)</h2>
      <p>
        <code>POST /api/stripe/checkout</code> creates a real Stripe Checkout Session (501 only
        when Price IDs / secret key are missing). Route-level Vitest coverage in{" "}
        <code>src/app/api/stripe/checkout/route.test.ts</code> locks organic slug minting, Price ID
        line items, cancel URL attribution, and requireConvex fail-closed session tracking (create-side
        twin of the webhook orchestration suite).{" "}
        <code>POST /api/stripe/webhook</code> verifies signatures, marks the lead paid, records the
        order, sends a receipt email when Resend is configured, and enqueues a production deploy
        handoff (DNS + contact form). Bundle fulfillment requires a{" "}
        <code>parseLeadSlugLookup</code>-valid <code>metadata.slug</code> (create-path{" "}
        <code>MAX_LEAD_SLUG_LENGTH</code> ceiling — same hard-reject class as Commerce{" "}
        <code>parseCommerceCheckoutSlug</code>), a <code>getBundle(metadata.tier)</code>-known
        tier (same enum gate as checkout create), <code>BUNDLES</code> setup (+ monthly)
        env Price IDs on Checkout <code>listLineItems</code> (
        <code>sessionLineItemsMatchBundleCatalogPrices</code> — amount+currency alone
        do not prove which Price was charged), a <code>commerceAddon</code> flag
        derived from the same line-item Price IDs (both{" "}
        <code>COMMERCE_ADDON</code> setup + monthly env Prices present — never from{" "}
        <code>metadata.commerceAddon</code>), <code>session.currency</code>{" "}
        <code>usd</code> (<code>isStripeCheckoutCurrencyUsd</code> — create path
        charges only USD catalog Prices), <code>session.payment_status</code>{" "}
        <code>paid</code> (<code>isStripeCheckoutSessionPaid</code> — async ACH/
        bank methods fire <code>checkout.session.completed</code> while unpaid;
        ledger waits for paid on that event or{" "}
        <code>checkout.session.async_payment_succeeded</code>), and{" "}
        <code>session.amount_total</code>{" "}
        (integer cents) equal to{" "}
        <code>expectedBundleCheckoutAmountCents(bundle, derivedCommerceAddon)</code>{" "}
        (setup + first month from <code>BUNDLES</code>, plus optional{" "}
        <code>COMMERCE_ADDON</code> — twin of Commerce catalog <code>priceCents</code>{" "}
        parity) — a truthy but over-long slug, unknown/wrong-cased tier, missing
        catalog Prices on line items, forged Commerce flag, non-USD currency, unpaid
        async status, or mismatched Stripe amount skips or corrects before
        payment/handoff/receipt (session is still marked complete for unpaid completed
        + slug/tier/Price/currency/amount skips so abandoned-recovery does not nudge;
        do not 5xx forever; line-item list failures return 500 so Stripe retries).{" "}
        <code>checkout.session.async_payment_failed</code> reopens the local{" "}
        <code>checkout_sessions</code> row via <code>markCheckoutSessionOpen</code>{" "}
        (requireConvex) so Finish-checkout / Buy now recovery can nudge a retry —
        leaving status=<code>complete</code> forever after a failed ACH would
        permanently drop that revenue (recovery emails mint a new Checkout Session;
        the Stripe Session is terminal). Reopen write failures return{" "}
        <code>500</code> (<code>checkout_session_mark_open</code>). After durable
        bundle <code>recordLeadPayment</code> (+ handoff enqueue) succeeds — not
        merely after slug parse or Session markComplete —{" "}
        <code>markCompleteOpenBundleCheckoutSessionsForLead</code> also closes other
        open <em>bundle</em> rows for that <code>leadSlug</code> (never{" "}
        <code>commerce_sku</code> multi-shopper carts) so Finish-checkout / digest /
        pipeline-health cannot nudge an already-paid customer after an earlier
        abandoned Session. A paid Session that later skips fulfillment (unknown tier,
        wrong catalog Prices, non-USD, amount mismatch) must leave sibling open carts
        in recovery; cleanup write failures return{" "}
        <code>500</code> (<code>checkout_session_orphan_bundle_cleanup</code>).
        Paid <code>commerce_sku</code> fulfillment mirrors that with{" "}
        <code>markCompleteOpenCommerceCheckoutSessionsForLeadSkuCustomer</code>{" "}
        scoped by <code>leadSlug</code> + <code>skuId</code> + normalized{" "}
        <code>customerEmail</code> (skip when email is missing — never close by
        lead+sku alone) and runs only after a durable{" "}
        <code>insertCommerceOrder</code>; cleanup write failures return{" "}
        <code>500</code> (<code>checkout_session_orphan_commerce_cleanup</code>).
        Starter→Growth upsell after pay mints a new Checkout Session.{" "}
        When a subscriber cancels via Billing Portal, Stripe fires{" "}
        <code>customer.subscription.deleted</code> —{" "}
        <code>markOrdersRecurringCanceledByCustomer</code> sets{" "}
        <code>orders.recurringCanceledAt</code> for Growth/Complete/Commerce rows
        matching <code>stripeCustomerId</code> (idempotent; write failures return{" "}
        <code>500</code> / <code>orders_recurring_canceled</code>). Failed renewals
        pause the same field on <code>customer.subscription.updated</code> with
        status <code>past_due</code>|<code>unpaid</code> and on{" "}
        <code>invoice.payment_failed</code> for subscription invoices (one-time
        invoices skip — but only after <code>subscriptions.retrieve</code> still
        shows pause-eligible status (<code>past_due</code>|<code>unpaid</code> or{" "}
        <code>pause_collection</code>); a stale failed after recovery must not
        re-pause. Stripe <code>pause_collection</code> also pauses even when
        status stays <code>active</code>|<code>trialing</code> (checked before the
        grants clear). When they resubscribe, recover, or clear{" "}
        <code>pause_collection</code>, <code>customer.subscription.created</code> /{" "}
        <code>updated</code> with status <code>active</code>|<code>trialing</code>{" "}
        and no <code>pause_collection</code> calls{" "}
        <code>clearOrdersRecurringCanceledByCustomer</code> so packs/catalog resume
        (write failures return <code>500</code> /{" "}
        <code>orders_recurring_reactivated</code>).{" "}
        <code>invoice.paid</code> is the restore twin of{" "}
        <code>invoice.payment_failed</code>: retrieve the Subscription and clear
        only when grants + no <code>pause_collection</code> (blind clear would
        reopen the pause hole; one-time invoices skip; retrieve failures return{" "}
        <code>500</code> / <code>subscription_retrieve</code>). Both events also
        carry a customer-facing email twin, best-effort so a notify failure
        never turns an already-durable pause/restore write into a retry loop:{" "}
        <code>invoice.payment_failed</code> sends{" "}
        <code>sendPaymentFailedNotice</code> when the paused customer has a
        recurring order — selected via{" "}
        <code>orderGrantsSoldCapabilityEntitlement</code>, the same
        active/non-refunded/non-disputed predicate every sold-capability
        eligibility gate uses, so a refunded or disputed historical order
        never supplies a misleading notice recipient or a stale Manage-billing
        link — with a lead email on file, and{" "}
        <code>invoice.paid</code> sends the restore twin{" "}
        <code>sendPaymentRecoveredNotice</code> — but only when that event
        actually cleared a prior pause (<code>cleared &gt; 0</code>), so an
        ordinary healthy monthly renewal stays silent instead of emailing every
        subscriber a spurious &quot;service resumed&quot; notice every billing
        cycle. Both reuse the original Checkout Session&apos;s{" "}
        <code>/checkout/success?session_id=</code> Manage-billing link rather
        than minting a fresh Billing Portal session from inside the webhook.{" "}
        <code>pause_collection</code> is a separate axis with no invoice event
        at all (settable directly in the Stripe Dashboard, with no charge ever
        attempted), so <code>customer.subscription.updated</code> sends its own{" "}
        <code>sendSubscriptionPausedNotice</code> /{" "}
        <code>sendSubscriptionResumedNotice</code> pair — deliberately separate
        copy from <code>sendPaymentFailedNotice</code>/
        <code>sendPaymentRecoveredNotice</code>, since &quot;your card was
        declined&quot; would be false for a pause with no failed charge. Both
        fire only when Stripe&apos;s own{" "}
        <code>event.data.previous_attributes</code> contains a{" "}
        <code>pause_collection</code> key for that specific event (Stripe only
        lists fields that actually changed on a <code>*.updated</code> event),
        combined with <code>collectionPaused</code> for the pause notice or{" "}
        <code>cleared &gt; 0</code> for the resume notice — this stops both a
        repeat notify on every later unrelated update while a pause persists
        and a double-email of an ordinary <code>past_due</code>|
        <code>unpaid</code> pause/restore already covered by the{" "}
        <code>invoice.*</code> pair. On grants restore,{" "}
        <code>subscription.created</code>|<code>updated</code> and{" "}
        <code>invoice.paid</code> also derive live entitlement from{" "}
        <code>subscription.items</code> vs create-path catalog monthly Prices (
        <code>deriveLiveRecurringEntitlementFromPriceIds</code>): require{" "}
        <code>hasCatalogRecurring</code> before clear, then{" "}
        <code>syncOrdersRecurringEntitlementByCustomer</code> (tier +{" "}
        <code>commerceAddon</code>); active foreign-Price subscriptions pause
        instead of clearing. Marketing packs, client voice
        packs, and commerce catalogs require an uncanceled recurring order;{" "}
        <code>bestMarketingOrderTier</code> also ignores paused/canceled Complete
        rows when picking Growth vs Complete package tier (same{" "}
        <code>!recurringCanceledAt</code> predicate as{" "}
        <code>leadEligibleForMarketingPack</code> — a canceled Complete must not
        outrank an still-active Growth).{" "}
        <code>stage=paid|live</code> and Billing Portal eligibility stay so
        invoices/resubscribe and Starter-upsell mutual exclusion remain correct.
        Paused/canceled MRR customers (paid|live with{" "}
        <code>recurringCanceledAt</code> and no still-active recurring order)
        surface on pipeline-health + the daily digest via{" "}
        <code>listRecurringEntitlementPaused</code> so operators can chase{" "}
        <strong>Manage billing</strong> / Billing Portal recovery — they otherwise
        silently drop out of packs-due / catalog panels. After CRM pause/cancel,
        preview + <code>saveCommerceCatalogAction</code> already hide the catalog
        via <code>leadEligibleForCommerceCatalog</code>;{" "}
        <code>POST /api/commerce/checkout</code> and{" "}
        <code>syncCommerceCatalogToStripeAction</code> must use the same predicate
        (lead + <code>listOrdersByLeadSlug</code>) before minting Sessions or
        refreshing Stripe Prices — catalog row + <code>stripePriceId</code> alone
        is not enough (create-path returns <code>403</code>; sync returns{" "}
        <code>success: false</code>). The{" "}
        <code>commerce_sku</code> webhook branch must use that same predicate
        before <code>insertCommerceOrder</code> / inquiry / client receipt —
        Dashboard-minted or pre-pause Sessions must not ledger pass-through
        revenue after CRM pause (missing lead or ineligible skips like unknown
        sku; session already <code>markComplete</code>).{" "}
        <code>sendCommerceCheckoutRecoveryAction</code> and the Buy now due
        queues (<code>listCommerceAbandonedCheckoutsDue</code> / digest /
        pipeline-health via <code>leadSlugsEligibleForCommerceAbandonedRecovery</code>)
        must use that same predicate — open carts for paused/canceled Commerce
        leads must not surface as recovery debt while create-path returns{" "}
        <code>403</code> and the webhook skips.{" "}
        <code>listCommerceAbandonedCheckoutsDue</code>&apos;s{" "}
        <code>eligibleLeadSlugs</code> arg is required at the type level (empty
        set fails closed) so a future caller cannot omit the filter and reopen
        allow-all recovery debt. Helpers that call those entitlement predicates
        (<code>leadEligibleForMarketingPackDelivery</code>,{" "}
        <code>leadEligibleForClientVoicePackDelivery</code>,{" "}
        <code>listCommerceCatalogsUnsynced</code>) must type their{" "}
        <code>orders</code> args with <code>recurringCanceledAt?</code> too —
        structural omit of the CRM pause field is the same silent-reopen class
        as an optional entitlement Set. Dashboard action glue for Generate /
        Email pack, Generate / Email voice, Save catalog, and Send pack to
        Buffer (<code>scheduleMarketingPackToBufferAction</code>) has
        action-level Vitest proving <code>recurringCanceledAt</code> fails
        closed before LLM generate, pack persist, client email, catalog
        upsert, or Buffer post (lib predicates alone do not lock
        orchestration).{" "}
        <code>loadCheckoutSuccessSession</code> mirrors the paid gate so
        /checkout/success does not show Payment received before funds clear. Receipt HTML escapes the tier label via{" "}
        <code>escapeHtmlForEmail</code> and prefers the catalog display name. The{" "}
        <code>orders</code> insert is idempotent on{" "}
        <code>stripeSessionId</code> (UNIQUE index in SQLite, existing-row check in Convex) — a
        redelivered <code>checkout.session.completed</code> (Stripe retries on timeout) is detected
        and receipt/DNS emails are recovered only when deploy-handoff notes lack a sent-marker for
        that session (<code>planBundleWebhookSideEffects</code> — twin of Commerce{" "}
        <code>planCommerceWebhookSideEffects</code>) — but{" "}
        <code>enqueueProductionHandoff</code> still runs on every delivery (idempotent on slug +
        stripeSessionId) so a first-delivery crash after the order insert cannot permanently skip
        Phase 5 fulfillment. The receipt/DNS sent-marker is written only after the send resolves{" "}
        <code>{"{ success: true }"}</code> — <code>sendReceiptEmail</code>/<code>sendEmail</code> never
        throw (a suppression-list hit or Resend failure resolves{" "}
        <code>{"{ success: false }"}</code> instead), so a marker write gated only on the{" "}
        <code>await</code> not rejecting would mark a suppressed or failed send &ldquo;sent&rdquo;
        forever and permanently defeat the redelivery-recovery path above. After each successful
        buyer email, the webhook appends a durable handoff note embedding the session id;
        marker-write failures or transactional email send failures return <code>500</code> so
        Stripe retries the missing email while the existing per-email marker keeps successful
        sibling sends from duplicating. If required fulfillment
        writes fail (
        <code>recordLeadPayment</code> / handoff enqueue, or commerce{" "}
        <code>insertCommerceOrder</code>), the webhook returns <code>500</code> so Stripe retries —
        never ACK <code>200</code> after swallowing those errors. When{" "}
        <code>NEXT_PUBLIC_CONVEX_URL</code> is set, those same webhook writes pass{" "}
        <code>requireConvex</code> (<code>src/lib/payments/convex-primary.ts</code>) so a Convex
        mutation failure does not silently fall back to instance-local SQLite — dashboard/other
        instances read Convex-first and would never see the payment. Operator CRM paths keep the
        Convex→SQLite fallback. The same <code>requireConvex</code> policy applies to visitor
        contact-form inserts (<code>CONTACT_FORM_CONVEX_PRIMARY</code> on{" "}
        <code>POST /api/contact/[slug]</code>), public unsubscribe (
        <code>UNSUBSCRIBE_CONVEX_PRIMARY</code>), and the preview-open beacon (
        <code>PREVIEW_OPEN_CONVEX_PRIMARY</code> on <code>POST /api/preview/[slug]/open</code>) —
        persist-required / fail-closed Convex avoids claiming success after a SQLite-only write
        other instances cannot see. Optional beacon <code>body.openedAt</code> is bounded via{" "}
        <code>resolvePreviewOpenedAt</code> / <code>MAX_PREVIEW_OPENED_AT_LENGTH</code> (64) —
        over-long / unparseable values fall back to server now so <code>Date.parse</code> never
        sees multi-KB probes. Optional attribution query params <code>src</code> /{" "}
        <code>utm_source</code> are bounded via <code>resolvePreviewOpenAttrParam</code> /{" "}
        <code>MAX_PREVIEW_OPEN_ATTR_PARAM_LENGTH</code> (32) — over-long values are treated as
        missing so <code>shouldRecordPreviewOpen</code> never sees multi-KB probes (path slug
        length stays a hard-reject twin). The sold SSR <code>/preview/[slug]</code> page applies
        the same bound before <code>PreviewOpenBeacon</code>, and{" "}
        <code>buildPreviewOpenBeaconPath</code> omits over-long attrs from the client fetch URL
        (trackByStage must not re-emit multi-KB query strings).         Raw JSON POST bodies on public
        money / contact / preview-open routes (and auth-gated{" "}
        <code>/api/marketing/generate</code> when the operator password may be unset) are
        hard-capped at <code>MAX_PUBLIC_JSON_BODY_BYTES</code> (32 KiB) via{" "}
        <code>readJsonBodyWithByteLimit</code> / <code>contentLengthExceedsLimit</code> (
        <code>src/lib/security/json-body.ts</code>) before <code>JSON.parse</code> — field-level
        caps alone still allocate unbounded <code>request.json()</code>. Contact
        form-urlencoded / multipart posts share the same ceiling via{" "}
        <code>readFormBodyWithByteLimit</code> / <code>MAX_PUBLIC_REQUEST_BODY_BYTES</code>{" "}
        (arrayBuffer bound, not Content-Length alone — missing or understated headers must
        still fail closed). The Stripe webhook stays on signed <code>request.text()</code>.
        Route-level Vitest in{" "}
        <code>src/app/api/contact/[slug]/route.test.ts</code> locks contact-form orchestration
        (<code>CONTACT_FORM_CONVEX_PRIMARY</code> pass-through, persist-required 503, notify only
        after a durable inquiry row, <code>notifySent</code> from inspecting{" "}
        <code>sendEmail</code>&apos;s <code>{"{ success }"}</code> shape — not just the throw path —
        validation, an optional <code>replyTo</code> (the visitor&apos;s own submitted email,
        validated by <code>sanitizeReplyToEmail</code> before being sent to Resend as a raw{" "}
        <code>reply_to</code> header — an unvalidated value would be a header-injection vector,
        the same reasoning as <code>sanitizeEmailSubject</code>&apos;s CR/LF strip) so hitting{" "}
        <strong>Reply</strong> on the sold notify email routes back to the customer instead of the
        platform&apos;s own <code>EMAIL_FROM</code>, soft-capped visitor fields via{" "}
        <code>normalizeContactFormFields</code> / <code>MAX_CONTACT_*</code> so the sold notify
        HTML cannot exceed the CRM row bounds, and{" "}
        <strong>known-lead gate</strong>: CRM <code>getLeadBySlug</code> or curated{" "}
        <code>DEMO_LEADS</code> before persist/notify — inventable/slug-inferred tokens return{" "}
        <code>404 unknown_lead</code> so skipSuppression cannot spam{" "}
        <code>brand.supportEmail</code>; path slug length hard-rejects over{" "}
        <code>MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH</code> (120, shared with preview-open{" "}
        <em>and</em> the sold SSR <code>/preview/[slug]</code> page via{" "}
        <code>loadPreviewPageLead</code> / <code>isPublicLeadSlugPathLengthOk</code>) before
        CRM/demo lookup — charset-only validation is not a size bound; the page twin
        previously minted a synthetic lead for multi-KB paths and still rendered JSON-LD)
        beyond{" "}
        <code>contact-persist.test.ts</code> helpers, and{" "}
        <code>src/app/api/unsubscribe/route.test.ts</code> locks the CAN-SPAM suppress twin
        (missing-email 400, over-long email 400 before HMAC,{" "}
        <code>UNSUBSCRIBE_CONVEX_PRIMARY</code> pass-through, the
        <code>ConvexPrimaryWriteError</code>-vs-generic-error <code>500</code> branches, and
        the client-IP rate-limit <code>429</code>) — same
        pattern as preview-open and the Stripe route suites. Matches the same idempotency
        guarantee already required for{" "}
        <code>checkout_sessions</code> and <code>commerce_orders</code>. Operator bootstrap: set{" "}
        <code>ALLOW_STRIPE_BOOTSTRAP=1</code>, then either click <strong>Run bootstrap</strong> on
        the checkout-blocked banner (
        <code>bootstrapStripePricesAction</code> /{" "}
        <code>assessStripeBootstrapGate</code> in <code>src/lib/pricing/bootstrap-gate.ts</code>)
        or <code>POST /api/stripe/bootstrap-prices</code> — both require an authenticated operator
        session (<code>requireOperatorAuth</code>, when{" "}
        <code>OPERATOR_DASHBOARD_PASSWORD</code> is set) before the{" "}
        <code>ALLOW_STRIPE_BOOTSTRAP</code> gate, then create Products/Prices and return an{" "}
        <code>envSnippet</code> to paste — the API route used to skip that auth check even though
        its dashboard-action twin always required it, letting anyone who knew the (documented)
        route path trigger live Stripe object creation during an operator&rsquo;s bootstrap
        window; fixed so both paths share the same gate.{" "}
        <code>bootstrapStripePrices</code>&apos; metadata-keyed list-then-create lookup (
        <code>findProductByKey</code> / <code>findMatchingPrice</code>) is the same check-then-act
        race as the Commerce catalog Sync-to-Stripe and Stripe Connect Express scaffolds above (an
        operator double-clicking <strong>Run bootstrap</strong>, two open dashboard tabs, or a
        retried <code>POST /api/stripe/bootstrap-prices</code> request can each see no existing
        Product/Price and both create one) — each <code>products.create</code> and{" "}
        <code>prices.create</code> call carries the same class of stable per-spec{" "}
        <code>Idempotency-Key</code> (
        <code>local_​site_​studio_&#123;key&#125;_product</code> /{" "}
        <code>..._price_&#123;unitAmount&#125;</code>, e.g. <code>starter_setup</code>) so Stripe
        itself collapses a genuinely concurrent pair of create calls to a single Product/Price
        rather than minting a permanently orphaned duplicate — the third instance of this exact
        fix in this codebase, see <code>commerce-catalog-sync-idempotency-key</code> and{" "}
        <code>stripe-connect-account-create-idempotency-key</code> in the{" "}
        <DocLink href="/docs/process">process log</DocLink>. Route-level Vitest in{" "}
        <code>src/app/api/stripe/bootstrap-prices/route.test.ts</code> plus{" "}
        <code>bootstrap-gate.test.ts</code> lock operator-auth rejection (401), the opt-in{" "}
        <code>ALLOW_STRIPE_BOOTSTRAP</code> gate (403), missing <code>STRIPE_SECRET_KEY</code>{" "}
        (501), success <code>envSnippet</code> shape, and 502 on Stripe throw;{" "}
        <code>src/app/dashboard/actions.test.ts</code> locks the same contracts on{" "}
        <code>bootstrapStripePricesAction</code> (auth rejection + gate + success + throw) — the
        lib helper suite alone does not cover that route/action glue. Multi-return dashboard
        actions and send helpers (<code>updateLeadStageAction</code>,{" "}
        <code>importLeadsCsvAction</code>, <code>bootstrapStripePricesAction</code>,{" "}
        <code>sendEmail</code>, <code>sendOperatorDailyDigest</code>) keep{" "}
        <code>success: true/false as const</code> on every return so TypeScript discriminated
        unions actually narrow at call sites — merge folds that touch those files must re-check
        the literals (PR #231 silently re-widened three actions by taking a pre-fix side). Display USD amounts and Stripe Price env var
        names live in <code>src/lib/pricing/bundles.ts</code> (direct Vitest in{" "}
        <code>bundles.test.ts</code>) — readiness/bootstrap suites import those constants but do
        not lock sold prices or <code>getBundle</code>. Remaining for first paid order: set core
        Stripe secrets (<code>STRIPE_SECRET_KEY</code>, <code>STRIPE_WEBHOOK_SECRET</code> — amber
        banner via <code>assessStripeCoreEnvReadiness</code>) and paste Price ID env vars from the
        snippet — until then{" "}
        <code>assessBundlePriceEnvReadiness</code> surfaces a rose checkout-blocked banner on{" "}
        <DocLink href="/dashboard">/dashboard</DocLink> and{" "}
        <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> (env presence only; does not
        fake-complete the operator bootstrap todo). Deploy details:{" "}
        <DocLink href="/docs/production-deploy">Production deploy</DocLink>.
      </p>
      <p>
        Every Checkout Session is tracked in <code>checkout_sessions</code> (
        <code>src/lib/checkout/</code>) as <code>open</code> until the completed webhook flips it
        to <code>complete</code>. Create-path tracking (
        <code>recordCheckoutSessionCreated</code> on{" "}
        <code>POST /api/stripe/checkout</code> and <code>POST /api/commerce/checkout</code>)
        passes <code>requireConvex</code> (
        <code>CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY</code>) when Convex is configured — a
        Convex failure returns <code>502</code> instead of handing the buyer a Checkout URL
        after a SQLite-only write that Convex-first abandoned-recovery queues would never see.
        Both create routes soft-cap optional <code>customerEmail</code> via shared{" "}
        <code>normalizeCheckoutCustomerEmail</code> (
        <code>MAX_CONTACT_EMAIL_LENGTH</code>) before Stripe session create and session
        tracking — rate limits blunt request count, not payload size. The sold SSR{" "}
        <code>/checkout?slug=</code> page bounds optional query slug length via{" "}
        <code>loadCheckoutPrefillLead</code> / <code>resolveCheckoutPrefillSlug</code> (
        same <code>MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH</code>=120 as contact / preview-open /{" "}
        <code>/preview/[slug]</code>) — over-long is treated as missing (un-prefilling
        checkout) so a multi-KB probe cannot burn <code>getLeadBySlug</code> or strand a
        buyer; Vitest in <code>src/lib/checkout/prefill-slug.test.ts</code>. Mark-complete on
        the webhook already used the same fail-closed policy. Homepage /
        pricing CTAs that omit a lead slug mint a stable{" "}
        <code>organic-*</code> attribution slug at session create (
        <code>resolveBundleCheckoutLeadSlug</code>) so webhook fulfillment, payment stubs, and
        deploy handoffs still run after Stripe collects money — empty{" "}
        <code>metadata.slug</code> previously skipped the entire paid path.{" "}
        <code>resolveBundleCheckoutLeadSlug</code> also sanitizes an explicit client-supplied
        slug via shared <code>sanitizeLeadSlug</code> (<code>src/lib/leads/slug.ts</code> —
        same helper as <code>addLeadAction</code> / CSV explicit-slug column; collapses
        non-token runs and strips leading/trailing dashes so the CRM slug matches{" "}
        <code>leadSlugAsDnsLabel</code> / preview-subdomain Host lookup) before it can be
        persisted by the webhook as a brand-new paid lead — an unsanitized slug containing a{" "}
        <code>..</code> segment would otherwise flow into{" "}
        <code>suggestedHost</code> / <code>previewUrl</code> (
        <code>src/lib/deploy/handoff.ts</code>) and <code>proxy.ts</code>&apos;s
        preview-subdomain rewrite, where URL path normalization collapses a traversal segment
        out of the intended single-path-segment slug — the same bug class{" "}
        <code>safeNextPath</code> now rejects on the login-redirect surface, just reachable via
        an unauthenticated paid Checkout Session instead of the login page&apos;s{" "}
        <code>next</code> query param. Create-path sanitize does not rewrite legacy
        rows: every path-construction use-site (preview absolute URLs, outreach
        email links, deploy handoff <code>previewUrl</code>/<code>contactFormUrl</code>,
        proxy rewrites, sitemap, Stripe cancel URLs, dashboard preview links) goes
        through <code>src/lib/leads/slug-path.ts</code> (
        <code>encodeLeadSlugPathSegment</code> / <code>leadPreviewPath</code> /
        <code>leadPreviewAbsoluteUrl</code>) so a free-form slug stays a single
        path segment. Hostnames cannot percent-encode, so handoff{" "}
        <code>suggestedHost</code> uses <code>leadSlugAsDnsLabel</code> instead —
        and create-paths must already strip edge dashes <em>and</em> cap at 63
        characters (RFC 1035 DNS label max, <code>MAX_LEAD_SLUG_LENGTH</code>) so
        the stored slug equals that DNS label
        (create-path-slug-edge-dash-normalize + create-path-slug-dns-label-max-length).
        A longer businessName or operator slug is truncated (then re-stripped of
        edge dashes) rather than producing an invalid{" "}
        <code>suggestedHost</code> that Vercel/Host→preview cannot serve.
        Rows carry a{" "}
        <code>kind</code> discriminator:{" "}
        <code>bundle</code> (Local Site Studio plan checkout) or <code>commerce_sku</code> (end-customer
        Buy now). Sessions still <code>open</code> 2+ hours after creation surface on separate
        panels on <code>/dashboard/leads</code> — &quot;Abandoned checkouts&quot; for bundles and
        &quot;Abandoned Buy now&quot; for commerce — each with its own operator-triggered recovery
        email (Resend, honors suppression, cooldown between nudges). Bundle recovery links{" "}
        <code>/checkout?slug=&amp;tier=</code>; commerce recovery links{" "}
        <code>/preview/[slug]#catalog</code>. See <code>src/lib/checkout/abandoned-recovery.ts</code>.
        Operator recovery actions durable-mark <code>recoverySentAt</code> with{" "}
        <code>requireConvex</code> (<code>CHECKOUT_RECOVERY_SENT_CONVEX_PRIMARY</code>){" "}
        <em>before</em> the Resend send — a SQLite-only mark after a successful email would leave
        Convex-first due queues able to nudge again. Action-level Vitest in{" "}
        <code>src/app/dashboard/leads/checkout-recovery-actions.test.ts</code> locks auth, kind
        mismatch, missing email, mark-before-send order, and{" "}
        <code>ConvexPrimaryWriteError</code> skip-send —{" "}
        <code>session-persist.test.ts</code> / <code>abandoned-recovery.test.ts</code> alone do
        not cover that glue. Only <code>kind=bundle</code> open sessions feed <code>scoreLead</code> / Work next (+18
        abandoned, +6 when recovery is due). Pipeline health aggregates bundle abandoned-cart +
        recovery-due counts beside paid-not-live, plus separate Buy now cart counts.
      </p>
      <p>
        Recovery copy escalates across repeat nudges instead of resending the same email
        (recovery-email-escalating-cadence): every <code>checkoutSessions</code> row also carries a{" "}
        <code>recoverySentCount</code> (incremented atomically alongside{" "}
        <code>recoverySentAt</code> by <code>recordRecoverySent</code>/
        <code>sqliteRecordCheckoutRecoverySent</code> on both backends). The dashboard action
        passes <code>recoverySentCount + 1</code> as a <code>nudgeNumber</code> into{" "}
        <code>sendCheckoutAbandonedRecovery</code>/<code>sendCommerceAbandonedRecovery</code>,
        which pick one of three copy tiers (mirroring the outreach Email 1/2/3 cadence): the first
        nudge keeps the original reassurance framing, the second answers the most common
        objection (quick to finish, no sales call, reply if something&apos;s unclear), and the
        third+ is a final soft close — nudge 4 and beyond stay on the tier-3 copy rather than
        growing new variants indefinitely, since an operator can re-click past the{" "}
        <code>RECOVERY_COOLDOWN_DAYS</code> window as many times as they want. The &quot;last
        nudged&quot; line on both dashboard panels shows the nudge number (e.g. &quot;(#2)&quot;) so
        an operator can see which tier is about to go out before clicking again.
      </p>
      <p>
        Growth/Complete/Commerce subscribers manage cards, invoices, and cancellation via Stripe
        Billing Portal: <code>POST /api/stripe/billing-portal</code> (post-checkout{" "}
        <code>sessionId</code>) and the operator <strong>Billing</strong> action on paid/live
        leads. The session-id path (<code>createBillingPortalForCheckoutSession</code>) requires{" "}
        <code>status === &quot;complete&quot;</code> and{" "}
        <code>payment_status === &quot;paid&quot;</code> (
        <code>isStripeCheckoutSessionPaid</code> — same gate as webhook fulfillment and{" "}
        <code>loadCheckoutSuccessSession</code>; async ACH can leave complete+unpaid, and a
        client-supplied <code>sessionId</code> must not open Manage billing before funds clear).
        Subscription mode must also prove a create-path catalog recurring Price ID
        (Growth/Complete/Commerce monthly env) on Checkout <code>listLineItems</code> via{" "}
        <code>sessionLineItemsIncludeCatalogRecurringPrice</code> —{" "}
        <code>mode === &quot;subscription&quot;</code> alone is not enough (a Dashboard-minted
        subscription with a foreign Price must not open Manage billing; list failures return
        502). When mode is <code>payment</code> it derives <code>commerceAddon</code> from the
        same line items via <code>resolveCommerceAddonFromLineItems</code> — never from{" "}
        <code>metadata.commerceAddon</code> alone (a forged flag must not open Manage billing
        without the Commerce Prices on the charge).{" "}
        <code>loadCheckoutSuccessSession</code> uses the same subscription catalog-recurring +
        payment commerceAddon derives before showing the Manage billing CTA (list failures fail
        closed to hide the button — UI must not advertise a portal open the API would reject).
        Payment mode also ignores <code>metadata.tier</code> — create path never emits payment +
        Growth/Complete (<code>hasRecurring</code> → subscription), so trusting tier would only
        help Dashboard-minted sessions; eligibility uses shared{" "}
        <code>checkoutSessionEligibleForBillingPortal</code> (
        <code>catalogRecurringProven</code> for subscription). The operator Manage billing path (
        <code>createBillingPortalForLead</code>) uses CRM{" "}
        <code>orderEligibleForBillingPortal</code> / <code>latestEligibleOrder</code> only as a
        fast filter — it requires <code>stripeSessionId</code> and reuses{" "}
        <code>createBillingPortalForCheckoutSession</code> so a stale or forged CRM{" "}
        <code>tier</code> / <code>commerceAddon</code> / <code>stripeCustomerId</code> cannot mint
        a portal while the Session path would 400 (Session customer preferred over stored CRM id).{" "}
        <code>listOrders</code> returns newest-first on both backends (
        <code>convex/orders.list</code> sorts by <code>createdAt</code> desc at the source,
        plus <code>sortOrdersNewestFirst</code> in <code>db.ts</code> as belt-and-suspenders)
        so <code>latestEligibleOrder</code> picks the newest CRM-eligible row before Session
        re-proof. When checkout completes for a slug with no CRM lead yet,{" "}
        <code>recordLeadPayment</code> / Convex <code>markLeadPaid</code> insert a paid{" "}
        <code>payment_stub</code> lead (<code>buildPaymentStubLeadFields</code>) so revenue and
        paid-not-live stay aligned. Activate Customer Portal in the Stripe Dashboard before first
        live use (see <DocLink href="/docs/launch-checklist">Launch checklist</DocLink>). Route-level
        Vitest coverage in <code>src/app/api/stripe/billing-portal/route.test.ts</code> locks body
        parsing, the <code>STRIPE_SECRET_KEY</code> gate, <code>returnUrl</code> derivation
        (explicit body value, then <code>resolveStripeRedirectAppUrl</code>:{" "}
        <code>NEXT_PUBLIC_APP_URL</code> &gt; <code>VERCEL_URL</code> &gt; localhost — never the
        request origin), and the client-IP rate-limit <code>429</code> — the fourth and final
        Stripe-facing route (alongside checkout, commerce/checkout, and webhook) to get direct
        orchestration tests rather than relying only on its extracted helper&apos;s suite. Being
        public and keyed only by a client-supplied <code>sessionId</code>, it is rate-limited by
        client IP via <code>checkRateLimit</code> (same helper as contact / checkout / commerce
        checkout / unsubscribe / preview-open) so scripted <code>sessionId</code> probing cannot
        burn Stripe API quota unbounded. The route also hard-rejects{" "}
        <code>sessionId</code> longer than{" "}
        <code>MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH</code> (
        <code>parseCheckoutSessionId</code> in <code>src/lib/billing/checkout-session-id.ts</code>)
        before any Stripe call — rate limits blunt request count, not payload size, and soft-capping
        an opaque id would only waste a retrieve on a guaranteed miss. The same{" "}
        <code>parseCheckoutSessionId</code> gate also protects{" "}
        <code>GET /checkout/success?session_id=</code> (
        <code>loadCheckoutSuccessSession</code> in <code>src/lib/checkout/success-session.ts</code>) —
        billing-portal alone left the post-payment confirmation page as an uncapped twin that
        still called <code>stripe.checkout.sessions.retrieve</code> on multi-KB query garbage;
        over-long / missing ids render the unconfirmed UI without touching Stripe. Because a completed{" "}
        <code>sessionId</code> is not truly
        secret either (it leaks via redirect URLs, the <code>Referer</code> header, and browser
        history), an explicit body <code>returnUrl</code> is only honored when it is same-origin
        with the derived <code>appUrl</code> <em>and</em> within{" "}
        <code>MAX_BILLING_PORTAL_RETURN_URL_LENGTH</code> (
        <code>isAcceptableBillingPortalReturnUrl</code> in{" "}
        <code>src/lib/billing/return-url.ts</code>) — otherwise the route falls back to the
        derived default rather than handing Stripe an attacker-controlled or multi-KB{" "}
        <code>return_url</code>, which would otherwise let a genuine{" "}
        <code>billing.stripe.com</code> URL redirect to a phishing page on exit (or burn Stripe
        quota on an unbounded optional body field). Over-length gets the same fall-back as
        cross-origin/malformed — hard-reject would strand a legitimate portal open over an
        optional field; soft-cap would change the redirect destination. That comparison
        origin itself must never come from <code>request.url</code> / Host: when{" "}
        <code>NEXT_PUBLIC_APP_URL</code> was unset, the old{" "}
        <code>new URL(request.url).origin</code> fallback let a Host-spoofed request make{" "}
        <code>isSameOriginReturnUrl</code> pass an attacker returnUrl (and let Checkout{" "}
        <code>success_url</code> / <code>cancel_url</code> land post-payment on an attacker
        origin). All three public Stripe money routes plus{" "}
        <code>openBillingPortalAction</code> now share <code>resolveStripeRedirectAppUrl</code>{" "}
        for that reason. The operator <strong>Billing</strong> button path
        (<code>openBillingPortalAction</code>) has its own action-level Vitest in{" "}
        <code>open-billing-portal-action.test.ts</code> — auth, secret gate, returnUrl
        (APP_URL / VERCEL_URL / localhost → <code>/dashboard/leads</code>, Host ignored), and
        helper success/error passthrough — so dashboard glue is not left to the route or
        create-portal-session suites alone. <strong>Send daily digest</strong>{" "}
        (<code>sendDailyDigestAction</code>) still derives its operator-facing base URL via{" "}
        <code>resolveTrustedAppUrl</code> (<code>src/lib/security/app-url.ts</code>): when{" "}
        <code>NEXT_PUBLIC_APP_URL</code> is unset, the <code>x-forwarded-host</code>/
        <code>host</code> + <code>x-forwarded-proto</code> request headers are validated as a
        host-only <code>http</code>/<code>https</code> origin via{" "}
        <code>tryHeaderDerivedAppOrigin</code> — not merely as something <code>new URL()</code>{" "}
        accepts. Non-http(s) schemes (<code>javascript:</code>, <code>data:</code>), host values
        that smuggle path/userinfo/query/hash, and malformed/injection hosts all fall back to
        the documented <code>http://localhost:3000</code> default rather than landing in an
        outbound email href. Money redirects deliberately do <em>not</em> use that header path.
        The daily digest additionally escapes that base URL via <code>escapeHtmlForEmail</code>{" "}
        before interpolating it into the <strong>Open the dashboard</strong> link, closing the
        last unescaped dynamic value in the digest&apos;s outbound HTML. Direct Vitest in{" "}
        <code>src/lib/security/app-url.test.ts</code> locks both resolvers (env precedence,
        forwarded-host derivation for digest, Stripe-redirect env-only contract, localhost
        fallback, and rejection of malformed/injection/non-http(s)/path-smuggling host values);{" "}
        <code>send-daily-digest-action.test.ts</code> and{" "}
        <code>open-billing-portal-action.test.ts</code> each lock the rejection at the
        action-glue level.
      </p>
      <p>
        Paid Starter customers (one-time ${getBundle("starter")!.setupPriceUsd}, no
        Growth/Complete/Commerce order yet) get an
        operator-triggered <strong>Upsell</strong> email from{" "}
        <code>/dashboard/leads</code> — eligibility is the inverse of billing-portal eligibility
        (<code>src/lib/billing/starter-upsell.ts</code>). The operator{" "}
        <code>sendStarterUpsellAction</code> path has its own action-level Vitest in{" "}
        <code>send-starter-upsell-action.test.ts</code> — auth, eligibility (Starter-only +
        email; rejects Growth/Complete/Commerce), Growth vs Complete target tier, suppression /
        Resend failure (no revalidate), and leadSlug order filtering — so dashboard glue is not
        left to the helper suite alone. The email previews the marketing add-on and links to{" "}
        <code>/checkout?slug=…&amp;tier=growth|complete</code> (Complete when the lead&apos;s{" "}
        <code>recommendedTier</code> is Complete; otherwise Growth). Billing and Upsell never
        both appear for the same order set.
      </p>

      <h2 id="production-deploy">6b. Production deploy (after paid)</h2>
      <p>
        Handoff records live in SQLite (<code>deploy_handoffs</code>) with Convex{" "}
        <code>deployHandoffs</code> when <code>NEXT_PUBLIC_CONVEX_URL</code> is set — reads
        (<code>getLeadSlugByCustomDomain</code>, <code>listDeployHandoffs</code>) use the same
        Convex-first, SQLite-fallback pattern as leads/orders/suppressions (explicit{" "}
        <code>handoffId</code> column round-trips as <code>id</code>). The three operator
        writes — <strong>Mark live</strong>, <strong>Assign Vercel project</strong>, and{" "}
        <strong>Assign custom domain</strong> — pass <code>requireConvex</code> (
        <code>DEPLOY_HANDOFF_CONVEX_PRIMARY</code>) when Convex is configured, so a
        mutation failure surfaces as an operator retry message instead of a SQLite-only success
        that other instances (reading Convex-first) would never see. Action-level Vitest in{" "}
        <code>mark-handoff-live-action.test.ts</code> locks the Mark live dashboard glue (auth,
        empty slug, no-handoff, requireConvex fail-closed, success revalidate);{" "}
        <code>assign-vercel-project-action.test.ts</code> locks Assign Vercel project (auth,
        empty slug, trim/clear project id, no-handoff, requireConvex fail-closed, success
        revalidate); <code>assign-custom-domain-action.test.ts</code> locks Save domain —
        all beside handoff helpers. Save domain input is normalized to a bare hostname via{" "}
        <code>parseOperatorCustomDomain</code> /{" "}
        <code>normalizeOperatorCustomDomainHost</code> (strip scheme, path, port, trailing
        FQDN dot; reject localhost/single-label/platform-owned hosts) so a pasted{" "}
        <code>https://client.com/</code> matches <code>normalizeRequestHost</code> on inbound
        Host and Vercel Domains API <code>name</code> — write paths in{" "}
        <code>updateDeployHandoffCustomDomain</code> re-normalize for defense-in-depth; the
        action also rejects when another lead already owns that domain (Host→preview
        first-match would otherwise serve the wrong client).{" "}
        <code>customDomainHostAliases</code> treats www↔apex as the same sold domain
        for Host→preview lookup, uniqueness, and Vercel Domains API registration
        (exact host stored; twin registered / matched) so Save{" "}
        <code>www.client.com</code> still serves Host <code>client.com</code> and
        two leads cannot split www vs apex.
        Suggested host{" "}
        <code>{"{slug}.domain"}</code>, contact form at <code>/api/contact/[slug]</code>{" "}
        (persist <code>client_inquiries</code> required for <code>200</code>; with Convex
        configured, <code>requireConvex</code> so SQLite-only success cannot hide the row;
        email notify best-effort after with escaped HTML; <code>503</code> if the inbox write
        fails), optional Vercel Domains
        API. When a later bundle checkout (upsell / re-purchase) rebuilds the handoff for a
        new <code>stripeSessionId</code>,{" "}
        <code>preserveDeployHandoffOperatorFields</code> keeps any operator-set{" "}
        <code>customDomain</code> / <code>vercelProjectId</code>, plus progressed{" "}
        <code>live</code>/<code>provisioned</code> status and the notes audit trail, so
        Host→preview routing, Mark live progress, and dedicated-project Domains API
        targeting are not wiped on upsell rebuild (same class as{" "}
        <code>preserveCommerceStripeIds</code>). Re-provisioning must not downgrade{" "}
        <code>live</code> → <code>provisioned</code>. After{" "}
        <code>tryProvisionVercelDomain</code> (a real Vercel network call),{" "}
        <code>assignCustomDomainAndProvision</code> /{" "}
        <code>assignVercelProjectAndProvision</code> /{" "}
        <code>enqueueProductionHandoff</code> re-read the handoff and{" "}
        <code>mergeProvisionOntoFreshHandoff</code> before the final full-row upsert —
        same TOCTOU class as commerce catalog sync / orphan archive — so a concurrent
        Mark live during the Vercel window is not silently reverted. Bundle webhook
        receipt/DNS sent-markers append notes via{" "}
        <code>updateDeployHandoffStatus</code> after Resend; that write uses{" "}
        <code>preferAdvancedHandoffStatus</code> (never-downgrade:{" "}
        <code>live</code> &gt; <code>provisioned</code> &gt; <code>awaiting_dns</code>)
        so a pre-Resend status snapshot cannot undo a concurrent Mark live.{" "}
        <code>markHandoffLive</code> only advances the lead stage when{" "}
        <code>updateDeployHandoffStatus</code> returns a row — a null write
        (handoff vanished between the initial get and the status mutation) must
        not leave stage=<code>live</code> while the operator still sees &quot;No
        deploy handoff found&quot;. Dashboard preview cache invalidation uses{" "}
        <code>leadPreviewPath</code> (encode-at-use), not a raw{" "}
        <code>{`/preview/\${slug}`}</code> string.
        Operators confirm DNS then mark the lead <code>live</code>. Inquiry inbox on{" "}
        <code>/dashboard/leads</code> supports operator reply (Resend + suppression → status{" "}
        <code>replied</code> with stored body). When Convex is configured, reply + status
        marks pass <code>requireConvex</code> (<code>INQUIRY_REPLY_CONVEX_PRIMARY</code>) and
        Reply durably marks <code>replied</code> before Resend (persist-then-notify) so
        unreplied metrics on other instances cannot miss a successful reply or risk a
        unreplied metrics on other instances cannot miss a successful reply or risk a
        duplicate send. The operator <code>replyToInquiryAction</code> path has its own
        action-level Vitest in <code>reply-to-inquiry-action.test.ts</code> — auth, body /
        archived / no-email gates, mark-before-Resend, email trim, ConvexPrimaryWriteError
        skip-send, null-mark not-found, and suppression / Resend failure after a durable mark —
        so dashboard glue is not left to the reply-persist / reply.ts helper suites alone.
        Mark-read (composer open) and Archive use the same{" "}
        <code>INQUIRY_REPLY_CONVEX_PRIMARY</code> surface via{" "}
        <code>updateInquiryStatusAction</code>, locked by{" "}
        <code>update-inquiry-status-action.test.ts</code> (auth, invalid status,
        requireConvex fail-closed, null not-found, success revalidate) so status-only
        glue is not left to the Reply action suite alone. The dashboard stage dropdown
        (<code>updateLeadStageAction</code>) looks up the lead by slug first — an unknown
        slug returns <code>Lead not found</code> before any write, matching every sibling
        action in this file, instead of the SQLite fallback&apos;s{" "}
        <code>UPDATE ... WHERE slug = ?</code> silently matching zero rows and returning{" "}
        <code>success: true</code> for a no-op — then passes{" "}
        <code>LEAD_STAGE_CONVEX_PRIMARY</code> and, on <code>outreach_sent</code>, marks
        Email 1 before Resend and surfaces <code>!sent.success</code> (suppression / Resend
        resolve, not only throws). A move to <code>discovery_call</code> (a real dropdown
        transition that can skip <code>outreach_sent</code> entirely) also records cadence
        step 1 via the same <code>recordLeadOutreach</code> call — without sending Email 1 —
        because <code>isFollowUpDue</code>/<code>isColdLead</code> both treat{" "}
        <code>outreach_sent</code> and <code>discovery_call</code> as valid due-queue stages
        gated on <code>outreachStep &gt;= 1</code>; a lead that reached{" "}
        <code>discovery_call</code> directly would otherwise stay permanently invisible to
        Follow-ups due / Cold leads. <code>recordLeadOutreach</code> is monotonic (never
        downgrades a lead already at step ≥ 1), so this is safe to call unconditionally — it
        no-ops for leads that already came through <code>outreach_sent</code>. Bulk CSV
        import (<code>importLeadsCsvAction</code>) mirrors the same record-without-send
        behavior for a batch whose <strong>Initial stage</strong> is set to either{" "}
        <code>outreach_sent</code> or <code>discovery_call</code> — locked by{" "}
        <code>update-lead-stage-action.test.ts</code> (auth, unknown-slug not-found before
        any write, requireConvex fail-closed, non-outreach revalidate, mark-before-Resend,
        missing-email skip, outreach-mark Convex skip-send, suppression/Resend{" "}
        <code>success:false</code>, discovery_call record-without-send) so stage glue is not
        left to stage-persist helpers alone.
        Work next snooze / Unsnooze (<code>snoozeLeadAction</code>) passes{" "}
        <code>LEAD_SNOOZE_CONVEX_PRIMARY</code> — locked by{" "}
        <code>snooze-lead-action.test.ts</code> (auth, empty slug, missing lead, invalid /
        missing preset, 1d/3d/7d + clear with requireConvex, ConvexPrimaryWriteError
        fail-closed) so park glue is not left to snooze-persist helpers alone.
        Opening the reply composer on a{" "}
        <code>new</code> inquiry auto-marks it <code>read</code> (
        <code>src/lib/inquiries/reply.ts</code> <code>inquiryShouldAutoMarkRead</code>) so
        unreplied-inquiry metrics distinguish seen-but-undrafted from untouched. Pipeline health panel aggregates order revenue, stage
        funnel counts, open handoffs, abandoned checkout / recovery-due counts, unreplied
        website inquiries (new + read, with oldest age), cold leads, currently-snoozed Work next
        parks (count + soonest return), leads due for Email 2/3 (<code>followUpsDueCount</code>{" "}
        + oldest age since last send, via <code>isFollowUpDue</code>), Growth/Complete marketing
        packs still due this UTC month (<code>marketingPacksDueCount</code> via{" "}
        <code>listMarketingPacksDue</code>), Commerce catalogs still missing (
        <code>commerceCatalogsMissingCount</code> via{" "}
        <code>listCommerceCatalogsMissing</code>), Complete leads missing a client voice FAQ pack (
        <code>clientVoicePacksDueCount</code> via <code>listClientVoicePacksDue</code>), closed
        leads outside the active funnel (
        <code>closedLeadCount</code> = <code>stageCounts.closed</code>, footnote only), and
        leads missing email (<code>src/lib/metrics/pipeline-health.ts</code>). Open handoffs
        (<code>status !== &quot;live&quot;</code>, same predicate as{" "}
        <code>openHandoffCount</code>) also list in the operator daily digest under{" "}
        <strong>Production handoffs open</strong> via <code>listDeployHandoffs</code> so paid
        DNS / Mark live debt is visible without opening the dashboard. A lead can also be moved
        to <code>stage=&quot;paid&quot;</code> (dashboard stage dropdown or CSV import) with no{" "}
        <code>deploy_handoffs</code> row ever created — that set is disjoint from open handoffs,
        so <code>paidNotLiveCount</code> was dashboard-only until the digest gained its own{" "}
        <strong>Paid, not yet live</strong> section (same <code>lead.stage === &quot;paid&quot;</code>{" "}
        predicate, direct from the <code>leads</code> the digest already loads — no new data
source). The same digest also lists email-critical leads with no usable address under{" "}
        <strong>Leads missing email</strong> (same <code>leadIsMissingCriticalEmail</code>{" "}
        predicate as <code>leadsMissingEmailCount</code> — <code>site_built</code> /{" "}
        <code>outreach_sent</code> / <code>discovery_call</code> / <code>paid</code> with empty
        or whitespace-only email) so top-of-funnel contact gaps that block Email 1 are visible
        without opening the dashboard. Every action-section header in the digest (Follow-ups due,
        Abandoned checkouts, Abandoned Buy now, Unreplied inquiries, Marketing packs due, Starter
        → MRR upsell, Commerce catalogs missing/unsynced, Complete voice packs due, Commerce
        payouts owed, Production handoffs open, Paid not yet live, Leads missing email) shows a
        true pre-slice <code>*Count</code> field on <code>DailyDigest</code>, not the capped
        display array&apos;s <code>.length</code> — each section still renders at most 5 rows, but
        the header no longer silently freezes at &quot;(5)&quot; once a queue naturally grows past
        that limit.         The digest also mirrors pipeline-health age/count fields that used to be
        dashboard-only: <code>newInquiryCount</code> +{" "}
        <code>oldestUnrepliedInquiryAgeHours</code> (Unreplied inquiries header — shows{" "}
        <code>N new</code> only when some unreplied are already <code>read</code>, plus oldest age),{" "}
        <code>oldestFollowUpDueAgeHours</code> (Follow-ups due header),{" "}
        <code>oldestAbandonedAgeHours</code> (Abandoned checkouts header),{" "}
        <code>oldestColdLeadAgeHours</code> (cold footnote), and{" "}
        <code>closedLeadCount</code> (settled-inventory footnote, same class as cold/snoozed — not
        an action section). Lead quality scoring (
        <code>src/lib/leads/quality-score.ts</code>) ranks outreach targets on the same page
        (Work next queue + Quality column). Preview opens record{" "}
        <code>lastPreviewOpenAt</code> via <code>POST /api/preview/[slug]/open</code> when
        outreach emails use <code>?src=outreach</code> (or the lead is already in outreach /
        discovery stages). When Convex is configured that beacon passes{" "}
        <code>requireConvex</code> (<code>PREVIEW_OPEN_CONVEX_PRIMARY</code>) so a mutation
        failure returns <code>503</code> instead of claiming <code>recorded:true</code> after a
        SQLite-only write that Convex-first Work next / Opened-badge readers never see.
        Operator free-text <code>notes</code> on each lead capture call
        outcomes from the dashboard row expander (not shown on client preview sites). The
        pipeline stage dropdown on{" "}
        <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> passes{" "}
        <code>requireConvex</code> (<code>LEAD_STAGE_CONVEX_PRIMARY</code>) when Convex is
        configured so a stage move cannot claim success after a SQLite-only write that leaves
        the funnel (or the <code>outreach_sent</code> + Email 1 path) desynced on other
        instances — Mark live already used the same fail-closed path via{" "}
        <code>DEPLOY_HANDOFF_CONVEX_PRIMARY</code>. Moving a
        lead to <code>discovery_call</code> or sending Email 3 auto-opens that expander with a
        soft prompt (Skip dismisses without undoing the stage/email change). When Convex is
        configured, the notes write passes <code>requireConvex</code> (
        <code>LEAD_NOTES_CONVEX_PRIMARY</code>) so Save cannot claim success after a SQLite-only
        write that other instances never see. Action-level Vitest in{" "}
        <code>update-lead-notes-action.test.ts</code> locks auth, soft-cap / clear / trim,
        requireConvex fail-closed, and success revalidate beside notes-persist helpers.
        Optional{" "}
        <code>snoozedUntil</code> parks a lead off Work next (1d/3d/7d presets) while keeping
        the quality score visible — Unsnooze clears it; when Convex is configured the write
        passes <code>requireConvex</code> (<code>LEAD_SNOOZE_CONVEX_PRIMARY</code>) so park /
        clear cannot succeed only in instance-local SQLite. Action-level Vitest in{" "}
        <code>snooze-lead-action.test.ts</code> locks that glue beside snooze-persist helpers.
        Parked count also appears on pipeline
        health and as a footnote on the operator daily digest (count + soonest return) so
        forgotten snoozes do not hide when the operator never opens the dashboard. The same
        digest also lists marketing packs due this UTC month, Starter → MRR upsell candidates,
        Commerce catalogs missing, and Complete voice packs due (action sections, reusing{" "}
        <code>listMarketingPacksDue</code> / <code>listStarterUpsellCandidates</code> /{" "}
        <code>listCommerceCatalogsMissing</code> / <code>listClientVoicePacksDue</code>
        — fed by uncapped <code>listMarketingPacksForMonth</code> /{" "}
        <code>listCommerceCatalogs</code> / <code>listClientVoicePacks</code>, not a newest-N
        page that would invent false Generate debt or hide Sync-to-Stripe debt). Marketing packs
        due, Commerce catalogs missing, Commerce Sync to Stripe due, and Complete voice packs due
        each also carry an oldest-age staleness signal (<code>oldestMarketingPacksDueAgeHours</code>{" "}
        / <code>oldestCommerceCatalogCandidateAgeHours</code> / <code>
          oldestClientVoicePacksDueAgeHours
        </code>
        , same &quot;oldest Xh&quot; hint pattern as every other due-queue) on both{" "}
        <code>PipelineHealth</code> and the daily digest — anchored to the qualifying order&apos;s{" "}
        <code>createdAt</code> for the two non-month-keyed queues (catalogs, voice packs), or to
        the later of the current UTC month&apos;s start and that order&apos;s{" "}
        <code>createdAt</code> for marketing packs specifically (
        <code>marketingMonthStartMs</code>) — a long-time Growth/Complete subscriber&apos;s age
        resets with the calendar month the pack itself is scoped to, instead of showing an
        ever-growing, non-actionable age tied to their original signup date. Starter → MRR
        upsell now carries the same &quot;oldest Xh&quot; hint on both the digest email and{" "}
        <code>PipelineHealth</code>/dashboard (
        <code>oldestStarterUpsellCandidateAgeHours</code>, widened to accept an optional{" "}
        <code>createdAt</code> so it works against both a real <code>OrderRecord[]</code> and the
        digest&apos;s lighter orders shape) — it had shipped on pipeline-health/dashboard first and
        the digest email twin was closed as a follow-up. A lead that exhausts all 3 outreach
        emails with no reply (<code>isColdLead</code> in{" "}
        <code>src/lib/email/outreach-followups.ts</code>) never becomes due again, so it is
        surfaced instead as a &quot;Cold&quot; badge on the leads table and a pipeline-health
        count/oldest-age. Operators dispose those with one click via{" "}
        <code>planColdLeadDisposition</code> / <code>disposeColdLeadAction</code>:{" "}
        <strong>Re-engage</strong> resets <code>outreachStep</code> to 0, clears{" "}
        <code>lastOutreachAt</code>, and parks the lead at <code>discovered</code> so Email 1
        fires only when stage moves to <code>outreach_sent</code> again — or, when the Cold-panel
        &quot;Also send Email 1&quot; checkbox is checked, moves straight to{" "}
        <code>outreach_sent</code> and sends Email 1 in the same action;{" "}
        <strong>Close</strong> sets the terminal <code>closed</code> stage (keeps outreach
        history, drops off Work next and cold counts). When Convex is configured, the
        disposition write itself passes <code>requireConvex</code> (
        <code>COLD_DISPOSITION_CONVEX_PRIMARY</code>) so Re-engage/Close cannot claim success
        after a SQLite-only write that leaves cold inventory looking open (or still cold) on
        other instances. Every Email 1/2/3 send is{" "}
        <em>persist-then-notify</em>: <code>recordLeadOutreach</code> durably marks{" "}
        <code>outreachStep</code>/<code>lastOutreachAt</code> before the Resend call, and when
        Convex is configured it passes <code>requireConvex</code> (
        <code>OUTREACH_CADENCE_CONVEX_PRIMARY</code>) so a mutation failure skips the send and
        surfaces a retry instead of letting a real send land unrecorded — <code>isFollowUpDue</code>{" "}
        / pipeline-health / the digest all read Convex-first, so a SQLite-only mark after a
        successful send would otherwise leave the lead looking due for the same step on another
        instance and risk a duplicate Email 2/3. A Resend failure right after a successful mark
        leaves that one step off the due queue until the operator retries from the dashboard.
        The operator <code>sendFollowUpAction</code> path has its own action-level Vitest in{" "}
        <code>send-follow-up-action.test.ts</code> — auth, stage/email gates, Email 1
        prerequisite / sequence-complete, mark-before-Resend, ConvexPrimaryWriteError
        skip-send, Email 2 vs Email 3 dispatch, and suppression / Resend failure after a
        durable mark — so dashboard glue is not left to the outreach-followups helper suite
        alone. The operator <code>disposeColdLeadAction</code> path has its own action-level
        Vitest in <code>dispose-cold-lead-action.test.ts</code> — auth, disposition / cold /
        paid / closed gates, <code>COLD_DISPOSITION_CONVEX_PRIMARY</code> Close + Re-engage
        patches, optional Email 1 mark-before-Resend, ConvexPrimaryWriteError skip-send on
        disposition and outreach mark, and suppression / Resend failure after durable marks —
        so dashboard Re-engage/Close glue is not left to the cold-archive helper suite alone.
      </p>
      <p>
        Bundle abandoned checkouts (Local Site Studio plan carts) carry an{" "}
        <code>oldestAbandonedAgeHours</code> staleness signal on <code>PipelineHealth</code>,
        the daily digest, and the dashboard MetricCard hint — but the sibling Commerce Buy now
        abandoned-cart queue (<code>kind=commerce_sku</code>) had no matching age signal
        anywhere, the one residual gap left after{" "}
        <code>due-queue-oldest-age-parity</code> closed every other due-queue.{" "}
        <code>oldestCommerceAbandonedAgeHours</code> now scans{" "}
        <code>listCommerceAbandonedCheckoutsDue</code>&apos;s output the same way{" "}
        <code>oldestAbandonedAgeHours</code> scans the bundle twin — computed independently so a
        stale bundle cart&apos;s age never leaks into the commerce-only field or vice versa —
        and is wired into <code>PipelineHealth</code>, <code>DailyDigest</code> (
        <code>Abandoned Buy now</code> section title), and the &quot;Buy now carts&quot;
        MetricCard hint.
      </p>

      <h2>7. Marketing engine (Growth + Complete)</h2>
      <p>
        Monthly packs: <code>src/lib/marketing/</code> builds an 8-post + 2-email pack via{" "}
        <code>StubMarketingGenerator</code> or <code>AnthropicMarketingGenerator</code> when{" "}
        <code>ANTHROPIC_API_KEY</code> is set (direct Vitest coverage in{" "}
        <code>generators.test.ts</code> for stub edge branches + Anthropic blank-key / HTTP /
        parse / length-mismatch fallbacks and <code>packageTier</code>;{" "}
        <code>build-request.test.ts</code> for empty services/hours defaults, growth vs
        complete <code>automationLevel</code>, and soft-capped business context via{" "}
        <code>normalizeMarketingGenerateBusiness</code>). Until the key is a non-placeholder
        secret, <code>assessAnthropicEnvReadiness</code> surfaces a teal dashboard banner so
        operators cannot mistake Stub* template packs for sold AI quality. Operators trigger{" "}
        <code>generateMarketingPackAction</code> on{" "}
        <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> for paid/live leads with a
        Growth/Complete order; packs persist one row per lead per UTC month (SQLite + Convex{" "}
        <code>marketingPacks</code>). Ad-hoc operator generation remains available at{" "}
        <code>POST /api/marketing/generate</code> (auth + client-IP rate-limit + validation +
        contentTypes ≤ monthly pack ceiling + soft-capped business context + stub-vs-LLM
        messaging covered by{" "}
        <code>src/app/api/marketing/generate/route.test.ts</code>) — prefer the
        dashboard pack action for persisted fulfillment.{" "}
        <code>businessContextFromLead</code> shares that soft-cap so operator Generate pack
        cannot bypass the public generate size policy on pre-cap CRM rows. Joined CRM hours use{" "}
        <code>formatPackBusinessHours</code> (per-segment create-path soft-cap) +{" "}
        <code>MAX_PACK_BUSINESS_HOURS_LENGTH</code> so two max weekday/weekend segments do not
        truncate away weekend hours. Action-level Vitest in{" "}
        <code>src/app/dashboard/leads/generate-marketing-pack-action.test.ts</code> locks auth,
        eligibility, <code>MARKETING_PACK_CONVEX_PRIMARY</code> persist, stub-vs-anthropic labeling,
        and <code>ConvexPrimaryWriteError</code> fail-closed — generators / monthly-pack / route
        suites alone do not cover that glue.         Both <code>parseVariantsJson</code> (Anthropic) and{" "}
        <code>StubMarketingGenerator.stubVariant</code> (default without{" "}
        <code>ANTHROPIC_API_KEY</code> + Anthropic fallback) soft-cap title / body / cta /
        per-hashtag length via shared <code>src/lib/packs/variant-fields.ts</code> before upsert
        (sold OUTPUT sink; hashtags still slice count to 8) — soft-cap so a long model response
        or create-path-max stub interpolations ship a truncated pack rather than failing generate.
        The same <code>softCapPackVariantFields</code> helper also runs on pack{" "}
        <strong>read/parse</strong> (SQLite <code>parsePackVariants</code> + Convex-primary{" "}
        <code>softCapMarketingPack</code>) and at <strong>Email pack</strong> HTML format time
        so already-stored pre-cap rows cannot bypass generate soft-caps under{" "}
        <code>skipSuppression</code>. When Convex is configured, Generate pack passes{" "}
        <code>requireConvex</code> (<code>MARKETING_PACK_CONVEX_PRIMARY</code>) so a mutation
        failure surfaces a retry instead of leaving packs-due / Email pack blind on other
        instances. <code>sendMarketingPackToClientAction</code> emails the
        pack to <code>lead.email</code> via Resend (<code>src/lib/marketing/deliver-pack.ts</code>
        ) so clients can post themselves — <code>sendMarketingPackToClientEmail</code> passes{" "}
        <code>skipSuppression: true</code> (paid Growth/Complete feature delivery, not cold
        marketing). Action-level Vitest in{" "}
        <code>src/app/dashboard/leads/send-marketing-pack-to-client-action.test.ts</code> locks
        auth, eligibility, current-month pack gate, send failure, and preview URL wiring
        (deliver-pack helpers alone do not cover that glue). Buffer auto-posting is a dormant
        scaffold (<code>src/lib/marketing/buffer.ts</code> / <code>buffer-gate.ts</code>,
        behind <code>ALLOW_MARKETING_SCHEDULING</code> + <code>BUFFER_ACCESS_TOKEN</code>,
        default off) — one operator-level Buffer access token, no per-lead OAuth; GBP/Meta
        auto-posting remains fully gated behind per-business OAuth. See{" "}
        <DocLink href="/docs/marketing-automation">Marketing automation</DocLink> and{" "}
        <DocLink href="/docs/process">process log</DocLink>.
      </p>

      <h2>8. Client AI phone (Complete)</h2>
      <p>
        FAQ/script packs: <code>src/lib/voice/</code> builds a 6-script receptionist pack via{" "}
        <code>StubClientVoiceGenerator</code> or <code>AnthropicClientVoiceGenerator</code> when{" "}
        <code>ANTHROPIC_API_KEY</code> is set (direct Vitest coverage in{" "}
        <code>src/lib/voice/generators.test.ts</code> for stub edge branches + Anthropic blank-key /
        HTTP / parse / length-mismatch fallbacks, title fallback, and title/body/cta soft-caps on
        both Anthropic <code>parseVariantsJson</code> and stub emit via shared{" "}
        <code>src/lib/packs/variant-fields.ts</code> — stub <code>services.join</code> at create-path
        max alone exceeds body max). The same <code>softCapPackVariantFields</code> helper also
        runs on voice pack <strong>read/parse</strong> (SQLite{" "}
        <code>parseClientVoiceVariants</code> + Convex-primary{" "}
        <code>softCapClientVoicePack</code>) and at <strong>Email voice pack</strong> HTML format
        time so already-stored pre-cap rows cannot bypass generate soft-caps under{" "}
        <code>skipSuppression</code>.         Lead→request shaping (
        <code>clientVoiceBusinessContextFromLead</code> /{" "}
        <code>clientVoicePackRequestForLead</code>) has direct edge coverage in{" "}
        <code>src/lib/voice/build-request.test.ts</code> (empty services →{" "}
        <code>our services</code>, hours/state omission, soft-cap via shared{" "}
        <code>normalizeMarketingGenerateBusiness</code> +{" "}
        <code>formatPackBusinessHours</code> weekend retention). Eligibility: paid/live + Complete
        order;
        one row per lead (SQLite + Convex <code>clientVoicePacks</code>) — regenerating replaces.
        Action-level Vitest in{" "}
        <code>src/app/dashboard/leads/generate-client-voice-pack-action.test.ts</code> locks auth,
        Complete-only eligibility, <code>CLIENT_VOICE_PACK_CONVEX_PRIMARY</code> persist,
        stub-vs-anthropic labeling, and <code>ConvexPrimaryWriteError</code> fail-closed —
        generators / faq-pack / build-request suites alone do not cover that glue. When Convex is
        configured, Generate voice passes <code>requireConvex</code> (
        <code>CLIENT_VOICE_PACK_CONVEX_PRIMARY</code>) so a mutation failure surfaces a retry
        instead of leaving voice-packs-due / Email voice pack blind on other instances.{" "}
        <code>sendClientVoicePackToClientAction</code> emails the pack to <code>lead.email</code>{" "}
        via Resend (<code>src/lib/voice/deliver-pack.ts</code>) so clients can paste into a temp
        number / Cal.com — <code>sendClientVoicePackToClientEmail</code> passes{" "}
        <code>skipSuppression: true</code> (paid Complete feature delivery). Action-level Vitest
        in <code>send-client-voice-pack-to-client-action.test.ts</code> locks auth, Complete+email
        eligibility, existing pack gate, and send failure on that dashboard path. Twilio +{" "}
        <code>/api/voice/client/webhook</code> remain Phase 7. See{" "}
        <DocLink href="/docs/voice-agent-flow">Voice agent flow</DocLink> and{" "}
        <DocLink href="/docs/process">process log</DocLink>.
      </p>

      <h2>9. Commerce add-on</h2>
      <p>
        Operator-editable catalog ≤50 SKUs for paid/live leads with a{" "}
        <code>commerceAddon</code> order: shipped (<code>src/lib/commerce/</code>, SQLite + Convex{" "}
        <code>commerceCatalogs</code>, edit on{" "}
        <DocLink href="/dashboard/leads">/dashboard/leads</DocLink>, render on{" "}
        <code>/preview/[slug]</code>). Missing catalogs count on pipeline health (
        <code>commerceCatalogsMissingCount</code>) and list in the daily digest. Saved catalogs
        that still have ≥1 SKU without <code>stripePriceId</code> count separately (
        <code>commerceCatalogsUnsyncedCount</code> / digest Sync to Stripe due).{" "}
        <code>normalizeCommerceItems</code> (Save catalog) rejects a non-integer or out-of-range{" "}
        <code>priceCents</code> before persisting: the floor is{" "}
        <code>MIN_SKU_PRICE_CENTS</code> ($0.50, Stripe&apos;s own documented USD minimum charge
        amount) and the ceiling is <code>MAX_SKU_PRICE_CENTS</code> ($1,000,000) — without the
        floor, an operator could save (and Sync to Stripe would happily create a real Product/Price
        for) a SKU priced below what Stripe will actually charge, and every shopper&apos;s Buy now
        click on it would 502 at Checkout Session creation with no operator-visible signal anywhere
        (no order, no abandoned-cart entry, nothing in pipeline-health/digest) — see{" "}
        <code>commerce-sku-minimum-price-floor</code> in the{" "}
        <DocLink href="/docs/process">process log</DocLink>. Stripe Products
        sync shipped: <code>syncCommerceCatalogToStripeAction</code> (dashboard &quot;Sync to
        Stripe&quot; button) calls <code>syncCommerceCatalogToStripe</code> (
        <code>src/lib/commerce/stripe-sync.ts</code>) to idempotently create/find a Stripe
        Product + Price per SKU (keyed by <code>commerce_sku_&#123;leadSlug&#125;_&#123;skuId&#125;</code>{" "}
        metadata, reuses <code>STRIPE_SECRET_KEY</code> — no new secrets; product/price list
        lookups paginate via shared <code>listAllPages</code> in{" "}
        <code>src/lib/stripe/list-all-pages.ts</code> with direct unit coverage). The
        metadata-keyed list-then-create lookup alone is a check-then-act race (an operator
        double-clicking <strong>Sync to Stripe</strong>, two open dashboard tabs, or a
        client-retried request can each see no existing Product/Price and both create one) — as
        with the Stripe Connect Express account scaffold below, each <code>products.create</code>{" "}
        and <code>prices.create</code> call also carries a stable per-SKU{" "}
        <code>Idempotency-Key</code> (<code>local_​site_​studio_​commerce_​sku_&#123;leadSlug&#125;_&#123;skuId&#125;_product</code>{" "}
        / <code>..._price_&#123;unitAmount&#125;</code>) so Stripe itself collapses a genuinely
        concurrent pair of create calls to a single Product/Price instead of minting a permanently
        orphaned duplicate. Action-level
        Vitest in <code>sync-commerce-catalog-to-stripe-action.test.ts</code> locks auth, secret
        gate, empty catalog, requireConvex persist, and fail-closed Convex errors — then persists
        <code>stripeProductId</code>/<code>stripePriceId</code> back onto each item. The Stripe
        sync loop is sequential per SKU (product/price lookups + creates), a real network-bound
        window in which a concurrent <strong>Save catalog</strong> (a second tab, or a follow-up
        edit) could otherwise be silently overwritten by a stale wholesale write once the sync
        finishes — the action re-reads the catalog immediately before that final write and layers
        only the freshly-created Stripe ids onto the current items via{" "}
        <code>preserveCommerceStripeIds</code> (dropping a SKU&apos;s just-synced{" "}
        <code>stripePriceId</code> if its price changed mid-sync, since that price no longer
        matches what was created), rather than writing the pre-sync snapshot verbatim; locked by a
        dedicated concurrent-edit regression in the same test file. When Convex
        is configured, Save catalog and Sync to Stripe pass <code>requireConvex</code> (
        <code>COMMERCE_CATALOG_CONVEX_PRIMARY</code>) so a mutation failure surfaces instead of
        SQLite-only success while Buy now / unsynced readers stay Convex-first. Catalog
        saves re-attach those ids from the existing DB row via{" "}
        <code>preserveCommerceStripeIds</code> so an ordinary edit does not wipe Buy now —
        action-level Vitest in{" "}
        <code>src/app/dashboard/leads/save-commerce-catalog-action.test.ts</code> locks auth,
        commerceAddon eligibility, normalize validation, preserve against the DB row (never
        client-submitted Stripe ids), requireConvex persist, and{" "}
        <code>ConvexPrimaryWriteError</code> fail-closed. The thin read path that seeds the
        Save/Sync panel is locked by{" "}
        <code>get-commerce-catalog-action.test.ts</code> (auth, empty slug, catalog row or
        null pass-through).
        Sync never archives Products for removed SKUs — operators click{" "}
        <strong>Archive orphans</strong> (
        <code>archiveOrphanCommerceStripeProductsAction</code>) to set those Products{" "}
        <code>active=false</code> (never auto-deletes; scoped to the lead&apos;s metadata).{" "}
        <code>listOrphanCommerceStripeProducts</code>&apos;s account-wide product pagination plus
        the sequential archive loop is a real window, so the action re-reads the catalog
        immediately before archiving anything and drops any candidate whose{" "}
        <code>skuId</code> reappeared — the split{" "}
        <code>archiveCommerceStripeProducts</code> helper (no listing) is what it calls after that
        re-check, so a concurrent <strong>Save catalog</strong> that re-adds or renames into the
        same SKU id can&apos;t have its live Stripe Product archived out from under it — action-level
        Vitest in{" "}
        <code>archive-orphan-commerce-stripe-products-action.test.ts</code> locks auth, secret
        gate, lead lookup, catalog items pass-through, the concurrent-re-add re-check, and Stripe
        error surfaces.{" "}
        <code>/preview/[slug]</code> shows Buy now for synced SKUs — <code>POST /api/commerce/checkout</code>{" "}
        resolves the Stripe Price server-side from the stored catalog (never trusts a
        client-submitted price) and creates a one-time Checkout Session. Opaque{" "}
        <code>slug</code> / <code>skuId</code> body fields are hard-rejected over{" "}
        <code>MAX_LEAD_SLUG_LENGTH</code> (63) and shared{" "}
        <code>MAX_COMMERCE_SKU_ID_LENGTH</code> (64) via{" "}
        <code>parseCommerceCheckoutSlug</code> / <code>parseCommerceCheckoutSkuId</code>{" "}
        before any DB or Stripe work — soft-cap would look up the wrong row. Auth-gated{" "}
        <code>normalizeCommerceItems</code> (Save catalog) uses the same opaque-id ceiling
        and hard-rejects over-long operator-supplied SKU ids rather than{" "}
        <code>slice(0, 64)</code> — truncating distinct ids can collide{" "}
        <code>preserveCommerceStripeIds</code> / Sync-to-Stripe Product keys. Route-level Vitest
        coverage in <code>src/app/api/commerce/checkout/route.test.ts</code> locks that
        server-resolved price invariant, over-long slug/skuId 400s, unsynced-SKU 501s,{" "}
        <code>kind=commerce_sku</code> tracking, and requireConvex fail-closed session create
        (Buy now twin of the bundle checkout suite). Unsynced items keep the
        &quot;Request order&quot; → contact form → inquiry inbox stub. A completed Buy now
        Checkout Session also writes a <code>commerceOrders</code> ledger row (
        <code>src/lib/commerce/orders.ts</code>, SQLite + Convex, idempotent on Stripe session id)
        — kept deliberately separate from the <code>orders</code> table used for Local Site
        Studio&apos;s own revenue, since <code>orderEligibleForBillingPortal</code> /{" "}
        <code>leadEligibleForStarterUpsell</code> read any <code>commerceAddon</code> order row as
        &quot;this lead has a recurring Commerce subscription.&quot;{" "}
        <code>insertCommerceOrder</code> returns <code>&#123; alreadyRecorded &#125;</code>. On
        Stripe <code>checkout.session.completed</code> redelivery, missing operator inquiry and{" "}
        <code>sendCommerceBuyNowClientReceipt</code> are recovered independently: inquiry when no{" "}
        <code>commerce_checkout</code> inquiry embeds the session id; client receipt when{" "}
        <code>commerceOrders.clientReceiptEmailSentAt</code> is unset (
        <code>planCommerceWebhookSideEffects</code> fed by{" "}
        <code>listCommerceCheckoutInquiriesBySlug</code> — uncapped{" "}
        <code>source=commerce_checkout</code> only; not a newest-N{" "}
        <code>listClientInquiriesBySlug</code> page). Inquiry presence alone must not permanently
        skip a failed/suppressed client order-notification email (bundle receipt/DNS twin). The
        receipt sent-marker is written only after the send resolves{" "}
        <code>&#123; success: true &#125;</code>; marker-write failures return HTTP 500 (
        <code>commerce_client_receipt_sent_marker</code>). Inquiry write failures after a durable
        ledger write return HTTP 500 (<code>commerce_order_inquiry</code>) so Stripe redelivers.
        Sessions missing <code>metadata.slug</code> / <code>metadata.skuId</code>, with an
        over-long <code>slug</code> (<code>parseCommerceCheckoutSlug</code> / create-path
        ceiling) or over-long <code>skuId</code> (<code>parseCommerceCheckoutSkuId</code>), whose{" "}
        <code>skuId</code> is not in the lead&apos;s commerce catalog, whose catalog{" "}
        <code>stripePriceId</code> is missing or not on Checkout{" "}
        <code>listLineItems</code> (<code>sessionLineItemsIncludePriceId</code> — amount+currency
        alone do not prove which Price was charged; list failures return 500{" "}
        <code>commerce_sku_price_line_items</code>), whose <code>currency</code> is not{" "}
        <code>usd</code> (<code>isStripeCheckoutCurrencyUsd</code> — Buy now Prices are synced
        as USD), or whose <code>amount_total</code> (integer cents) does not equal the catalog
        item&apos;s <code>priceCents</code> skip ledger and side effects entirely (warn + break)
        — Buy now create already hard-rejects over-long slugs, 404s unknown catalog items,
        requires <code>leadEligibleForCommerceCatalog</code>, and charges only the catalog{" "}
        <code>stripePriceId</code> in USD; the webhook must not burn{" "}
        <code>getLeadBySlug</code> / <code>getCommerceCatalog</code> on a multi-KB slug, fall
        back to a generic &quot;Catalog item&quot; name, ledger after CRM pause/cancel, or trust a different Price / non-USD /
        mismatched Stripe amount and still write fulfillment. The alreadyRecorded gate cannot
        run without a bounded slug and a known SKU charged at the catalog USD Price. Pipeline health
        surfaces the total as <code>commerceOrdersRevenueUsd</code> (&quot;Commerce sales
        (pass-through)&quot;) — unpaid/owed only (rows with <code>paidOutAt</code> are excluded,
        matching the payout panel + digest). This money sits in the platform&apos;s own Stripe
        account with no automated payout path to
        the client yet (see <code>commerce-payouts-stripe-connect</code>). Operators reconcile
        manual payouts from the <strong>Commerce payouts (manual)</strong> panel on{" "}
        <DocLink href="/dashboard/leads">/dashboard/leads</DocLink>, which groups{" "}
        <code>listUnpaidCommerceOrders</code> by lead via{" "}
        <code>summarizeCommerceOrdersByLead</code>{" "}
        (not <code>listCommerceOrders</code>&apos; newest 200/500 page — that undercounts
        older unpaid liability). Convex <code>listUnpaid</code> treats falsy/blank{" "}
        <code>paidOutAt</code> as unpaid (same as SQLite{" "}
        <code>IS NULL OR = &apos;&apos;</code> and <code>isCommerceOrderPaidOut</code>) so
        an empty-string marker cannot split owed totals across backends. Each row is keyed by <code>CommerceOrderRecord.id</code> —{" "}
        <code>newCommerceOrderId()</code> generates it once in{" "}
        <code>insertCommerceOrder</code> and passes it to both backends as the Convex
        table&apos;s <code>orderId</code> column, matching the app-owned-id pattern every
        other ledger already used; the Convex path originally had no id column at all,
        so payout rows silently lost React list identity once Convex was configured).
        Each order line has a <strong>Mark paid out</strong> button (
        <code>getCommerceOrderByStripeSessionId</code> lookup — never a truncated list scan)
        that sets{" "}
        <code>paidOutAt</code> (SQLite + Convex — the static <code>api.commerceOrders.markPaidOut</code>{" "}
        map entry is required so Convex primary deploys actually persist; when Convex is configured
        the operator action also passes <code>requireConvex</code> via{" "}
        <code>COMMERCE_PAID_OUT_CONVEX_PRIMARY</code> so a mutation failure surfaces instead of
        SQLite-only success while unpaid owed readers stay Convex-first; action-level Vitest in{" "}
        <code>mark-commerce-order-paid-out-action.test.ts</code> locks auth, already-paid-out,
        requireConvex fail-closed, and revalidate glue that paid-out-persist / orders helper
        suites alone do not cover) once the operator has actually sent the client
        their share — paid-out lines drop out of the panel&apos;s owed total, the pipeline-health
        card, and the digest{" "}
        (<code>unpaidTotalUsd</code>/<code>unpaidCount</code>) so the same amount can never look
        owed twice. Dashboard{" "}
        <code>markCommerceOrderPaidOutAction</code> (and the abandoned-recovery twins{" "}
        <code>sendCheckoutRecoveryAction</code> /{" "}
        <code>sendCommerceCheckoutRecoveryAction</code>) hard-reject{" "}
        <code>stripeSessionId</code> longer than{" "}
        <code>MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH</code> (255) via shared{" "}
        <code>parseCheckoutSessionId</code> before any Convex/SQLite lookup —{" "}
        <code>requireOperatorAuth</code> is not a payload-size throttle (same class as{" "}
        Assign-project <code>vercelProjectId</code> and the public billing-portal / success-page
        sessionId sinks). Pipeline-health and daily-digest tests guard against a future re-wire to a
        newest-N <code>listCommerceOrders</code> page (same truncation class as unreplied
        inquiries). The same rollup also appears as a <strong>Commerce payouts owed</strong>{" "}
        section on the operator daily digest so pass-through liability is visible without opening
        the dashboard.
        Open Buy now Checkout
        Sessions are recorded with <code>kind=commerce_sku</code> on{" "}
        <code>checkout_sessions</code> (same table as bundle carts, never the same recovery path);
        abandoned carts past 2h surface on the Abandoned Buy now panel / digest and can nudge the
        shopper back to <code>/preview/[slug]#catalog</code> when an email was collected. The
        same completed Buy now webhook also emails <code>lead.email</code> (
        <code>sendCommerceBuyNowClientReceipt</code>) so the local business gets the sold order
        notification — best-effort after inquiry + ledger on first delivery only; skipped when the
        lead has no email or when the session was already ledgered. The notice&apos;s own copy says
        &quot;Questions? Just reply to this email&quot; — <code>sendCommerceBuyNowClientReceipt</code>{" "}
        now forwards <code>customerEmail</code> (the shopper&apos;s address, already shown in the
        body) as <code>replyTo</code> so hitting <strong>Reply</strong> actually routes to the
        shopper instead of this app&apos;s <code>EMAIL_FROM</code>, mirroring the same
        Reply-To fix already shipped for the Starter contact-form CRM loop; omitted when Stripe
        Checkout collected no customer email.{" "}
        <code>commerceOrders.customerEmail</code> now persists that same shopper address on the
        ledger row (SQLite + Convex, threaded through the one <code>insertCommerceOrder</code>{" "}
        call site and preserved across <code>clearRefunded</code>/<code>clearDisputed</code>&apos;s{" "}
        <code>ctx.db.replace()</code> field list — the same drop-on-replace risk{" "}
        <code>quantity</code> already had to guard against) — so the dashboard&apos;s manual{" "}
        <strong>Resend receipt</strong> action (<code>resendCommerceClientReceiptAction</code>) can
        pass the same <code>replyTo</code> the live webhook send already does, instead of having no
        shopper email available at all for a receipt sent after the original webhook delivery.
      </p>

      <p>
        <code>POST /api/commerce/checkout</code>&apos;s line item carries{" "}
        <code>adjustable_quantity</code> (min 1, max <code>MAX_COMMERCE_LINE_ITEM_QUANTITY</code>{" "}
        = 25) so a shopper can buy more than one unit from Stripe&apos;s own hosted Checkout page
        — there is no in-app cart, so a café selling 3 lattes in one visit relies on that stepper
        rather than 3 separate Checkout round trips (
        <code>commerce-checkout-adjustable-quantity</code>). The webhook still ledgers{" "}
        <code>session.amount_total</code> (quantity-agnostic, unaffected by unit count), but the{" "}
        <code>commerceOrders</code> row also captures the actual purchased{" "}
        <code>quantity</code> — read off the same <code>listLineItems</code> response already
        fetched for Price-parity verification via{" "}
        <code>commerceSkuLineItemQuantity</code>, never back-computed from{" "}
        <code>amountPaidUsd</code> ÷ the catalog&apos;s current price, since an operator can
        re-sync a SKU to a new Stripe Price between Session creation and completion while an
        already-open Session still legitimately charges the old one (
        <code>commerce-order-quantity-visibility</code>). <code>quantity</code> is optional and
        undefined — never assumed as 1 — on any row recorded before this shipped or whose line
        item ever lacks a valid quantity; Convex&apos;s <code>clearRefunded</code>/
        <code>clearDisputed</code> replace-based mutations explicitly preserve it, the same trap
        <code>paidOutAt</code>/<code>clientReceiptEmailSentAt</code> already had to avoid there.
        A known quantity over 1 renders as a{" "}
        <code>× N</code> suffix on the operator inquiry-inbox message (
        <code>commerceOrderPaidInquiryMessage</code>), the client-receipt email (
        <code>formatCommerceBuyNowClientReceiptHtml</code>), the Commerce payouts and Missing
        client receipt dashboard panels, and the daily digest&apos;s refund-clawback,
        dispute-clawback, and missing-client-receipt sections (
        <code>daily-digest-commerce-order-quantity-parity</code>) — the exact fulfillment/notify
        surfaces a local business relies on to tell a 1-unit sale from a 3-unit one.
      </p>

      <p>
        A dormant Stripe Connect Express scaffold shipped as a tier-6 empty-backlog candidate
        (2026-07-20, see <code>commerce-payouts-stripe-connect</code>):{" "}
        <code>createStripeConnectAccountAction</code>,{" "}
        <code>createStripeConnectOnboardingLinkAction</code>, and{" "}
        <code>checkStripeConnectAccountStatusAction</code> (src/app/dashboard/leads/actions.ts)
        create a per-lead Connect Express account (idempotent — re-finds an existing account by{" "}
        <code>metadata.local_site_studio_lead_slug</code> via{" "}
        <code>createExpressConnectAccount</code>, mirroring <code>bootstrapStripePrices</code>
        &apos;s idempotency pattern, <strong>plus</strong> a stable per-lead Stripe{" "}
        <code>Idempotency-Key</code> (<code>local_​site_​studio_​connect_​account_&#123;leadSlug&#125;</code>)
        on the <code>accounts.create</code> call itself — the list-then-create metadata search
        alone is a check-then-act race (two concurrent calls for the same lead can both see no
        existing account and both call create), and the Idempotency-Key is what actually closes
        it at the Stripe API layer — the same check-then-act race class as the commerce catalog
        Sync-to-Stripe / orphan-archive TOCTOU guards elsewhere on this page), generate a
        Stripe-hosted onboarding link for the operator to
        send the client, and check live{" "}
        <code>charges_enabled</code>/<code>payouts_enabled</code>/<code>details_submitted</code>{" "}
        status. <code>leads.stripeConnectAccountId</code> (Convex + SQLite,{" "}
        <code>LEAD_STRIPE_CONNECT_CONVEX_PRIMARY</code> requireConvex fail-closed) is the only
        fail-closed persisted field — <strong>account creation and status-checking carry no
        money-movement risk</strong>. Since{" "}
        <code>stripe-connect-onboarding-pipeline-health-visibility</code> (2026-07-23),{" "}
        <code>checkStripeConnectAccountStatusAction</code> also best-effort caches its live result
        onto the lead (<code>stripeConnectChargesEnabled</code>/
        <code>stripeConnectPayoutsEnabled</code>/<code>stripeConnectDetailsSubmitted</code>/
        <code>stripeConnectStatusCheckedAt</code>, plus a set-once{" "}
        <code>stripeConnectAccountCreatedAt</code> written alongside the account id) — a display
        cache only (Stripe&apos;s own account object stays the source of truth), so a persist
        failure never turns an already-successful live check into a reported error. This closes a
        real visibility gap flagged by <code>buffer-token-header-not-query</code>: Connect
        onboarding status previously had zero visibility outside each lead&apos;s own Payouts
        panel, unlike every other due-queue signal in this codebase.{" "}
        <code>connectOnboardingIncomplete</code>/<code>listLeadsWithIncompleteConnectOnboarding</code>/
        <code>oldestConnectOnboardingIncompleteAgeHours</code> (src/lib/commerce/stripe-connect.ts)
        treat a Connect account as incomplete until BOTH <code>chargesEnabled</code> and{" "}
        <code>payoutsEnabled</code> are confirmed true — including an account never checked at
        all — and feed a new &quot;Stripe Connect onboarding incomplete&quot; card on{" "}
        <code>PipelineHealthPanel</code> and a matching daily-digest section, anchoring the
        staleness signal on <code>stripeConnectAccountCreatedAt</code> (skip-if-no-anchor, same
        contract as <code>oldestPaidNotLiveAgeHours</code>) rather than the more recent{" "}
        <code>stripeConnectStatusCheckedAt</code>, since the latter reflects when it was last
        looked at, not how long it has been stuck incomplete. The five new fields are stripped by{" "}
        <code>softCapLeadForPublicSurface</code> — same dashboard-only class as{" "}
        <code>notes</code>/<code>stripeConnectAccountId</code>. This is operator-awareness only —
        still no money movement — so <code>commerce-payouts-stripe-connect</code> stays{" "}
        <code>status: &quot;todo&quot;</code>. All three actions are gated behind{" "}
        <code>ALLOW_STRIPE_CONNECT_ONBOARDING=1</code> (default off — see{" "}
        <code>stripe-connect-gate.ts</code>, same 403/501 shape as{" "}
        <code>ALLOW_STRIPE_BOOTSTRAP</code>). This scaffold does not move money: Commerce Buy now
        revenue still lands entirely in the platform&apos;s own Stripe account until a future,
        counsel-reviewed iteration wires an actual transfer/destination-charge path onto the
        created accounts — <code>commerce-payouts-stripe-connect</code> stays{" "}
        <code>status: &quot;todo&quot;</code> in <code>NEXT_STEPS</code> for that reason. The
        Payouts panel&apos;s own &quot;Charges enabled / Payouts enabled / Details submitted&quot;
        line originally read only an in-memory, never-persisted <code>useState</code> populated
        solely by that session&apos;s own <strong>Check status</strong> click — so it showed
        nothing at all on a fresh page load even after{" "}
        <code>stripe-connect-onboarding-pipeline-health-visibility</code> started persisting the
        exact same status onto the lead. <code>resolveDisplayedConnectStatus</code>{" "}
        (src/lib/commerce/stripe-connect.ts) now prefers a live same-session check but falls back
        to the persisted <code>stripeConnectChargesEnabled</code>/<code>stripeConnectPayoutsEnabled</code>/
        <code>stripeConnectDetailsSubmitted</code>/<code>stripeConnectStatusCheckedAt</code> cache
        so the panel shows the last-known answer (labeled &quot;as of &lt;date&gt;&quot;) instead
        of nothing.
      </p>

      <p>
        Until Stripe Connect ships, a refunded or disputed Commerce Buy now charge is a real
        payout-safety exposure: the operator could <strong>Mark paid out</strong> an order Stripe
        had already returned to the shopper (refund) or already debited from the platform pending
        review (dispute), losing that money twice. <code>charge.refunded</code> and{" "}
        <code>charge.dispute.created</code> both resolve the underlying Checkout Session via{" "}
        <code>stripe.checkout.sessions.list({"{ payment_intent }"})</code> (charges/disputes carry
        no Session id directly) and, when that Session backs a <code>commerceOrders</code> row,
        mark <code>refundedAt</code> / <code>disputedAt</code> respectively (idempotent — Stripe
        redelivery is a no-op). Either flag drops the order out of{" "}
        <code>commerceOrdersRevenueUsd</code> / <code>summarizeCommerceOrdersByLead</code>&apos;s{" "}
        <code>unpaidTotalUsd</code>, and <code>markCommerceOrderPaidOutAction</code> rejects paying
        out an order once either is set. If <code>paidOutAt</code> was already set before the
        refund/dispute landed, the operator paid the client out of pocket for money Stripe has
        since taken back — that is a clawback owed from the client,{" "}
        <code>commerceOrderNeedsClawback</code> (true when paid out AND (refunded OR disputed))
        surfaced via two uncapped feeds, <code>listCommerceOrdersRefunded</code> /{" "}
        <code>listCommerceOrdersDisputed</code> (<code>listUnpaidCommerceOrders</code> drops any
        row once <code>paidOutAt</code> is set and cannot see this case on its own), feeding
        pipeline-health <strong>Refund clawback needed</strong> /{" "}
        <strong>Dispute clawback needed</strong> cards and matching daily-digest sections.{" "}
        <code>charge.dispute.closed</code> is the resolution twin: status <code>won</code> or{" "}
        <code>warning_closed</code> clears <code>disputedAt</code> via{" "}
        <code>clearCommerceOrderDisputed</code> (Convex replace omit + SQLite NULL) so Mark paid
        out and owed totals reopen after Stripe reinstates funds; status <code>lost</code> keeps
        or ensures <code>disputedAt</code> (created may have been missed).
      </p>

      <p>
        <code>clientReceiptEmailSentAt</code> tracks a different axis entirely: whether the local
        business was ever <em>notified</em> of a Buy now sale, independent of payout/refund/dispute
        status. A permanently-bad client email or a sustained Resend outage past Stripe&apos;s
        webhook retry window used to leave this unset forever with nothing surfacing the gap.{" "}
        <code>listCommerceOrdersMissingClientReceipt</code> (uncapped, mirrors{" "}
        <code>listCommerceOrdersRefunded</code>/<code>listCommerceOrdersDisputed</code>) feeds the
        pipeline-health <strong>Missing client receipt</strong> card and a matching daily-digest
        section so a silently-unnotified sale stays visible until the operator resends the receipt
        or the underlying email issue is fixed.
      </p>

      <p>
        The same generated-vs-delivered gap existed for Growth/Complete marketing packs and Complete
        client voice FAQ packs: <strong>Generate</strong> and{" "}
        <strong>Email pack / Email voice pack</strong> are two separate operator actions with
        nothing linking them, and the due-count helpers (<code>listMarketingPacksDue</code>/{" "}
        <code>listClientVoicePacksDue</code>) only check whether a pack row exists, not whether it
        was ever emailed — so clicking Generate alone silently cleared the fulfillment debt even
        if Email pack was never clicked or the send failed.{" "}
        <code>MarketingPack</code>/<code>ClientVoicePack</code> now carry an optional{" "}
        <code>sentToClientAt</code>, mirroring <code>clientReceiptEmailSentAt</code>:{" "}
        <code>sendMarketingPackToClientAction</code>/<code>sendClientVoicePackToClientAction</code>{" "}
        mark it (best-effort, after the send already resolved <code>{"{ success: true }"}</code> —
        a marker-write failure never turns a successful send into a reported failure), and
        regenerating a pack (<code>upsertMarketingPack</code>/<code>upsertClientVoicePack</code>)
        always clears it since new content has not yet been sent.{" "}
        <code>listMarketingPacksMissingClientSend</code>/
        <code>listClientVoicePacksMissingClientSend</code> (gated on the same eligibility predicate
        as the due-count twins) feed new pipeline-health cards and daily-digest sections —{" "}
        <strong>Marketing packs not emailed</strong> / <strong>Complete voice packs not emailed</strong>{" "}
        — distinct from the existing generation-debt cards, plus an inline emailed/not-yet-emailed
        badge on the dashboard&apos;s pack panels (see{" "}
        <code>marketing-voice-pack-client-send-visibility</code>).
      </p>

      <p>
        A refund itself can also reverse — common for bank-sourced refunds (ACH, some debit cards)
        that Stripe reports as <code>pending</code>/<code>succeeded</code> first, then fails or is
        canceled days later when the destination account rejects it. Disputes got a resolution
        twin (<code>charge.dispute.closed</code>) from the start; refunds did not, so a reversed
        refund left the order permanently excluded from owed totals and Mark paid out even though
        the funds never left the platform (<code>commerce-order-refund-reversal-tracking</code>).{" "}
        <code>refund.updated</code> with status <code>failed</code> or <code>canceled</code> (
        <code>refundStatusReversesRefund</code>) resolves the Session the same way as
        <code>charge.refunded</code> and clears <code>refundedAt</code> — <code>clearCommerceOrderRefunded</code>{" "}
        for a Commerce order, <code>clearOrderRefunded</code> for a bundle order (both Convex
        replace-omit + SQLite NULL, mirroring the dispute clear twins exactly). Any other status (
        <code>succeeded</code>, <code>pending</code>, <code>requires_action</code>) is a no-op here
        — the initial <code>refundedAt</code> mark already happened via <code>charge.refunded</code>.
      </p>

      <p>
        Bundle (Starter/Growth/Complete/Commerce-addon) order refunds and disputes have no
        manual-payout double-loss risk — that revenue is never disbursed to a client — but a
        refunded or disputed charge still needs to stop counting as revenue and stay visible to
        the operator. On <code>charge.refunded</code> / <code>charge.dispute.created</code>, when
        the resolved Checkout Session backs no <code>commerceOrders</code> row, the webhook
        checks whether it backs a bundle <code>orders</code> row instead (via{" "}
        <code>getOrderByStripeSessionId</code>) and marks <code>orders.refundedAt</code> /{" "}
        <code>orders.disputedAt</code> (idempotent; <code>markOrderRefunded</code> /{" "}
        <code>markOrderDisputed</code>). <code>PipelineHealth.revenueTotalUsd</code> excludes any
        order with either flag set, and the dashboard&apos;s{" "}
        <strong>Bundle revenue refunded</strong> / <strong>Bundle revenue disputed</strong> cards
        plus matching daily-digest sections surface the count/total for awareness — unlike the
        Commerce clawback cards above, there is no Mark-paid-out reject or claw-back action here,
        since nothing was ever paid out to a third party.{" "}
        <code>charge.dispute.closed</code> with status <code>won</code> /{" "}
        <code>warning_closed</code> clears <code>orders.disputedAt</code> via{" "}
        <code>clearOrderDisputed</code> (Convex replace omit + SQLite NULL) so revenue reopens
        after Stripe reinstates funds; status <code>lost</code> keeps or ensures{" "}
        <code>disputedAt</code>.
      </p>

      <p>
        The <strong>Commerce payouts (manual)</strong> panel itself is the row-level surface for
        clawback: it merges <code>listUnpaidCommerceOrders</code> with{" "}
        <code>listCommerceOrdersRefunded</code> / <code>listCommerceOrdersDisputed</code> (
        <code>mergeCommerceOrdersForReview</code>, deduped by <code>id</code> — an order refunded
        but never paid out satisfies both the &quot;unpaid&quot; and &quot;refunded&quot; feeds,
        so a raw concat would double-count it) before grouping by lead, and keeps a lead&apos;s
        summary visible when it has a clawback-needed order even if{" "}
        <code>unpaidCount</code> is 0 (<code>commerceOrdersByLeadSummaryNeedsAttention</code>).
        Until this fix, a clawback-needed order (paid out, then refunded/disputed) never reached
        the panel&apos;s data at all — <code>listUnpaidCommerceOrders</code> excludes every{" "}
        <code>paidOutAt</code> row by definition — so the panel&apos;s own per-order text
        (&quot;Refunded/Disputed after payout — claw back from client&quot;) was dead code, and
        the live dashboard had zero row-level clawback detail beyond the aggregate
        pipeline-health count/$ card and the daily-digest email (see
        commerce-payouts-panel-clawback-visibility).
      </p>

      <p>
        <code>orders.refundedAt</code> / <code>disputedAt</code> (above) only ever fed{" "}
        <em>revenue reporting</em> — <code>PipelineHealth.revenueTotalUsd</code> and the payout
        clawback surfaces — until <strong>refund-dispute-entitlement-gate</strong>. The four sold
        recurring-capability gates (<code>leadEligibleForMarketingPack</code>,{" "}
        <code>leadEligibleForClientVoicePack</code>, <code>leadEligibleForCommerceCatalog</code>,
        and <code>isStarterOnlyOrder</code> for the Starter → MRR upsell nudge) never checked
        either flag, only <code>recurringCanceledAt</code> — a Stripe refund or dispute does not
        always cancel the underlying Subscription (a single charge can be returned/disputed while
        the Subscription itself stays <code>active</code>), so a client who got their money back
        kept full service delivery indefinitely: the operator dashboard still offered{" "}
        <strong>Generate pack</strong> / <strong>Email pack</strong> / <strong>Sync to Stripe</strong>{" "}
        for that lead, <code>POST /api/commerce/checkout</code> and the commerce webhook still let
        their catalog sell to end customers, and a refunded Starter customer could still receive
        an upsell pitch to upgrade to a paid recurring plan. Shipped{" "}
        <code>orderGrantsSoldCapabilityEntitlement</code> (src/lib/orders/recurring.ts) — active
        recurring entitlement AND never refunded/disputed — and wired it into all three pack/catalog
        eligibility predicates (<code>bestMarketingOrderTier</code> too, so tier selection also
        skips a refunded/disputed order) plus <code>isStarterOnlyOrder</code>. Fulfillment
        already-in-flight (a pack row already generated/emailed before the refund) is untouched —
        this only gates <em>future</em> generate/deliver/sync/checkout/upsell actions, matching how{" "}
        <code>recurringCanceledAt</code> gating already behaved for cancellations.
      </p>

      <p>
        <strong>refund-dispute-oldest-age-parity</strong> closed a residual gap
        refund-dispute-entitlement-gate left behind: the three &quot;oldest Xh&quot; staleness
        helpers on the same due-queues —{" "}
        <code>oldestMarketingPacksDueAgeHours</code>, <code>oldestCommerceCatalogCandidateAgeHours</code>,
        and <code>oldestClientVoicePacksDueAgeHours</code> — were shipped by due-queue-oldest-age-parity
        before <code>orderGrantsSoldCapabilityEntitlement</code> existed, so each still filtered orders
        with its own raw <code>recurringCanceledAt</code> check rather than the shared combinator. A lead
        with an older Growth/Complete/Commerce order that was refunded or disputed mid-cycle (without
        necessarily setting <code>recurringCanceledAt</code>) alongside a newer, still-entitled order
        would have that stale order&apos;s earlier <code>createdAt</code> pulled into the{" "}
        <code>min()</code> &quot;due since&quot; scan, inflating the reported age on the
        PipelineHealthPanel MetricCard hint and the daily-digest email beyond what the (correctly-gated)
        eligibility check actually owes.{" "}
        <code>oldestStarterUpsellCandidateAgeHours</code> was already immune — it reuses{" "}
        <code>isStarterOnlyOrder</code> rather than reimplementing the check — confirming this was an
        oversight specific to the three due-queue-oldest-age-parity helpers. All three now gate on{" "}
        <code>orderGrantsSoldCapabilityEntitlement</code>, matching their sibling eligibility predicates
        exactly.
      </p>

      <p>
        <strong>starter-upsell-exclusion-refund-dispute-aware</strong> closed one more sibling gap in
        the same family: <code>isStarterOnlyOrder</code> got refund/dispute-aware treatment from{" "}
        refund-dispute-entitlement-gate, but <code>leadEligibleForStarterUpsell</code>&apos;s other
        half — the &quot;lead has no Growth/Complete/Commerce order yet&quot; exclusion — still ran{" "}
        <code>orderEligibleForBillingPortal</code> raw (tier/<code>commerceAddon</code> only). A lead
        with a live Starter order plus a separate Growth/Complete/Commerce order Stripe later refunded
        or disputed still tier-matched that exclusion, so the Starter → MRR upsell nudge stayed
        permanently unavailable even though the refunded/disputed order grants zero live entitlement.
        Added <code>isLiveRecurringOrder</code> (<code>orderEligibleForBillingPortal &amp;&amp;
        !isOrderRefunded &amp;&amp; !isOrderDisputed</code>) for this exclusion only — deliberately not{" "}
        <code>orderGrantsSoldCapabilityEntitlement</code>, which also excludes a merely-canceled
        (<code>recurringCanceledAt</code>) order; this exclusion&apos;s design intentionally keeps a
        former (canceled-but-not-refunded) subscriber counted as &quot;already has recurring&quot; so
        they are not nudged as if they were Starter-only.
      </p>

      <p>
        <strong>starter-upsell-billing-portal-mutual-exclusion-restore</strong> reverted{" "}
        <code>isLiveRecurringOrder</code> from the entry above: its reasoning didn&apos;t hold. A
        Stripe refund or dispute is a single-charge event and does not always cancel the underlying
        Subscription — <code>orderEligibleForBillingPortal</code> itself never excludes
        refunded/disputed orders (a disputed-but-still-billing subscriber keeps Manage billing on
        purpose), so treating a refunded/disputed Growth/Complete/Commerce order as &quot;no longer
        blocks the upsell&quot; broke the module&apos;s own stated guarantee that Billing and Upsell
        buttons never both appear for the same lead. A lead with a live Starter order plus a Growth
        order that was disputed <em>without</em> canceling the subscription showed both CTAs at once;
        an operator sending that upsell and the customer paying again would create two simultaneously
        active recurring subscriptions billing the same customer monthly. Removed the carve-out —{" "}
        <code>leadEligibleForStarterUpsell</code> now reuses <code>orderEligibleForBillingPortal</code>{" "}
        directly and unmodified, as AGENT_PROTOCOL has stated all along.
      </p>

      <p>
        <strong>billing-notice-pause-recipient-write-before-read-fix</strong> fixed a regression{" "}
        billing-notice-entitlement-selection introduced in the two pause-direction webhook notices.
        That fix uniformly swapped all four notice recipient lookups (payment-failed,
        payment-recovered, subscription-paused, subscription-resumed) from{" "}
        <code>orderHadRecurringEntitlement</code> to{" "}
        <code>orderGrantsSoldCapabilityEntitlement</code> to stop a refunded/disputed order from
        surfacing a stale notice — correct for the two resume-direction sites, which read the order{" "}
        <em>after</em> <code>clearOrdersRecurringCanceledByCustomer</code> runs. But the two
        pause-direction sites (<code>customer.subscription.updated</code> pause_collection branch,{" "}
        <code>invoice.payment_failed</code> dunning) read the order <em>immediately after</em>{" "}
        <code>markOrdersRecurringCanceledByCustomer</code> just set{" "}
        <code>recurringCanceledAt</code> on that exact row —{" "}
        <code>orderGrantsSoldCapabilityEntitlement</code> requires that field unset, so it always
        rejected the order it had just paused and{" "}
        <strong>sendSubscriptionPausedNotice / sendPaymentFailedNotice silently never fired on
        main</strong>, despite being merged, unit-tested, and marked done. Added{" "}
        <code>orderEligibleForPauseNotice</code> (<code>orderHadRecurringEntitlement &amp;&amp;
        !isOrderRefunded &amp;&amp; !isOrderDisputed</code>) — the pause-notice twin of{" "}
        <code>orderGrantsSoldCapabilityEntitlement</code> that deliberately ignores{" "}
        <code>recurringCanceledAt</code> since it is expected to be freshly set at its call sites —
        and used it only at the two pause-direction sites; the resume-direction sites are unchanged.
        <code>route.test.ts</code>&apos;s blanket <code>vi.mock(&quot;@/lib/db&quot;)</code> hid this:
        the pause-notice fixtures never included <code>recurringCanceledAt</code>, a state real
        SQLite/Convex can never return at that point in the flow — fixed to match what the preceding
        write actually produces.
      </p>

      <h2>Tech stack</h2>
      <ul>
        <li>Next.js 16 + TypeScript + Tailwind v4</li>
        <li>Vercel hosting, Stripe Checkout</li>
        <li>Vapi/Retell (platform + client voice)</li>
        <li>Resend (email), Buffer (scheduling MVP)</li>
        <li>
          Database: Convex-first with a SQLite fallback (dual-write with fail-closed{" "}
          <code>requireConvex</code> on every recurring write path — see above)
        </li>
      </ul>
    </DocPage>
  );
}
