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
            <th scope="col">Stakeholder</th>
            <th scope="col">Goal</th>
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
        <code>add-lead-empty-field-defaults</code>: every other lead-creation path — CSV import&apos;s{" "}
        <code>parseLeadsCsv</code> and the Stripe payment-stub builder — already defaulted a blank
        phone/tagline/description rather than persisting an empty string, but{" "}
        <code>normalizeLeadCreateFields</code> (the manual <strong>Add lead</strong> path) never
        picked up the same convention, even though it already defaulted an empty{" "}
        <code>services</code> list. An operator filling in only Business Name/Slug/Category could
        save a lead with all three fields blank, which rendered broken on the public preview page
        (empty hero subtext, a dead <code>tel:</code> link, a &quot;Call &quot; button with no
        number) and, once the lead reached <code>paid</code>/<code>live</code>, shipped empty{" "}
        <code>telephone</code>/<code>description</code> fields in the paid deliverable&apos;s
        LocalBusiness JSON-LD. Fixed by adding the same fallbacks
        <code>normalizeLeadCreateFields</code> already had for <code>services</code>: phone falls
        back to the shared <code>DEFAULT_LEAD_PHONE</code> placeholder, tagline to{" "}
        <code>defaultTagline(category)</code>, and description to a business-name-derived
        placeholder sentence (mirroring CSV import&apos;s own wording) — all applied before the
        existing soft-cap, so an over-long default still truncates the same way an operator-typed
        value would.
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
        Category templates (restaurant, salon, trades, retail, health, automotive, cleaning,
        fitness, legal, generic) render at{" "}
        <code>/preview/[slug]</code> from the lead catalog (
        <code>src/lib/leads</code>). Demo slugs: <code>example-bakery</code>,{" "}
        <code>serene-salon</code>, <code>mountain-plumbing</code>,{" "}
        <code>corner-mercantile</code>, <code>clearview-wellness-clinic</code>,{" "}
        <code>trailhead-auto-repair</code>, <code>brightside-cleaning-co</code>,{" "}
        <code>ironclad-fitness-studio</code>,{" "}
        <code>westbrook-law-group</code>. Commerce catalog
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
        / Resend / auth banners). LocalBusiness JSON-LD also attaches an{" "}
        <code>openingHoursSpecification</code> array when a lead&apos;s free-text{" "}
        <code>hours.weekday</code>/<code>hours.weekend</code> fields contain a recognizable
        &ldquo;<code>&lt;Day&gt;[–&lt;Day&gt;] &lt;time&gt;–&lt;time&gt;</code>&rdquo; segment (e.g.
        &ldquo;Mon–Fri 7am–3pm&rdquo;), via <code>leadOpeningHoursSpecification</code> (
        <code>src/lib/leads/hours-schema.ts</code>). This is deliberately strict-match-or-omit,
        never a fuzzy guess: prose like &ldquo;by appointment&rdquo; or &ldquo;emergency
        on-call&rdquo; is silently dropped rather than mapped to a plausible-looking but wrong
        time range, since publishing an incorrect open/close time into a real customer&apos;s
        Google Knowledge Panel is worse than publishing no hours at all. A middot-joined field
        (e.g. &ldquo;Sat 9am–4pm · Closed Sun–Mon&rdquo;) parses each clause independently and
        keeps only the ones that match. Until <code>NEXT_PUBLIC_PRODUCTION_DOMAIN</code> is a bare
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
      <p>
        That same block also carries a <code>makesOffer</code> array — one schema.org{" "}
        <code>Offer</code> per bundle tier, sourced directly from <code>BUNDLES</code> (
        <code>src/lib/pricing/bundles.ts</code>), the same single source of truth the checkout
        UI and docs pricing tables already read from. Each offer&apos;s <code>price</code> is the
        tier&apos;s one-time setup fee; the recurring portion (Growth/Complete&apos;s monthly fee)
        is folded into the offer&apos;s <code>description</code> via the existing{" "}
        <code>bundlePriceHeadingLabel</code> formatter (e.g. &ldquo;$500 + $99/mo&rdquo;) rather
        than a second <code>priceSpecification</code> object, matching how{" "}
        <code>commerceOfferCatalogJsonLd</code> already represents a client&apos;s Commerce SKUs.
        This gives crawlers and AI answer engines machine-readable pricing for the homepage
        pricing section — previously the only <code>Offer</code>/<code>priceCurrency</code>{" "}
        schema anywhere on the site described a client&apos;s own Commerce catalog, never the
        platform&apos;s own plans.
      </p>
      <p>
        A homepage-level growth audit separately found zero social-proof signal anywhere on the
        site (no testimonial, review, or client count) — a real gap for a self-serve product that
        asks a stranger to pay in the same session they first see the preview. Rather than
        fabricate quotes (this business has not yet taken a real Stripe payment — see{" "}
        <code>stripe-price-objects</code> in <DocLink href="/docs/process">process</DocLink>),{" "}
        <code>src/lib/marketing/testimonials.ts</code> ships the capability dormant:{" "}
        <code>TESTIMONIALS</code> starts as an empty array, and{" "}
        <code>src/components/marketing/testimonials.tsx</code> (rendered on the homepage between
        the industries and pricing sections) returns <code>null</code> until the operator adds a
        real, permissioned client quote — no code change needed at that point, and nothing on the
        page changes until then.
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
        Until <code>operator-daily-digest-cron-automation</code>, <strong>Send daily digest</strong>{" "}
        was the digest&apos;s only trigger — the one mechanism built so a single-operator business
        doesn&apos;t have to open <code>/dashboard/leads</code> to know what&apos;s urgent today
        could only ever fire when the operator remembered to click a button, at which point they
        were already looking at <code>PipelineHealthPanel</code> and didn&apos;t need the email.
        The digest-build-and-send body was extracted out of{" "}
        <code>sendDailyDigestAction</code> into <code>sendOperatorDigestEmail</code> (
        <code>src/lib/digest/send-operator-digest.ts</code>), a plain async helper with no auth or
        rate-limit logic of its own, so both triggers share one code path and can never build the
        digest from different ledger reads. <code>GET /api/cron/daily-digest</code> (
        <code>src/app/api/cron/daily-digest/route.ts</code>) calls that helper once a day via a{" "}
        <code>vercel.json</code> <code>&quot;crons&quot;</code> entry. Vercel Cron sends{" "}
        <code>Authorization: Bearer &lt;CRON_SECRET&gt;</code> automatically when the env var is
        named exactly <code>CRON_SECRET</code> — the route verifies it with a constant-time,
        length-bounded compare mirroring <code>passwordsMatch</code> (
        <code>src/lib/auth/operator.ts</code>), then rate-limits by IP as defense in depth against
        a leaked secret before calling <code>sendOperatorDigestEmail</code>. Mirrors{" "}
        <code>src/app/api/resend/webhook/route.ts</code>&apos;s <code>notConfigured</code> pattern:
        an unset <code>CRON_SECRET</code> or <code>OPERATOR_DIGEST_EMAIL</code> returns 501 rather
        than a silent 200, so a misconfigured deployment shows as a failing run in Vercel&apos;s own
        cron dashboard instead of quietly never sending. Route-level Vitest in{" "}
        <code>src/app/api/cron/daily-digest/route.test.ts</code> locks the secret gate (including a
        same-length-wrong-secret case that exercises the byte compare, not just the length check),
        the rate limit, both not-configured cases, and success/failure delegation;{" "}
        <code>src/lib/digest/send-operator-digest.test.ts</code> locks the shared helper&apos;s own
        ledger-read wiring independent of either caller.
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
        constitute renewed consent.
      </p>
      <p>
        A CAN-SPAM click is not the only way an address should stop receiving mail — a hard bounce
        (invalid/nonexistent mailbox) or a spam complaint damages sender reputation for every
        future send on the domain if the app keeps trying that address forever. <code>POST /api/
        resend/webhook</code> (<code>src/lib/email/resend-webhook.ts</code>) closes that gap:
        Resend signs delivery-event webhooks using the Svix scheme (<code>svix-id</code> /{" "}
        <code>svix-timestamp</code> / <code>svix-signature</code> headers, secret shaped{" "}
        <code>whsec_&lt;base64&gt;</code>, signed content{" "}
        <code>{"${id}.${timestamp}.${rawBody}"}</code> HMAC-SHA256&apos;d and compared via{" "}
        <code>timingSafeEqual</code> against every <code>v1,&lt;base64&gt;</code> entry in the
        (possibly multi-version, space-separated) signature header — same constant-time-compare
        discipline as <code>src/lib/auth/operator.ts</code> and the unsubscribe token above).
        Dormant (endpoint returns <code>501</code>) until an operator sets{" "}
        <code>RESEND_WEBHOOK_SECRET</code> — no <code>ALLOW_*</code> flag needed, since an unset
        secret alone makes the route refuse to process anything. Signature verification runs{" "}
        <em>before</em> rate limiting, mirroring{" "}
        <code>stripe-webhook-rate-limit-post-verify</code>&apos;s exact rationale: a
        pre-verification, IP-keyed gate would let an attacker impersonate Resend&apos;s sending
        IPs and burn out the bucket before a real redelivery from that IP ever reaches signature
        verification. On a verified <code>email.bounced</code> event, <code>
        isPermanentBounceEvent</code> suppresses unless the payload carries an explicit non-
        <code>Permanent</code> <code>bounce.type</code> (<code>Transient</code>/
        <code>Undetermined</code>) — a missing <code>bounce.type</code> is treated as permanent
        too, since Resend&apos;s own docs describe this event as firing only when the mail server
        permanently rejected the message. A verified <code>email.complained</code> event always
        suppresses (no sub-type to weigh). The suppression write passes{" "}
        <code>RESEND_WEBHOOK_SUPPRESSION_CONVEX_PRIMARY</code> (
        <code>src/lib/email/suppression-persist.ts</code>, same <code>requireConvex</code>{" "}
        reasoning as <code>UNSUBSCRIBE_CONVEX_PRIMARY</code>) and returns <code>500</code> on
        failure so Resend/Svix&apos;s own backoff-retry contract — the same one Stripe&apos;s
        webhook relies on — actually recovers the suppression instead of silently dropping it.
        Every other event type (delivered, opened, clicked, delivery_delayed, …) is acknowledged
        with <code>200</code> and ignored. Every suppression row now carries a{" "}
        <code>reason</code> (<code>unsubscribe</code> / <code>bounce</code> / <code>complaint</code>
        ; legacy rows written before this field shipped read as <code>unsubscribe</code>) so a
        routine CAN-SPAM opt-out is never conflated with a deliverability signal —{" "}
        <code>SuppressedEmailsPanel</code> shows a badge per reason with reason-specific removal
        guidance, and <code>computePipelineHealth</code> derives a rolling{" "}
        <code>recentBounceOrComplaintSuppressionCount</code> (bounces/complaints in the last 7
        days) plus <code>newestBounceOrComplaintSuppressionAgeHours</code> from{" "}
        <code>getSuppressedEmails()</code> — a rising count is the thing an operator can actually
        react to (list hygiene, a broken capture form, a compromised sending domain), unlike the
        permanently-suppressed total which only ever grows. The daily digest (
        <code>buildDailyDigest</code>, <code>src/lib/digest/daily-digest.ts</code>) shares the
        same two rolling fields — <code>sendDailyDigestAction</code> now calls{" "}
        <code>getSuppressedEmails()</code> alongside its other uncapped <code>list*</code> feeds
        and passes the result through as <code>suppressions</code>, which the digest renders as
        a footnote (not a due-queue action section, since a bounce/complaint rate is a scalar
        reputation signal rather than a per-row remediation) in both the empty-state and
        non-empty email bodies — a gap flagged but deliberately left as a follow-up when
        <code>suppression-reason-visibility</code> shipped the pipeline-health/dashboard half.
        A repeat suppression write for an already-suppressed address never downgrades{" "}
        <code>bounce</code>/<code>complaint</code> back to <code>unsubscribe</code>, but it{" "}
        <em>does</em> upgrade the other direction — an address that unsubscribed normally and
        later hard-bounces or draws a spam complaint gets its stored reason promoted via{" "}
        <code>preferSuppressionReason</code> (<code>src/lib/email/suppression.ts</code>, a
        rank-based <code>unsubscribe</code> &lt; <code>bounce</code> &lt; <code>complaint</code>{" "}
        helper mirroring <code>preferAdvancedHandoffStatus</code>&apos;s never-downgrade pattern),
        applied on both the Convex mutation (a conditional <code>patch</code>) and the SQLite
        fallback (a conditional <code>UPDATE</code> in place of the original blanket{" "}
        <code>INSERT OR IGNORE</code>, which silently discarded every reason change on an
        existing row in either direction). The row&apos;s <code>createdAt</code> stays untouched
        on an upgrade (Convex&apos;s <code>_creationTime</code> is an immutable system field), so
        a separate <code>reasonUpdatedAt</code> column/field is stamped with the current time on
        every upgrade (never on insert or a same-reason repeat call) and{" "}
        <code>suppressionRecencyMs</code> (<code>src/lib/email/suppression.ts</code>) — falling
        back to <code>createdAt</code> when a row has never been upgraded — is what{" "}
        <code>recentBounceOrComplaintSuppressionCount</code> and{" "}
        <code>newestBounceOrComplaintSuppressionAgeHours</code> actually key their 7-day window
        off, not <code>createdAt</code> directly, so an old-unsubscribe-then-new-bounce address
        correctly reads as recent. The Convex <code>suppress</code> mutation&apos;s dirty-check
        compares the computed <code>preferSuppressionReason</code> result against the{" "}
        <em>defaulted</em> existing reason (via <code>suppressionReasonOrDefault</code>), not the
        raw schema field — a row written before the <code>reason</code> column existed has{" "}
        <code>existing.reason === undefined</code>, and comparing the defaulted{" "}
        <code>&quot;unsubscribe&quot;</code> preferred value against that raw{" "}
        <code>undefined</code> made every repeat <code>suppress()</code> call for a legacy row
        look like an upgrade and unconditionally patch <code>reasonUpdatedAt</code>, never
        converging to a true no-op the way the SQLite fallback already did (its{" "}
        <code>suppression_list.reason</code> column is <code>NOT NULL DEFAULT &apos;unsubscribe&apos;</code>
        , so its <code>existing.reason</code> is never undefined for the same scenario).{" "}
        <code>SuppressedEmailsPanel</code> originally mirrored its <code>emails</code> prop into{" "}
        <code>useState(emails)</code>, which only seeds the initial value — every one of the
        dozens of <code>revalidatePath(&quot;/dashboard/leads&quot;)</code> calls across{" "}
        <code>actions.ts</code>, or a Resend webhook recording a fresh bounce/complaint while the
        dashboard sat open, re-rendered the server component with an updated{" "}
        <code>emails</code> list that this already-mounted client component never picked up,
        silently freezing the operator&apos;s sole CAN-SPAM audit view at whatever it showed on
        first mount. Fixed by deriving the rendered list directly from the{" "}
        <code>emails</code> prop and tracking only this panel&apos;s own optimistic{" "}
        <code>handleRemove</code> clicks in a small <code>removedEmails</code> set, pruned during
        render (not inside a <code>useEffect</code>, which the repo&apos;s{" "}
        <code>react-hooks/set-state-in-effect</code> lint rule rejects for a synchronous{" "}
        <code>setState</code>) once a fresh <code>emails</code> prop confirms the removal — so a
        later re-suppression of the same address (e.g. a new bounce after the operator&apos;s
        earlier &quot;Remove&quot;) surfaces immediately instead of staying hidden for the rest of
        the mounted session.
        Every
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
      <p>
        <code>LeadsClient</code> (<code>src/app/dashboard/leads/leads-client.tsx</code>) had the
        same <code>useState(initialX)</code>-never-resyncs shape{" "}
        <code>SuppressedEmailsPanel</code> was just fixed for, across nine arrays fed by{" "}
        <code>src/app/dashboard/leads/page.tsx</code> with no <code>key</code> on the rendered
        element — a prior pass had looked at this component and scoped it out as &quot;a
        materially different design,&quot; which turned out to be wrong for the primary{" "}
        <code>leads</code> array: any of the dozens of{" "}
        <code>revalidatePath(&quot;/dashboard/leads&quot;)</code> calls across{" "}
        <code>actions.ts</code>, a Stripe webhook recording a payment while the tab sits open, or
        a second tab&apos;s own edits refresh the <code>initialLeads</code> prop, but a lead this
        specific tab never itself touched via an optimistic handler stayed frozen at whatever
        stage/badge/quality-score it showed on first mount until a hard reload. Fixed only for{" "}
        <code>leads</code> in this pass (the other eight arrays — <code>handoffs</code>,{" "}
        <code>inquiries</code>, <code>checkoutSessions</code>, <code>marketingPacks</code>,{" "}
        <code>commerceCatalogs</code>, <code>clientVoicePacks</code>, <code>commerceOrders</code>,{" "}
        <code>commerceOrdersMissingClientReceipt</code> — share the same bug shape and are a
        documented follow-up): a new{" "}
        <code>mergeFreshLeadsPreservingInFlightEdits</code> helper (
        <code>src/lib/leads/optimistic-updates.ts</code>, beside{" "}
        <code>upsertSavedLeadBySlug</code>/<code>revertSingleLeadOptimisticUpdate</code>) adopts
        the fresh prop&apos;s row for every slug except one still mid an unconfirmed local edit,
        which keeps its current value instead. Of this component&apos;s 11{" "}
        <code>setLeads</code> call sites, only <code>handleStageChange</code>&apos;s classic
        pre-await optimistic write needed that in-flight protection — every other site patches a
        row only after its own server action already resolved, so the very same round trip&apos;s
        refreshed prop already agrees by the time it runs. Wired via the same render-time
        prop-resync idiom <code>SuppressedEmailsPanel</code> uses (a{" "}
        <code>prevInitialLeads</code> reference check, <code>setLeads</code> called directly in
        the render body rather than inside a <code>useEffect</code>, which this repo&apos;s{" "}
        <code>react-hooks/set-state-in-effect</code> lint rule rejects for a synchronous{" "}
        <code>setState</code>).
      </p>
      <p>
        First of the eight documented <code>leads-client-stale-prop-resync</code> follow-ups
        closed: <code>handoffs</code>. Picked first because it&apos;s fed by an external actor
        rather than only this component&apos;s own handlers — the Stripe{" "}
        <code>checkout.session.completed</code> webhook calls{" "}
        <code>enqueueProductionHandoff</code> to create/upsert a deploy handoff server-side the
        moment a customer pays, independent of anything the operator&apos;s own tab does. Left
        unfixed, a brand-new paying customer&apos;s handoff could stay invisible in the
        &quot;Paid, not live&quot; and &quot;Production deploy handoffs&quot; due-queues until a
        hard reload — a direct delay to the DNS/go-live fulfillment funnel these panels exist to
        drive. Traced all 5 <code>setHandoffs</code> call sites (
        <code>handleMarkHandoffLive</code>, <code>handleCreateDeployHandoff</code>,{" "}
        <code>handleAssignVercelProject</code>, <code>handleAssignCustomDomain</code>,{" "}
        <code>handleResendBundleBuyerEmail</code>) and confirmed every one patches only after its
        own <code>await</code> resolves — unlike <code>leads</code>&apos;{" "}
        <code>handleStageChange</code>, none writes optimistically beforehand, so no in-flight-edit
        merge helper is needed here: a plain wholesale adopt-on-prop-change (the same{" "}
        <code>prevInitialHandoffs</code> reference-check idiom, simplified) is sufficient and
        correct. The remaining seven arrays (<code>inquiries</code>, <code>checkoutSessions</code>
        , <code>marketingPacks</code>, <code>commerceCatalogs</code>, <code>clientVoicePacks</code>
        , <code>commerceOrders</code>, <code>commerceOrdersMissingClientReceipt</code>) stay a
        documented follow-up — <code>inquiries</code> (fed by the public contact-form route, also
        an external actor) is the suggested next pick.
      </p>
      <p>
        Closed out the remaining <code>leads-client-stale-prop-resync</code> follow-ups in one
        pass, immediately after a same-day sibling session merged the <code>handoffs</code> fix
        above: <code>inquiries</code>, <code>checkoutSessions</code>,{" "}
        <code>marketingPacks</code>, <code>commerceCatalogs</code>, <code>clientVoicePacks</code>,{" "}
        <code>commerceOrders</code>, and <code>commerceOrdersMissingClientReceipt</code> — plus a
        ninth array, the bundle-revenue <code>orders</code> ledger, which the original scoping
        pass hadn&apos;t named (it has no local setter at all, just{" "}
        <code>const [orders] = useState(initialOrders)</code>, so it was easy to miss, but it
        drives Starter-upsell eligibility, recurring-entitlement-paused detection, and the
        refund/dispute lists — all just as capable of silently drifting stale as any array with a
        setter). Traced every remaining <code>setX</code> call site across all seven setter-backed
        arrays (18 total) and confirmed every one patches only after its own <code>await</code>{" "}
        resolves, matching <code>handoffs</code> — none needed the in-flight-edit merge{" "}
        <code>leads</code> alone requires. Rather than copy the{" "}
        <code>prevInitialHandoffs</code>-style reference-check idiom eight more times by hand (the
        exact kind of repeated boilerplate that risks a future ninth array copying it wrong), factored
        it into a shared <code>useResyncedState&lt;T&gt;</code> hook defined once in{" "}
        <code>leads-client.tsx</code> — still an in-render adjustment (never a{" "}
        <code>useEffect</code>, which this repo&apos;s <code>react-hooks/set-state-in-effect</code>{" "}
        rule rejects), just generic over the array type so each of the nine call sites is a
        one-line <code>useResyncedState(initialX)</code> instead of a five-line block. Folded the
        sibling session&apos;s already-merged inline <code>handoffs</code> fix into the same shared
        hook for consistency (same behavior, same dual-build-collision fold pattern this log
        documents elsewhere) rather than leaving one array fixed inline and eight fixed via a
        helper. Every array <code>LeadsClient</code> receives as an <code>initialX</code> prop now
        resyncs on a fresh server render; only <code>leads</code> keeps its own bespoke merge
        logic, for the one genuinely different (pre-await optimistic) reason documented above.
      </p>
      <p>
        That bespoke <code>leads</code> in-flight tracker itself carried a race: it was a bare{" "}
        <code>Set&lt;string&gt;</code> of slugs (presence/absence), not a reference count. The
        main-table stage <code>&lt;select&gt;</code> and a due-queue action button (e.g. &quot;Send
        Email 1&quot;) can both target the same visible lead without either disabling itself while
        pending, so two overlapping <code>handleStageChange</code> calls on one slug were
        reachable. The first call to resolve unconditionally deleted the slug from the set even
        though the second call was still in flight — a <code>revalidatePath</code> landing in that
        window (an unrelated lead&apos;s edit, a webhook, a second tab) then read the slug as
        settled and overwrote the row with the fresh prop, silently discarding the second
        call&apos;s still-pending optimistic edit before it had even resolved. Fixed by turning the
        tracker into a per-slug reference count (
        <code>incrementInFlightCount</code>/<code>decrementInFlightCount</code>,{" "}
        <code>src/lib/leads/optimistic-updates.ts</code>): a slug now reads as in-flight, and is
        protected from being overwritten by <code>mergeFreshLeadsPreservingInFlightEdits</code>,
        until every overlapping call on it has settled, not just the first one.
      </p>
      <p>
        <code>src/lib/db.ts</code> (the Convex-first/SQLite-fallback orchestration layer every
        surface above ultimately writes and reads through) carries a{" "}
        <code>&quot;server-only&quot;</code> guard, which throws unconditionally outside a
        Next.js server render — the reason every consumer test in this repo mocks{" "}
        <code>@/lib/db</code> away entirely rather than importing it for real. That left the
        actual <code>if (convexClient) {"{"} try {"{"} ...; return; {"}"} catch {"{"}{" "}
        ...fallback... {"}"} {"}"} ... SQLite fallback</code> branch-selection code — not the pure
        helpers it delegates to, which already had isolated coverage — with zero automated
        coverage of its own, only manual <code>npm run dev</code> smoke checks. A regression
        there (a missing <code>return;</code> after a Convex success causing a silent
        double-write, or a flipped <code>shouldFallbackToSqliteOnConvexFailure</code> condition)
        would pass tsc/lint/the full mocked Vitest suite and a routine dev smoke check, and only
        surface in production as a split-brain write or a duplicate external side effect.{" "}
        <code>src/lib/db.test.ts</code> closes the gap for representative shapes every other
        db.ts export shares — <code>getLeads</code>/<code>getLeadBySlug</code>/
        <code>upsertLead</code>&apos;s ordinary soft-fallback reads/writes,{" "}
        <code>updateLeadBufferPostedVariantKeys</code>&apos;s <code>requireConvex</code>{" "}
        fail-closed write, <code>recordSubscriptionRenewalPayment</code>&apos;s money-ledger
        write, and the recurring-entitlement pause/resume/re-tier trio (
        <code>markOrdersRecurringCanceledByCustomer</code>/
        <code>clearOrdersRecurringCanceledByCustomer</code>/
        <code>syncOrdersRecurringEntitlementByCustomer</code>) — by mocking{" "}
        <code>&quot;server-only&quot;</code> to a no-op and{" "}
        <code>convex/browser</code>&apos;s <code>ConvexHttpClient</code> to a controllable fake,
        then importing the real db.ts module (fresh per scenario via{" "}
        <code>vi.resetModules()</code>) against that fake client and a real but isolated
        temp-directory SQLite file (<code>process.cwd()</code> spied per test, deleted in{" "}
        <code>afterEach</code>) — exercising the actual branch-selection code rather than a second
        reimplementation of its logic.
      </p>
      <p>
        <code>recordSubscriptionRenewalPayment</code> specifically closes a distinct risk from the
        other two: its SQLite-fallback branch is a hand-written duplicate of the
        accrual/idempotency/entitlement-filtering logic <code>convex/orders.ts</code>&apos;s own
        mutation already has direct coverage for (<code>convex/orders.test.ts</code>) — the same
        duplicated-logic bug class as{" "}
        <code>convex-orders-recurring-entitlement-duplicate-fix</code> — and had never been
        exercised by any automated test on a SQLite-only deployment (no{" "}
        <code>NEXT_PUBLIC_CONVEX_URL</code>, a fully supported mode). The new cases cover
        Convex-success early-return, the <code>requireConvex</code> fail-closed throw, SQLite
        accrual + invoice-redelivery idempotency, and the SQLite entitlement filter (a
        non-recurring Starter-tier order is correctly skipped).
      </p>
      <p>
        The recurring-entitlement pause/resume/re-tier trio shares that same duplicated-logic
        risk — each has a Convex mutation with direct coverage in{" "}
        <code>convex/orders.test.ts</code> and a hand-written SQLite-fallback branch that had
        never been exercised by any automated test, and together they drive the pause state every
        &quot;is this lead currently entitled&quot; consumer (Buy now/catalog sync, digest,
        dashboard) reads. The new cases cover each function&apos;s Convex-success early-return and{" "}
        <code>requireConvex</code> fail-closed throw, plus SQLite-fallback behavior: canceling
        only the customer&apos;s recurring-entitlement order (never a Starter-tier sibling on the
        same customer) and idempotence on a repeat pause event; clearing a paused order and
        idempotence on a repeat resume event; and re-tiering a Growth order to Complete +
        Commerce, refusing a non-recurring sync target before touching Convex or SQLite at all,
        and idempotence once the row already matches the target.
      </p>
      <p>
        The eight refund/dispute mark-and-clear pairs — bundle orders&apos;{" "}
        <code>markOrderRefunded</code>/<code>clearOrderRefunded</code>/
        <code>markOrderDisputed</code>/<code>clearOrderDisputed</code> and Commerce Buy now
        orders&apos; <code>markCommerceOrderRefunded</code>/
        <code>clearCommerceOrderRefunded</code>/<code>markCommerceOrderDisputed</code>/
        <code>clearCommerceOrderDisputed</code> — share the identical duplicated-logic risk
        again: each has a Convex mutation with direct coverage in{" "}
        <code>convex/orders.test.ts</code>/<code>convex/commerceOrders.test.ts</code>, and a
        hand-written single-<code>UPDATE</code> SQLite fallback that had never been exercised by
        any automated test. These flip the exact booleans every refund/dispute/clawback-visibility
        reader depends on (<code>isCommerceOrderOwed</code>,{" "}
        <code>orderEligibleForBillingPortal</code>, the bundle and Commerce refund/dispute
        due-queue panels) — a broken <code>WHERE</code> clause or a missing early-return here
        would silently misstate money already refunded or disputed on a SQLite-only deployment.
        The new cases cover each pair&apos;s Convex-success early-return,{" "}
        <code>requireConvex</code> fail-closed throw, and SQLite-fallback mark/clear idempotency
        (a redelivered mark must not overwrite an earlier timestamp; a redelivered clear on an
        already-clear row is a no-op).
      </p>
      <p>
        <code>markCommerceOrderPaidOut</code> gets its own coverage beyond that shape: its SQLite
        fallback (<code>sqliteMarkCommerceOrderPaidOut</code>,{" "}
        <code>src/lib/db/sqlite-queries.ts</code>) re-verifies{" "}
        <code>refundedAt</code>/<code>disputedAt</code>/<code>paidOutAt</code> atomically with
        the write itself (<code>commerce-order-paid-out-refund-race-guard</code>) so an
        independent Stripe webhook recording a refund or dispute in the window between an
        operator&apos;s stale read and this call can never leave an order both paid out and
        refunded/disputed. Convex&apos;s own <code>markPaidOut</code> mutation already had a
        direct test proving that same atomic rejection (
        <code>convex/commerceOrders.test.ts</code>); the new SQLite-fallback case seeds a
        commerce order, marks it refunded via the SQLite path, then confirms{" "}
        <code>markCommerceOrderPaidOut</code> returns <code>false</code> and leaves{" "}
        <code>paidOutAt</code> unset — plus ordinary mark/idempotent-redelivery coverage matching
        the mark-and-clear pairs above.
      </p>
      <p>
        That atomic guard fails closed for three distinct causes — a refund, a dispute, or a
        concurrent duplicate <em>Mark paid out</em> click (two dashboard tabs open, or a click
        landing before the button&apos;s pending-disabled state takes effect) — but{" "}
        <code>markCommerceOrderPaidOutAction</code> used to report a single hardcoded
        &quot;refunded or disputed&quot; message for all three (
        <code>commerce-order-paid-out-race-message-accuracy</code>). An operator who won the race
        against their own other tab would see a false claim that Stripe reversed money on an
        order that was, in fact, successfully paid out — by the other click — with no refund or
        dispute involved. The action now re-fetches the order after a failed write and reports
        the actual current state: already paid out, refunded, or disputed, falling back to the
        original generic wording only if none of those fields explain the failure.
      </p>
      <p>
        <code>markMarketingPackSentToClient</code>/<code>markCommerceOrderClientReceiptSent</code>/
        <code>markClientVoicePackSentToClient</code> share a third shape: a single-field sent-marker
        guarded by <code>WHERE ... IS NULL OR ... = &apos;&apos;</code> (
        <code>sqliteMarkMarketingPackSentToClient</code>/
        <code>sqliteMarkCommerceOrderClientReceiptSent</code>/
        <code>sqliteMarkClientVoicePackSentToClient</code>,{" "}
        <code>src/lib/db/sqlite-queries.ts</code>) that returns whether the row was actually
        (re-)marked rather than <code>void</code> — the exact boolean the webhook/dashboard
        redelivery-recovery contract depends on to decide whether a send still needs to happen.
        Each Convex mutation already had direct coverage; the SQLite fallback branch — including
        that it resolves <code>false</code>, not just a silent no-op, on a redelivered mark with a
        different timestamp — had none. The new cases cover each function&apos;s Convex-success
        early-return, <code>requireConvex</code> fail-closed throw, and SQLite-fallback
        mark-then-redeliver idempotency.
      </p>
      <p>
        <code>updateLeadStripeConnectAccountId</code>/<code>updateLeadStripeConnectStatus</code> —
        the dormant Stripe Connect Express onboarding scaffold&apos;s own two{" "}
        <code>requireConvex</code> fail-closed writes — shared the same previously-uncovered
        shape: each has a Convex mutation with direct coverage (
        <code>convex/leads.test.ts</code>&apos;s <code>updateStripeConnectAccountId</code>/
        <code>updateStripeConnectStatus</code>) and a hand-written SQLite-fallback branch that no
        automated test ever exercised (every action/webhook test that calls these mocks{" "}
        <code>@/lib/db</code> away entirely). <code>getLeads</code>/<code>getLeadBySlug</code> read
        Convex-first, and <code>connectOnboardingIncompleteCount</code> (pipeline-health/digest)
        reads this same cache cross-instance, so a broken SQLite fallback would silently misstate
        the onboarding-incomplete due-queue on a SQLite-only deployment. The new cases cover each
        function&apos;s Convex-success early-return, <code>requireConvex</code> fail-closed throw,
        SQLite-fallback write + not-found guard, and — specific to the account-id function —
        that a later call never overwrites an already-set <code>stripeConnectAccountCreatedAt</code>{" "}
        (the <code>COALESCE</code> set-once semantics the onboarding-incomplete staleness signal
        depends on).
      </p>
      <p>
        <code>convex/leads.ts</code>&apos;s <code>updateBufferProfileIds</code>/
        <code>updateBufferPostedVariantKeys</code> mutations — backing the dormant Buffer
        marketing-scheduling scaffold&apos;s own Convex-first writes (an operator&apos;s chosen
        Buffer profile mapping for a lead, and the set of marketing-pack variant keys already
        auto-posted so a repeat click never double-posts) — had a different gap than every other
        <code>convex/leads.ts</code> mutation: their SQLite-fallback branches (
        <code>updateLeadBufferProfileIds</code>/<code>updateLeadBufferPostedVariantKeys</code>,{" "}
        <code>src/lib/db.ts</code>) already had direct <code>db.test.ts</code> coverage from the
        earlier write-family series, but the Convex mutation handlers themselves — the{" "}
        <code>requireApiSecret</code> check, the <code>by_slug</code> not-found throw, and the
        actual <code>ctx.db.patch</code> write — were never exercised directly in{" "}
        <code>convex/leads.test.ts</code>; every reference to either mutation name elsewhere in the
        test suite goes through a mock that replaces Convex entirely. Structurally identical
        sibling mutations in the same file (<code>updateStripeConnectAccountId</code>/
        <code>updateStripeConnectStatus</code>) already had this direct coverage, so the gap was an
        oversight rather than a deliberate omission — a broken <code>apiSecret</code> check here
        would let any caller rewrite another lead&apos;s Buffer wiring, and a broken not-found guard
        or field-name drift would silently no-op a save the operator&apos;s dashboard shows as
        successful. The new <code>convex/leads.test.ts</code> cases cover the not-found throw, a
        full-replacement patch (including that a shorter follow-up call actually shrinks the stored
        list rather than merging with the prior value), and the <code>apiSecret</code>-rejection
        case for both mutations.
      </p>
      <p>
        <code>src/app/dashboard/leads/leads-client.tsx</code>&apos;s Leads table — the only{" "}
        <code>&lt;table&gt;</code> anywhere under <code>src/app/dashboard</code> or{" "}
        <code>src/components/dashboard</code>, and the operator&apos;s primary daily data grid —
        had none of its 7 <code>&lt;th&gt;</code> header cells marked <code>scope=&quot;col&quot;</code>.
        Without it, a screen-reader user navigating the table cell-by-cell (NVDA/JAWS table mode,
        VoiceOver&apos;s table rotor) does not get the column header reliably announced when
        landing on a data cell — a WCAG 1.3.1 (Info and Relationships) gap distinct from the
        already-shipped focus-restore sweeps above, which addressed keyboard focus after
        row-removing actions, never table header/data-cell association. The same defect (zero{" "}
        <code>scope=&quot;col&quot;</code> anywhere) was present in every one of the ten{" "}
        <code>/docs/**</code> pages that render a <code>&lt;table&gt;</code> (this page included)
        — all single-header-row tables of plain <code>&lt;th&gt;Text&lt;/th&gt;</code> cells —
        and got the identical fix in the same pass.
      </p>
      <p>
        A fresh-angle accessibility audit (form validation error announcements, distinct from
        the completed table-header-scope and focus-restore sweeps) found five{" "}
        <code>leads-client.tsx</code> forms that routed a failed operator action through a bare{" "}
        <code>alert()</code> popup instead of the established inline-error pattern already used
        by Operator notes (<code>notesError</code>) — the Commerce catalog SKU editor&apos;s
        Save catalog action, the Vercel project ID and custom domain assignment inputs on the
        Production deploy handoffs panel, and the Website inquiries reply composer. A blocking{" "}
        <code>alert()</code> is announced to screen readers, but it interrupts the whole page
        rather than surfacing a persistent, input-associated message the operator can review
        while correcting the field — and unlike the notes/add-lead/CSV-import forms, none of the
        five associated their error with the failing control via <code>aria-invalid</code>/
        <code>aria-describedby</code>. Fixed by giving each its own error state (
        <code>commerceCatalogError</code>, <code>vercelProjectErrors</code>/
        <code>customDomainErrors</code> keyed by lead slug since multiple handoff cards render at
        once, and a single <code>replyError</code> since only one reply composer can be open at a
        time) and rendering a <code>role=&quot;alert&quot;</code> message wired via{" "}
        <code>aria-describedby</code> to the Vercel project ID input, the custom domain input,
        and the reply textarea; the Commerce catalog error is announced the same way but not
        input-associated, since a save failure names a specific SKU row rather than the editor as
        a whole. No behavior changed for a successful save/send — only the failure path.
      </p>
      <p>
        A fresh-angle accessibility audit (heading hierarchy / landmark structure, distinct from
        the completed table-header-scope, focus-restore, and form-error-announcement sweeps)
        confirmed landmarks and heading order are clean everywhere except one gap: the Leads
        table itself — the operator dashboard&apos;s busiest content region — had no{" "}
        <code>&lt;h2&gt;</code> of its own. It sat directly after the due-queue panels&apos; own{" "}
        <code>&lt;h2&gt;</code> sections, and each row&apos;s expandable detail panels used{" "}
        <code>&lt;h3&gt;</code>/<code>&lt;h4&gt;</code> (Marketing pack, Commerce catalog, Client
        voice FAQ pack, Auto-post to Buffer) with no governing <code>&lt;h2&gt;</code> to nest
        under. A screen reader user navigating by heading (NVDA/JAWS &quot;H&quot; key, VoiceOver&apos;s
        rotor) got an outline that silently omitted the leads table and mis-nested every row-panel
        heading under whichever due-queue panel or form happened to render last — a WCAG 1.3.1 /
        2.4.6 gap. Fixed by adding <code>&lt;h2 id=&quot;all-leads-heading&quot;&gt;All
        leads&lt;/h2&gt;</code> immediately before the Kanban stage-filter buttons and table,
        mirroring the id + <code>tabIndex=&#123;-1&#125;</code> +{" "}
        <code>focus:outline-none</code> convention every due-queue panel&apos;s own heading
        already uses. Purely additive — no layout, landmark, or behavior change otherwise.
      </p>
      <p>
        A fresh-angle accessibility audit (distinct from table scope, focus-restore, form-error
        announcements, dialog focus-trapping — ruled out, no real modals exist — heading hierarchy,
        and color contrast, all already closed) found the Leads table&apos;s Quality column badge
        exposed the score&apos;s factor breakdown (e.g. &quot;Missing email — cannot outreach&quot;)
        exclusively through the native <code>title</code> attribute on a plain, non-interactive{" "}
        <code>&lt;span&gt;</code>. A native title tooltip only fires on mouse hover for a
        non-focusable element, so a keyboard-only operator tabbing through the table, a screen
        reader user, and a touch/mobile operator could see the bare score and band but never the
        factors explaining it — the only place in the app that surface renders. Fixed by replacing
        the span with a native <code>&lt;details&gt;</code>/<code>&lt;summary&gt;</code> disclosure:
        the summary carries the same score/band badge styling and an{" "}
        <code>aria-label</code> naming it as a factor-revealing control, and the factor list renders
        as a visible <code>&lt;ul&gt;</code> once expanded — keyboard-focusable and
        toggleable with Enter/Space natively, with no new client-side state needed. The Work next
        due-queue panel&apos;s own quality badge already lists its top factors inline as visible
        text (never hidden behind title), so this fix was scoped to the one remaining gap.
      </p>
      <p>
        <code>markCheckoutSessionComplete</code>/<code>markCheckoutSessionOpen</code>/
        <code>markCompleteOpenBundleCheckoutSessionsForLead</code>/
        <code>markCompleteOpenCommerceCheckoutSessionsForLeadSkuCustomer</code> are the Stripe
        webhook&apos;s own <code>requireConvex</code> fail-closed writes that flip{" "}
        <code>checkout_sessions.status</code> — the exact boolean{" "}
        <code>listOpenCheckoutSessions</code>/abandoned-recovery due queues read to decide whether
        to email a Finish-checkout / Buy now recovery nudge. Each has a Convex mutation with direct
        coverage (<code>convex/checkoutSessions.test.ts</code>) and a hand-written SQLite-fallback
        branch that only ever ran through{" "}
        <code>src/app/api/stripe/webhook/route.test.ts</code>&apos;s full <code>@/lib/db</code>{" "}
        mock — this module&apos;s own real orchestration for these four writes had no automated
        coverage until now. The new cases cover each function&apos;s Convex-success early-return
        (without touching SQLite), <code>requireConvex</code> fail-closed throw, and SQLite-fallback
        behavior: completing and re-opening a session by id, closing only sibling open{" "}
        <em>bundle</em> sessions for a lead (never the excepted session or a commerce_sku sibling),
        and closing only sibling open <em>commerce_sku</em> sessions matching the same lead + SKU +
        customer email (case/whitespace-insensitive, never a different SKU or customer) — plus the
        blank-email short-circuit that returns <code>0</code> without calling Convex or SQLite at
        all.
      </p>
      <p>
        <code>upsertCommerceCatalog</code> is the Commerce SKU catalog&apos;s own{" "}
        <code>requireConvex</code>-optional write — the dashboard&apos;s Save catalog and Sync to
        Stripe actions&apos; persistence step, and every Buy now / catalog-visibility reader
        (<code>getCommerceCatalog</code>, <code>listCommerceCatalogs</code>) reads it back
        Convex-first. It has a Convex mutation with direct coverage (
        <code>convex/commerceCatalogs.test.ts</code>) and a hand-written SQLite{" "}
        <code>INSERT ... ON CONFLICT(leadSlug) DO UPDATE</code> fallback that no automated test
        ever exercised (every action test that calls it mocks <code>@/lib/db</code> away
        entirely) — a broken fallback here could silently corrupt a client&apos;s SKU list or
        desync <code>stripeProductId</code>/<code>stripePriceId</code> mappings on a SQLite-only
        deployment, blocking Buy now entirely. The new cases cover the Convex-success
        early-return (without touching SQLite), <code>requireConvex</code> fail-closed throw,
        SQLite-fallback create, that a second SQLite-fallback upsert genuinely{" "}
        <em>replaces</em> the row&apos;s items and <code>updatedAt</code> rather than merging
        (a stale SKU must not survive a save that removed it), and that{" "}
        <code>listCommerceCatalogs</code> returns SQLite-fallback-written rows newest{" "}
        <code>updatedAt</code> first.
      </p>
      <p>
        <code>applyColdLeadDisposition</code> shares <code>updateLeadStage</code>&apos;s exact
        risk shape: a Convex mutation with direct coverage (
        <code>convex/leads.test.ts</code>&apos;s cold-lead-disposition paid/live race-guard tests)
        and a hand-written SQLite fallback (<code>sqliteApplyColdLeadDisposition</code>,{" "}
        <code>src/lib/db/sqlite-queries.ts</code>) duplicating the same paid/live revert guard —{" "}
        <code>disposeColdLeadAction</code>&apos;s Re-engage/Close actions funnel through this, and
        a drift between the two backends&apos; guards would let a stale/racing disposition write
        silently revert a paying or live customer&apos;s stage back to closed/discovered on a
        SQLite-only deployment. The new cases cover the Convex-success early-return (trusting
        Convex&apos;s returned boolean directly rather than recomputing via SQLite),{" "}
        <code>requireConvex</code> fail-closed throw, SQLite-fallback write + not-found guard, and
        that the SQLite fallback rejects a stage revert for both a <code>paid</code> and a{" "}
        <code>live</code> lead while still allowing an ordinary write for a lead in an earlier
        stage.
      </p>
      <p>
        <code>recordLeadOutreach</code> shares that same duplicated-logic risk again: its SQLite
        fallback (<code>sqliteRecordLeadOutreach</code>, <code>src/lib/db/sqlite-queries.ts</code>)
        re-implements both the paid/live/closed revert guard and a monotonic{" "}
        <code>outreachStep</code> guard (a double-click or two concurrent operator tabs must not
        re-send the same Email 1/2/3) that <code>convex/leads.ts</code>&apos;s{" "}
        <code>recordOutreach</code> mutation already has direct coverage for — the SQLite twin&apos;s
        copy of both guards had never been exercised. <code>recordLeadPreviewOpen</code>/
        <code>updateLeadNotes</code>/<code>updateLeadSnooze</code>/
        <code>updateLeadBufferProfileIds</code> are the plain single-field lead-attribute writes in
        this same <code>requireConvex</code> fail-closed family — each just a not-found guard plus
        one <code>UPDATE</code> (or, for <code>recordLeadPreviewOpen</code> only, a no-op instead of
        a throw on a missing slug, since it fires from an unauthenticated public beacon route for
        slug-inferred demo leads) — closed together in one pass. The new cases cover each
        function&apos;s Convex-success early-return, <code>requireConvex</code> fail-closed throw,
        SQLite-fallback write/clear + not-found (or no-op) guard, and — specific to{" "}
        <code>recordLeadOutreach</code> — that the SQLite fallback rejects the write for a
        paid/live/closed lead and for a duplicate/stale outreach step.
      </p>
      <p>
        <code>insertDeployHandoff</code>/<code>updateDeployHandoffStatus</code>/
        <code>updateDeployHandoffVercelProject</code>/<code>updateDeployHandoffCustomDomain</code>{" "}
        are the deploy-handoff write family every sold bundle checkout funnels through via{" "}
        <code>src/lib/deploy/handoff.ts</code>, always called with <code>requireConvex: true</code>{" "}
        — every consumer test (<code>handoff.test.ts</code>, the webhook route test, the dashboard
        actions test) mocks <code>&quot;@/lib/db&quot;</code> away entirely, so this module&apos;s own
        orchestration for all four had zero automated coverage until now.{" "}
        <code>updateDeployHandoffStatus</code> carries its own duplicated-logic risk shared with{" "}
        <code>updateLeadStage</code>/<code>applyColdLeadDisposition</code>/
        <code>recordLeadOutreach</code> above: its SQLite fallback re-implements{" "}
        <code>preferAdvancedHandoffStatus</code>&apos;s never-downgrade guard (a concurrent Mark
        live during a webhook&apos;s post-Resend status patch must not regress status back to{" "}
        <code>awaiting_dns</code>) with its own Convex mutation counterpart already covered (
        <code>convex/deployHandoffs.test.ts</code>) but the SQLite twin never exercised.{" "}
        <code>updateDeployHandoffCustomDomain</code> carries a second distinct risk: its SQLite
        fallback (<code>sqliteUpdateDeployHandoffCustomDomain</code>,{" "}
        <code>src/lib/db/sqlite-queries.ts</code>) re-implements the same www/apex
        alias-uniqueness conflict check the Convex mutation enforces — a broken SQLite-side check
        would let two leads silently share one custom domain on a SQLite-only deployment, exactly
        the split-brain <code>custom-domain-normalize-and-unique</code> exists to prevent. The new
        cases cover each function&apos;s Convex-success early-return (without touching SQLite),{" "}
        <code>requireConvex</code> fail-closed throw, SQLite-fallback not-found guard,{" "}
        <code>insertDeployHandoff</code>&apos;s full-row-replace-on-upsert behavior,{" "}
        <code>updateDeployHandoffStatus</code>&apos;s never-downgrade-but-still-append-notes case,{" "}
        <code>updateDeployHandoffVercelProject</code>&apos;s set-then-clear-via-null round trip, and{" "}
        <code>updateDeployHandoffCustomDomain</code>&apos;s URL-to-bare-hostname normalization,
        www-alias conflict rejection, and clear-via-null.
      </p>
      <p>
        <code>insertClientInquiry</code>/<code>updateClientInquiryStatus</code>/
        <code>recordClientInquiryReply</code>/<code>recordCheckoutSessionCreated</code> are the
        contact-form CRM and checkout-session-tracking writes the public contact route, the Stripe
        checkout routes, and the dashboard reply/status actions call with{" "}
        <code>requireConvex: true</code> — every consumer test mocks{" "}
        <code>&quot;@/lib/db&quot;</code> away entirely, so this module&apos;s own orchestration
        for all four had zero automated coverage until now.{" "}
        <code>updateClientInquiryStatus</code>/<code>recordClientInquiryReply</code> share a
        distinct branch neither of the writes above needed: when Convex is configured and
        <code>requireConvex</code> is set but the mutation resolves <code>null</code> (inquiry not
        found on the shared store), the code must return <code>null</code> directly rather than
        inventing an answer from instance-local SQLite — a broken guard there would let one
        instance silently &quot;find&quot; a row the shared store has already deleted or
        never had. <code>recordCheckoutSessionCreated</code>&apos;s SQLite fallback also has an{" "}
        <code>INSERT ... ON CONFLICT(stripeSessionId) DO NOTHING</code> dedup clause that had never
        been exercised — Stripe can call the checkout-create route more than once for the same
        session in a retry, and a broken dedup would let a redelivered create silently overwrite an
        already-tracked session&apos;s tier/customer fields. The new cases cover each
        function&apos;s Convex-success early-return (without touching SQLite),{" "}
        <code>requireConvex</code> fail-closed throw, SQLite-fallback not-found guards, and — for{" "}
        <code>recordClientInquiryReply</code> — the <code>inquiry-reply-archive-race-guard</code>{" "}
        rejecting a reply against an inquiry a concurrent archive already closed. A fifth case
        confirms <code>insertClientInquiry</code>&apos;s SQLite-fallback write still soft-caps an
        over-length message via <code>normalizeContactFormFields</code> rather than persisting it
        raw.
      </p>
      <p>
        <code>listDeployHandoffs</code> and <code>getLeadSlugByCustomDomain</code> extended this
        series to READ functions for the first time — every function above has a Convex mutation
        with direct coverage and an untested SQLite-fallback <em>write</em> branch, while these two
        instead have an untested SQLite-fallback <em>read</em> branch (a raw{" "}
        <code>db.prepare(...).all()</code>/<code>.get()</code>, never delegated to a tested pure
        helper). <code>getLeadSlugByCustomDomain</code> is <code>src/proxy.ts</code>&apos;s
        Host-based routing identity lookup for every sold custom domain — its www/apex alias loop
        (<code>customDomainHostAliases</code>) runs independently on the Convex path (one query per
        alias until a hit) and the SQLite path (one <code>.get()</code> per alias); a broken loop on
        either side would silently misroute a visitor to the wrong client&apos;s storefront (or no
        storefront at all) under a real paying customer&apos;s own domain, with nothing in the test
        suite to catch it before now. <code>listDeployHandoffs</code> shares the family&apos;s{" "}
        <code>ORDER BY createdAt DESC</code> SQLite fallback with no prior automated proof it
        actually sorts newest-first. Both regressions (an alias loop that only checks the first
        candidate; an <code>ASC</code> instead of <code>DESC</code> sort) were verified to fail the
        new tests before being reverted.
      </p>
      <p>
        <code>listClientInquiries</code>/<code>listUnrepliedInquiries</code>/
        <code>listClientInquiriesBySlug</code>/<code>listCommerceCheckoutInquiriesBySlug</code> and{" "}
        <code>listMarketingPacksForMonth</code>/<code>listClientVoicePacks</code> closed out the
        remaining read-family candidates named by the prior iteration. Each shares the same
        untested-SQLite-fallback shape: an <code>ORDER BY createdAt</code>/<code>generatedAt DESC</code>{" "}
        that must stay newest-first to match its Convex twin, and — for the slug/status/
        source-scoped functions — a <code>WHERE</code> clause that must not leak another lead&apos;s
        inquiries or a non-<code>commerce_checkout</code> inquiry into a money-adjacent dedup list (
        <code>listCommerceCheckoutInquiriesBySlug</code> backs Commerce Buy now webhook session
        dedup). <code>insertClientInquiry</code> always stamps <code>createdAt</code> from the real
        clock with no override parameter, so the four inquiry-list ordering tests backdate a seeded
        row via a second raw <code>node:sqlite</code> connection to the same temp-dir database file
        rather than a lower-level pure-helper extraction —{" "}
        <code>upsertMarketingPack</code>/<code>upsertClientVoicePack</code> already accept{" "}
        <code>generatedAt</code> as a plain input field, so their ordering tests needed no such
        workaround. A dropped <code>DESC</code> sort was verified to fail the new{" "}
        <code>listClientInquiries</code> test before being reverted. With this pass, every read
        function named across the db-ts SQLite-fallback test-coverage series has direct
        orchestration coverage.
      </p>
      <p>
        <code>recordLeadPayment</code> and <code>insertCommerceOrder</code> — the bundle and
        Commerce Buy now money-ledger writes every Stripe checkout ultimately funnels through —
        were the last remaining <em>money-critical</em> gap in this series: both are idempotent on{" "}
        <code>stripeSessionId</code> (a redelivered <code>checkout.session.completed</code> must
        never double-record a sale) and had zero automated coverage of their own Convex-first/
        SQLite-fallback orchestration — every consumer test mocks <code>&quot;@/lib/db&quot;</code>{" "}
        away entirely. <code>recordLeadPayment</code>&apos;s SQLite fallback carries a third risk
        beyond idempotency: it creates a payment-stub lead for an organic/no-CRM buyer when none
        exists, but never regresses an already-<code>live</code> lead&apos;s stage back to{" "}
        <code>paid</code> on a later upsell purchase (mirroring <code>markLeadPaid</code>&apos;s
        own guard on the Convex side) — the order write itself always runs regardless. The new
        cases cover both functions&apos; Convex-success early-return,{" "}
        <code>requireConvex</code> fail-closed throw, SQLite-fallback insert (stub-lead creation,
        existing-lead promotion, and the live-stage guard for <code>recordLeadPayment</code>;
        quantity/customerEmail persistence for <code>insertCommerceOrder</code>), and
        redelivery idempotency (a second call with the same <code>stripeSessionId</code> reports{" "}
        <code>alreadyRecorded: true</code> and leaves the first row&apos;s fields untouched).
      </p>
      <p>
        <code>upsertMarketingPack</code>/<code>upsertClientVoicePack</code> (full-row{" "}
        <code>ON CONFLICT</code> replace, not a merge — regenerating always clears{" "}
        <code>sentToClientAt</code> per <code>marketing-voice-pack-client-send-visibility</code>),{" "}
        <code>suppressEmail</code>/<code>unsuppressEmail</code> (the CAN-SPAM opt-out list, whose
        SQLite fallback carries its own <code>preferSuppressionReason</code> upgrade-not-downgrade
        guard from <code>suppression-reason-upgrade-not-just-downgrade-guard</code> — a later
        weaker <code>unsubscribe</code> must never overwrite an already-recorded <code>bounce</code>{" "}
        or <code>complaint</code>), and <code>recordCheckoutRecoverySent</code> (the abandoned-cart
        recovery send-marker, whose <code>checkout-session-recovery-race-guard</code> must return{" "}
        <code>false</code> and write nothing once a session is no longer <code>open</code>) close
        out the remaining <code>requireConvex</code>-gated write family this whole series has been
        mining — a fresh grep of every <code>requireConvex</code>/
        <code>ConvexPrimaryWriteError</code> call site in <code>src/lib/db.ts</code> against{" "}
        <code>db.test.ts</code>&apos;s describe-block list confirms no gap remains as of this pass.
      </p>

      <h2>5. Platform voice agent</h2>
      <p>Vapi/Retell → <code>/api/voice/platform/webhook</code> → site config updater + Stripe checkout link.</p>

      <h2 id="payments">6. Payments (self-serve)</h2>
      <p>
        <code>POST /api/stripe/checkout</code> creates a real Stripe Checkout Session (501 only
        when Price IDs / secret key are missing). Route-level Vitest coverage in{" "}
        <code>src/app/api/stripe/checkout/route.test.ts</code> locks organic slug minting, Price ID
        line items, cancel URL attribution, and requireConvex fail-closed session tracking (create-side
        twin of the webhook orchestration suite). Both this route and{" "}
        <code>POST /api/commerce/checkout</code> accept an optional client-minted{" "}
        <code>idempotencyKey</code> (<code>parseClientIdempotencyKey</code>,{" "}
        <code>src/lib/checkout/idempotency-key.ts</code>) passed through to{" "}
        <code>stripe.checkout.sessions.create</code> as the request&apos;s{" "}
        <code>Idempotency-Key</code> — the checkout forms (
        <code>checkout-form.tsx</code>, <code>BuyNowButton</code> in{" "}
        <code>commerce-catalog.tsx</code>) mint a UUID client-side and resend the same one on a
        same-params retry (network error, re-click) so a duplicate submit collapses to one Stripe
        Session and one <code>checkout_sessions</code> row instead of minting two independently
        abandoned carts; changing the checkout inputs (tier, Commerce add-on, email) before
        retrying mints a fresh key instead of reusing the old one, since Stripe itself rejects a
        key reused with different request parameters. Deliberately NOT a stable server-derived key
        like the bootstrap/catalog-sync/Connect Idempotency-Keys below — a Checkout Session is
        meant to be created fresh on every real purchase attempt, so a stable key would replay a
        stale cached Session for a legitimate second purchase; only the client can tell a retry
        apart from a new attempt. Malformed/missing keys are validated away silently (checkout
        still works, just without de-dup) rather than rejected — see{" "}
        <code>checkout-session-create-idempotency-key</code> in the{" "}
        <DocLink href="/docs/process">process log</DocLink>. When a homepage/pricing CTA omits a
        CRM lead slug, the minted <code>organic-*</code> attribution slug (
        <code>resolveBundleCheckoutLeadSlug</code>,{" "}
        <code>src/lib/checkout/organic-attribution.ts</code>) is derived deterministically from
        the idempotency key when one is present (
        <code>deriveOrganicCheckoutLeadSlugFromIdempotencyKey</code>) rather than freshly
        randomized on every call — a same-key retry must send Stripe the same{" "}
        <code>metadata.slug</code>, or Stripe rejects the reused key as an{" "}
        <code>idempotency_error</code> (a key must never be reused with different parameters);
        see <code>organic-checkout-slug-idempotency-key-stability</code> in the{" "}
        <DocLink href="/docs/process">process log</DocLink>.{" "}
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
        <code>paid</code> or <code>no_payment_required</code> (
        <code>isStripeCheckoutSessionPaid</code> — async ACH/bank methods fire{" "}
        <code>checkout.session.completed</code> while unpaid; ledger waits for paid on
        that event or <code>checkout.session.async_payment_succeeded</code>.{" "}
        <code>no_payment_required</code> is different: it means{" "}
        <code>allow_promotion_codes</code> discounted the order to exactly $0, and unlike{" "}
        <code>unpaid</code> it is terminal — no later event ever arrives to resolve it,
        so it is treated as fulfillable alongside <code>paid</code> rather than skipped
        forever), and{" "}
        <code>session.amount_total</code>{" "}
        (integer cents) equal to{" "}
        <code>expectedBundleCheckoutAmountCents(bundle, derivedCommerceAddon, billingInterval)</code>{" "}
        (setup + first recurring period — monthly or annual, see{" "}
        <code>annual-billing-option</code> below — from <code>BUNDLES</code>, plus optional{" "}
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
        sibling sends from duplicating. Once Stripe&apos;s retry window is exhausted (a
        permanently-bad <code>customerEmail</code> or a sustained Resend outage),{" "}
        <code>isBundleHandoffMissingBuyerEmail</code> surfaces that handoff on pipeline-health, the
        daily digest, and a <strong>Bundle buyer email missing</strong> dashboard panel — and the
        operator can now act on it directly: <code>resendBundleBuyerEmailAction</code> sends only
        whichever half (receipt and/or DNS) still lacks its durable sent-marker note, via the same{" "}
        <code>sendReceiptEmail</code> / <code>sendBundleDnsHandoffEmail</code> templates the webhook
        itself uses — <code>sendBundleDnsHandoffEmail</code> was extracted out of the webhook
        route&apos;s inline HTML into a reusable{" "}
        <code>src/lib/email/resend.ts</code> export specifically so the dashboard action could reuse
        it instead of duplicating the template (the &ldquo;extract into a reusable helper&rdquo;
        follow-up <code>bundle-order-missing-buyer-email-visibility</code> deliberately deferred,
        closed by <code>bundle-dns-handoff-email-manual-resend</code>). A partial failure (one half
        sends, the other doesn&apos;t) still durably marks the half that succeeded so a second click
        only retries the outstanding one, never re-sends a duplicate.
      </p>
      <p>
        That initial &ldquo;which half is missing&rdquo; check alone is not atomic, though — a
        concurrent invocation (a second open dashboard tab, or a double-click landing before the
        button&apos;s pending-disabled state takes effect) could read the same stale
        &ldquo;not yet sent&rdquo; snapshot and send its own real duplicate email in the window
        between that read and the write. <code>resendBundleBuyerEmailAction</code> now closes
        this race before either send happens rather than merely detecting it afterward: it
        reserves both wanted markers via <code>reserveBundleBuyerEmailNotes</code> (a Convex
        mutation — plus a SQLite-fallback twin — that atomically re-checks each marker&apos;s
        absence and appends only the still-absent one(s) in the same write) before sending
        anything, sends only whichever half it actually reserved, and releases any reserved-but-
        failed-to-send marker via <code>releaseBundleBuyerEmailNotes</code> so that half correctly
        reappears in <code>isBundleHandoffMissingBuyerEmail</code>&apos;s due-queue for a retry.
        See <code>bundle-buyer-email-resend-race-guard-ordering-fix</code> further down in this
        document for the full mechanism — this replaced an earlier design that sent first and only detected a
        lost race by re-reading afterward, which could report the race but not prevent the
        duplicate email that had already gone out.
      </p>
      <p>
        If required fulfillment writes fail (
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
        still fail closed). The Stripe webhook stays on signed <code>request.text()</code> —
        Stripe payloads can legitimately exceed the ceiling and Stripe itself signs the raw
        bytes. The Resend delivery-event webhook (<code>POST /api/resend/webhook</code>) is not
        exempt the same way — its payloads are small, fixed-shape JSON — so it reads its raw
        signed body via the same-ceiling <code>readTextBodyWithByteLimit</code> (also in{" "}
        <code>src/lib/security/json-body.ts</code>) before signature verification, returning 413
        on an over-sized body rather than buffering it first.
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
        The four billing-notice sends above (<code>sendPaymentFailedNotice</code>,{" "}
        <code>sendPaymentRecoveredNotice</code>, <code>sendSubscriptionPausedNotice</code>,{" "}
        <code>sendSubscriptionResumedNotice</code>) are best-effort by design — a notify failure
        must never turn an already-durable pause/restore write into a webhook retry loop — but
        until <code>billing-notice-send-failure-visibility</code> shipped, a resolved{" "}
        <code>{"{ success: false }"}</code> (a sustained Resend outage, or a customer&apos;s email
        permanently bouncing) reached only a <code>console.warn</code> server log with zero
        operator-facing signal. A subscriber whose card was declined could go indefinitely without
        ever learning why their site&apos;s paid features paused, and the operator had no way to
        know the automated notice never reached them (<code>recurringEntitlementPausedCount</code>{" "}
        only reports the paused *state*, never whether the customer was told). Fixed by adding{" "}
        <code>orders.lastBillingNoticeSendFailedAt</code> /{" "}
        <code>lastBillingNoticeSendFailedType</code> (both backends) and a new{" "}
        <code>recordBillingNoticeSendOutcome</code> call (<code>src/lib/db.ts</code>, keyed on{" "}
        <code>stripeSessionId</code>) at each of the four send sites in the webhook route — one
        combined &quot;is billing communication currently reaching this customer&quot; marker, not
        a per-notice-type ledger, so a later successful send of any of the four notices clears it.
        Deliberately never throws (Convex or SQLite failure alike): this is a display-only marker
        on an already-best-effort send, not a required write. <code>listOrdersWithFailedBillingNotice</code>{" "}
        / <code>oldestBillingNoticeSendFailedAgeHours</code> (<code>src/lib/orders/recurring.ts</code>)
        feed a new pipeline-health <code>billingNoticeSendFailedCount</code> MetricCard and a daily
        digest section, mirroring the visibility-only precedent{" "}
        <code>vercel-domain-provisioning-failure-visibility</code> set for a different best-effort
        automation. The three sibling mutations that replace the whole{" "}
        <code>orders</code> document (<code>clearRecurringCanceledByCustomer</code>,{" "}
        <code>clearRefunded</code>, <code>clearDisputed</code>) needed the two new fields added to
        their conditional-spread field lists, or an unrelated resubscribe/refund-reversal/dispute-win
        would have silently wiped a still-live send-failure marker — the same landmine{" "}
        <code>revenue-total-usd-renewal-gap</code> already flagged for{" "}
        <code>lifetimeRevenueUsd</code>/<code>lastRenewalInvoiceId</code>.
      </p>
      <p>
        Until <code>subscription-canceled-win-back-notice</code> shipped,{" "}
        <code>customer.subscription.deleted</code> — the actual end of a subscriber&apos;s MRR —
        was the one billing-lifecycle transition with no customer-facing email at all: every other
        transition (dunning, payment-recovered, pause, resume) already had one. Fixed by adding a
        fifth best-effort notice, <code>sendSubscriptionCanceledNotice</code>, sent from that same
        handler right after the existing stale-marker-clear cleanup (never before it — that block
        unconditionally clears any live <code>lastBillingNoticeSendFailedType</code> for the
        customer&apos;s orders, so a fresh <code>subscription_canceled</code> failure recorded ahead
        of it would be wiped out by its own cancellation event). Recipient selection reuses{" "}
        <code>orderEligibleForPauseNotice</code> — valid here for the identical reason it already
        covers the pause/dunning notices: <code>markOrdersRecurringCanceledByCustomer</code> just set{" "}
        <code>recurringCanceledAt</code> on the very order this notice is about, so the narrower{" "}
        <code>orderGrantsSoldCapabilityEntitlement</code> would always reject it. The email names
        what lapses straight from <code>BUNDLES</code>/<code>COMMERCE_ADDON</code> (never hardcoded
        copy, so it can&apos;t drift from the real feature set) and links to a resubscribe{" "}
        <code>/checkout</code> prefilled with the lead&apos;s slug
        and, when the canceled order&apos;s own tier still carries a monthly Price
        (Growth/Complete), that same tier — a bare Starter tier here means only a Commerce add-on
        rider lapsed (Starter itself has no recurring Price), so the link and copy omit any
        bundle-tier claim in that case. <code>BillingNoticeType</code> is now a five-way union;{" "}
        <code>lastBillingNoticeSendFailedAt</code>/<code>Type</code> and{" "}
        <code>recordBillingNoticeSendOutcome</code> needed no shape change since they were already
        generic over the notice type. Because a fully deleted Subscription never fires another
        subscription-lifecycle webhook event, a failed win-back send has no retry path of its own —
        it surfaces on the same <code>billingNoticeSendFailedCount</code> pipeline-health/digest
        due-queue as the other four and can only clear via an unrelated future resubscribe&apos;s own
        notice succeeding.
      </p>
      <p>
        <code>payment-failed-notice-annual-billing-copy</code>: the same hardcoded-cadence bug{" "}
        <code>subscription-canceled-notice-annual-billing-copy</code> fixed for the win-back email
        above also existed in <code>sendPaymentFailedNotice</code> — its body copy read &quot;was
        declined for this month&apos;s [brand] subscription&quot; unconditionally, so an annual
        Growth/Complete subscriber&apos;s once-a-year renewal failure produced an email that was
        factually wrong about their own billing cadence. Worse exposure than the win-back email:
        Stripe fires a distinct <code>invoice.payment_failed</code> per Smart Retry attempt, so this
        notice can send several times per failed renewal rather than the win-back email&apos;s
        one-shot send. Fixed the same way: the handler already retrieves the failed invoice&apos;s
        Subscription via <code>stripe.subscriptions.retrieve</code> a few lines above the notify
        block, so <code>stripeSubscriptionBillingInterval(subscription)</code> — the exact helper{" "}
        <code>subscription-canceled-notice-annual-billing-copy</code> added — threads straight in
        with no extra Stripe API call. Copy now reads &quot;your annual&quot; or &quot;this
        month&apos;s&quot; correctly. <code>sendPaymentRecoveredNotice</code>,{" "}
        <code>sendSubscriptionPausedNotice</code>, and{" "}
        <code>sendSubscriptionResumedNotice</code> were checked and contain no equivalent
        month-specific wording, so none needed the same fix.
      </p>
      <p>
        <code>growth-upsell-annual-billing-carry-through</code>: the same billing-cadence blind
        spot the two paragraphs above fixed for transactional notices also existed in the
        paid-upgrade nudge — <code>sendGrowthUpsellAction</code> pitching a live Growth subscriber
        on Complete. <code>buildGrowthUpsellCheckoutPath</code> built{" "}
        <code>/checkout?slug=...&amp;tier=complete</code> with no billing-interval param at all,
        and <code>sendGrowthUpsellEmail</code> hardcoded &quot;$X/mo&quot; copy — so an annual
        Growth subscriber clicking &quot;Upgrade to Complete&quot; saw a monthly price quote and
        landed on a checkout page that defaults <code>billingInterval</code> to Monthly for a
        missing param, silently switching them off the cadence they already committed to.
        Starter-upsell has no equivalent bug: Starter itself carries no recurring Price, so a
        Starter subscriber upgrading is choosing a cadence for the first time rather than having an
        existing one overwritten. Fixed by mirroring{" "}
        <code>createBillingPortalForCheckoutSession</code>&apos;s existing precedent: a new{" "}
        <code>resolveGrowthOrderBillingInterval</code> (
        <code>src/lib/billing/growth-upsell-billing-interval.ts</code>) retrieves the eligible
        Growth order&apos;s Stripe Checkout Session via its stored <code>stripeSessionId</code>{" "}
        (<code>expand: [&quot;subscription&quot;]</code>), then reuses{" "}
        <code>stripeSubscriptionBillingInterval</code> — the same helper the two paragraphs above
        share — to derive the cadence. <code>buildGrowthUpsellCheckoutPath</code> and{" "}
        <code>sendGrowthUpsellEmail</code> both take an optional <code>billingInterval</code>{" "}
        param now: the checkout path appends <code>&amp;billing=annual</code> (matching{" "}
        <code>buildStarterUpsellCheckoutPath</code>&apos;s shape) and the email swaps in{" "}
        <code>annualPriceUsd</code>/&quot;$X/yr&quot; copy when applicable. Like its two siblings,
        this is a best-effort, non-blocking lookup —{" "}
        <code>resolveGrowthOrderBillingInterval</code> never throws; a missing{" "}
        <code>STRIPE_SECRET_KEY</code>, no Growth order with a <code>stripeSessionId</code>, an
        unexpanded/string subscription, or any Stripe API failure all fall back to the original
        &quot;monthly&quot; behavior rather than blocking the upsell send. The Stripe client is
        constructed only at the <code>sendGrowthUpsellAction</code> call site and passed into the
        pure helper, mirroring <code>create-portal-session.ts</code>&apos;s dependency-injection
        pattern for testability.
      </p>
      <p>
        <code>growth-upsell-dashboard-candidate-annual-billing-display</code>: the paragraph above
        fixed the actual send path (the email/checkout link a click on &quot;Send Complete
        upsell&quot; produces), but never touched the operator-facing candidate row itself —
        /dashboard/leads&apos; Growth → Complete panel kept unconditionally rendering
        &quot;$199/mo&quot; even for a lead whose live Growth subscription is annual, so the
        operator read a different number than the one the button they were about to click would
        actually send. Fixed by resolving each candidate&apos;s cadence server-side in{" "}
        <code>page.tsx</code> — a new <code>resolveGrowthUpsellCandidateBillingIntervals</code> (
        <code>src/lib/billing/growth-upsell-billing-interval.ts</code>) runs one Checkout Session
        retrieve per candidate concurrently, reusing <code>resolveGrowthOrderBillingInterval</code>
        so a single candidate&apos;s Stripe failure can&apos;t affect the others — and passing the
        resulting slug-keyed map down to <code>LeadsClient</code> as a new{" "}
        <code>growthUpsellBillingIntervals</code> prop. <code>leads-client.tsx</code> renders the
        row&apos;s price suffix through a new pure{" "}
        <code>growthUpsellCandidatePriceSuffix(bundle, billingInterval)</code> helper in{" "}
        <code>growth-upsell.ts</code> instead of reading <code>bundle.monthlyPriceUsd</code>{" "}
        directly. Same best-effort shape as its sibling: no <code>STRIPE_SECRET_KEY</code> or an
        empty candidate list skips the lookup entirely (the common case — this list is normally
        small), a missing slug in the resolved map defaults to &quot;monthly&quot;, and the whole
        thing degrades to the exact pre-fix display rather than blocking the dashboard&apos;s page
        render. The sibling Starter-upsell panel a few lines above renders unchanged — it has no
        equivalent bug, for the same reason <code>growth-upsell-annual-billing-carry-through</code>{" "}
        never touched it: Starter carries no recurring Price, so that panel&apos;s price is a
        first-time cadence choice, not an existing one to preserve.
      </p>
      <p>
        <code>listOrdersWithFailedBillingNotice</code> itself had a follow-on gap (
        <code>billing-notice-failed-list-entitlement-guard</code>): it never excluded an order that
        had since fully canceled, been refunded, or been disputed. Because the marker is
        deliberately preserved across those three mutations (see the paragraph above), a subscriber
        who churned right after a billing-notice send failure — card declined, dunning email failed
        to send, customer then canceled — left a stale failure marker with no way to ever clear: no
        further subscription-lifecycle webhook event fires for a dead subscription, so{" "}
        <code>success: true</code> never arrives to clear it. That order surfaced on the
        pipeline-health MetricCard and daily digest section permanently, inflating the actionable
        count forever and risking training the operator to ignore the whole due-queue — masking a
        genuinely-actionable failure for a still-active paying customer. Fixed by widening{" "}
        <code>listOrdersWithFailedBillingNotice</code>&apos;s order parameter type to include{" "}
        <code>tier</code>/<code>commerceAddon</code>/<code>recurringCanceledAt</code>/
        <code>refundedAt</code>/<code>disputedAt</code> (already present on the full order records
        both call sites already pass — no new plumbing) and gating each candidate on{" "}
        <code>orderGrantsSoldCapabilityEntitlement</code>, the same &quot;is this still a live
        paying relationship&quot; predicate its two closest siblings (
        <code>listMarketingPacksMissingClientSend</code>, <code>listMarketingPacksMissingBufferPost</code>
        ) already use. The stored marker itself stays untouched — only the surfaced due-queue list
        needed the extra gate.
      </p>
      <p>
        That entitlement guard itself hid exactly the two notice types it exists to surface (
        <code>billing-notice-failed-pause-gate-terminal-clear</code>): the webhook always calls{" "}
        <code>markOrdersRecurringCanceledByCustomer</code> BEFORE writing the failure marker for the
        <code>payment_failed</code> (dunning) and <code>subscription_paused</code> notices — so{" "}
        <code>recurringCanceledAt</code> is <em>always</em> freshly non-null on the very order the
        marker describes, and <code>orderGrantsSoldCapabilityEntitlement</code> (which requires it
        unset) rejected every such order from the instant the marker was written, hiding a live
        payment-failure signal for the entire — potentially weeks-long — dunning/pause window this
        due-queue exists to surface. This is exactly why <code>orderEligibleForPauseNotice</code>{" "}
        already exists as the webhook&apos;s own recipient-selection gate for these two notice
        types; the read side had simply never been given the matching predicate. Fixed by branching{" "}
        <code>listOrdersWithFailedBillingNotice</code>&apos;s gate on{" "}
        <code>lastBillingNoticeSendFailedType</code>: <code>payment_failed</code>/
        <code>subscription_paused</code> now use <code>orderEligibleForPauseNotice</code> (ignores{" "}
        <code>recurringCanceledAt</code>, still excludes refunded/disputed);{" "}
        <code>payment_recovered</code>/<code>subscription_resumed</code> keep{" "}
        <code>orderGrantsSoldCapabilityEntitlement</code> unchanged, since those two are only ever
        written once <code>recurringCanceledAt</code> has just been cleared. That reopened the
        original churn-visibility gap for a subscription that is fully, terminally deleted (as
        opposed to a recoverable <code>past_due</code>/<code>unpaid</code>/<code>pause_collection</code>{" "}
        pause) — no further subscription-lifecycle webhook event will ever fire for it, so a stale{" "}
        <code>payment_failed</code>/<code>subscription_paused</code> marker would otherwise surface
        forever with the new, looser gate. Closed at the source instead of on the list: the{" "}
        <code>customer.subscription.deleted</code> handler now clears any live marker on that
        customer&apos;s orders by re-calling the existing{" "}
        <code>recordBillingNoticeSendOutcome(..., success: true)</code> — its documented clear path —
        for each order still carrying one, rather than adding a new mutation. Best-effort, same as
        every other notify-side-effect in this handler: a cleanup failure logs and stays{" "}
        <code>200</code>, never a retry loop.
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
        Until <code>checkout-recovery-cron-automation</code>, both recovery emails above were
        100% operator-triggered — a due session sat visible on pipeline-health and the (now
        automated) daily digest, but nothing ever actually sent the nudge without a human opening{" "}
        <code>/dashboard/leads</code> and clicking a per-session button inside the 2-hour
        abandonment window. The mark-then-send body of{" "}
        <code>sendCheckoutRecoveryAction</code> / <code>sendCommerceCheckoutRecoveryAction</code>{" "}
        was extracted into <code>recoverAbandonedBundleCheckout</code> /{" "}
        <code>recoverAbandonedCommerceCheckout</code> (
        <code>src/lib/checkout/recover-abandoned-checkout.ts</code>) — same CAS race guard,
        same suppression/error surfacing, unchanged — so the manual buttons and a new automated
        trigger can never diverge. <code>GET /api/cron/checkout-recovery</code> (
        <code>src/app/api/cron/checkout-recovery/route.ts</code>) reads{" "}
        <code>listOpenCheckoutSessions</code> once, computes both due queues via{" "}
        <code>listAbandonedCheckoutsDue</code> /{" "}
        <code>listCommerceAbandonedCheckoutsDue</code> (the same pure predicates the dashboard
        panels already use, so a session is never treated as due for the cron and not-due for the
        panel or vice versa), and sequentially attempts each one — a per-session failure (missing
        email, suppression, a concurrent race) is aggregated into the response body and reported
        via <code>captureError</code> rather than aborting the batch. It shares{" "}
        <code>src/lib/security/cron-secret.ts</code>&apos;s <code>CRON_SECRET</code>{" "}
        bearer-token verification with <code>GET /api/cron/daily-digest</code> (extracted from
        that route in the same change so a second cron route can&apos;t drift from the first
        one&apos;s constant-time compare), and the same <code>vercel.json</code>{" "}
        <code>&quot;crons&quot;</code> entry pattern, offset two hours from the digest. Unlike the
        digest, an unset recipient is a per-session skip in the response body, not a whole-route
        501 — recovery emails go to the session&apos;s own <code>customerEmail</code> /{" "}
        <code>lead.email</code>, not a single operator inbox env var.
      </p>
      <p>
        <code>outreach-followup-cron-automation</code> closes the third instance of the same gap
        for the cold-outreach Email 2/3 follow-up cadence — the top-of-funnel sequence that turns a
        free preview into a paying customer. <code>isFollowUpDue</code> /{" "}
        <code>listFollowUpsDue</code> (<code>src/lib/email/outreach-followups.ts</code>) already
        fed pipeline-health, the daily digest, and a dashboard panel with visibility, but{" "}
        <code>sendFollowUpAction</code> was the only thing that ever actually sent Email 2/3, one
        lead at a time, on a manual click. The mark-then-send body (next-step derivation via{" "}
        <code>nextFollowUpStep</code>, the <code>recordLeadOutreach</code> CAS guard, Email 2 vs
        Email 3 dispatch) was extracted into <code>sendOutreachFollowUpEmail</code> (
        <code>src/lib/leads/send-follow-up.ts</code>) — same guard, unchanged — so the manual
        button and <code>GET /api/cron/outreach-followups</code> (
        <code>src/app/api/cron/outreach-followups/route.ts</code>) can never diverge. The cron
        route reads <code>getLeads</code> once, computes the due queue via the same{" "}
        <code>listFollowUpsDue</code> the dashboard panel calls (so cron and panel can never
        disagree on what&apos;s due — snoozed leads excluded either way), and sequentially attempts
        each one, aggregating per-lead failures the same way{" "}
        <code>checkout-recovery</code>&apos;s cron route does. It shares the same{" "}
        <code>CRON_SECRET</code> verification and adds a third <code>vercel.json</code>{" "}
        <code>&quot;crons&quot;</code> entry — worth flagging plainly: Vercel&apos;s Hobby plan
        caps a project at 2 Cron Jobs total, so three routes on one project needs Pro (or higher);
        this is a real, cheap (well under any real revenue this whole outreach/checkout/digest
        automation exists to protect) operational cost, not a blocker, but it is a genuine
        plan-tier requirement worth stating rather than glossing over.
      </p>
      <p>
        <code>cron-run-health-visibility</code>: once all three Vercel Cron routes existed, none of
        them persisted anything about their own invocation history — a route that stopped being
        invoked at all (Vercel Cron disabled, quota reached, a <code>vercel.json</code> typo), or
        one that started 500ing on every run with <code>ERROR_TRACKING_WEBHOOK_URL</code> unset (the
        default), was invisible everywhere in-app; pipeline-health and the digest only ever showed
        the underlying due queues, which look identical whether the automation is running or has
        been silently dead for a week. Added a <code>cronRuns</code> table (Convex +{" "}
        <code>cron_runs</code> SQLite fallback, one row per job name) written via{" "}
        <code>recordCronRunOutcome</code> (<code>src/lib/db.ts</code>) at the end of every cron
        route invocation — both the success and the catch/failure branch — so <code>lastRunAt</code>{" "}
        always reflects the most recent attempt regardless of outcome. Deliberately best-effort and
        never throws (mirrors <code>captureError</code>&apos;s contract): a failure to persist this
        marker must never turn an otherwise-successful cron run into a reported failure, or vice
        versa. <code>computeCronJobHealth</code> (<code>src/lib/cron/cron-run-health.ts</code>) is
        the pure aggregator — a job with no recorded row at all is treated identically to one whose
        last run fell outside <code>CRON_RUN_STALE_THRESHOLD_HOURS</code> (36h), since both mean
        &quot;nothing confirms this automation is working.&quot; Consumed by pipeline-health&apos;s
        new <strong>Cron automation health</strong> metric card and a new digest section, both gated
        behind <code>cronSecretConfigured</code> (<code>!!process.env.CRON_SECRET?.trim()</code>) so
        a deployment that has never enabled Vercel Cron isn&apos;t flagged as unhealthy for
        automation it never opted into.
      </p>
      <p>
        <code>annual-billing-option</code>: Growth/Complete checkout only ever offered monthly
        billing — no way for a customer who&apos;d happily prepay a year to do so, and no
        discount lever to reward that lower payment-risk/higher-LTV choice, leaving revenue on
        the table the same way the cron-automation iterations above closed operator-side gaps.{" "}
        <code>bundles.ts</code> adds <code>annualPriceUsd</code> / <code>annualPriceIdEnv</code>{" "}
        per tier (Growth $990/yr, Complete $1990/yr — both &ldquo;2 months free&rdquo; vs. paying
        monthly × 12, see <code>annualBillingSavingsUsd</code>) and a validated{" "}
        <code>BundleBillingInterval</code> (<code>parseBundleBillingInterval</code> — unknown or
        missing values fall back to <code>&quot;monthly&quot;</code>, never an unrecognized value
        reaching the amount/Price-ID branch). <code>POST /api/stripe/checkout</code> resolves the
        recurring line item from <code>bundle.annualPriceIdEnv</code> instead of{" "}
        <code>monthlyPriceIdEnv</code> when the request selects annual, stamps{" "}
        <code>billingInterval</code> onto Session <code>metadata</code>, and rejects annual +
        Commerce add-on combinations at 400 before a Session is ever created — a single Stripe
        subscription&apos;s recurring line items must share one billing interval, and the
        add-on has no annual Price of its own (a documented follow-up, not built here). The
        webhook re-derives <code>billingInterval</code> from Session <code>metadata</code>{" "}
        (falling back to <code>&quot;monthly&quot;</code> for a stale/tampered/pre-feature
        Session, same as a missing value) and passes it through to both{" "}
        <code>bundleCatalogPriceIdsFromEnv</code> (so <code>sessionLineItemsMatchBundleCatalogPrices</code>{" "}
        checks the line item against the correct interval&apos;s catalog Price ID, not always
        monthly&apos;s) and <code>expectedBundleCheckoutAmountCents</code> (so the exact-amount
        gate expects the annual total, not the monthly one) — the same forged-line-item /
        wrong-amount protections every other checkout amount gets, just interval-aware.{" "}
        <code>bootstrapStripePrices</code> now creates both a monthly and an annual Price per
        tier under one shared Stripe Product (key <code>bundle.id + &quot;_recurring&quot;</code>,
        renamed from the old monthly-only key — safe pre-launch, since{" "}
        <code>stripe-price-objects</code> has never actually run against a live Stripe account),
        distinguished by <code>(unitAmount, interval)</code> in <code>findMatchingPrice</code>{" "}
        rather than a boolean <code>recurring</code> flag. Deliberately out of scope: no{" "}
        <code>billingInterval</code> column on the <code>orders</code> table (operator dashboards
        don&apos;t yet surface which cadence a customer is on — a documented follow-up), and
        revenue/MRR reporting needed zero changes since <code>orderLifetimeRevenueUsd</code> /{" "}
        <code>lifetimeRevenueUsd</code> are already driven by actual Stripe invoice amounts, not
        a computed monthly-price formula.
      </p>
      <p>
        <code>checkout-recovery-billing-interval-carry-through</code>: the very same annual
        toggle above was never threaded through abandoned-checkout recovery
        (<code>checkout-recovery-cron-automation</code>). A shopper who selected Annual, then
        abandoned before paying, got a recovery email whose link pointed at plain{" "}
        <code>/checkout?slug=...&amp;tier=...</code> — no billing-interval information — so{" "}
        <code>CheckoutForm</code> silently re-prefilled them onto Monthly (
        <code>parseBundleBillingInterval</code> falls back to <code>&quot;monthly&quot;</code>{" "}
        for a missing param, same as a tampered/legacy value). The checkout route&apos;s own{" "}
        <code>cancel_url</code> already round-trips <code>billing=annual</code> for a same-session
        Stripe-cancel-and-return, proving the recovery-email gap was an oversight, not a
        deliberate omission. Fixed by adding <code>billingInterval</code> to{" "}
        <code>CheckoutSessionRecord</code> (both the SQLite <code>checkout_sessions</code> table,
        additive-migration style, and the Convex <code>checkoutSessions</code> table/mutation) so
        it round-trips through <code>recordCheckoutSessionCreated</code> exactly like{" "}
        <code>tier</code>/<code>kind</code> already do; <code>sendCheckoutAbandonedRecovery</code>{" "}
        now accepts it and appends <code>&amp;billing=annual</code> to the recovery link,
        mirroring the <code>cancel_url</code> pattern exactly. Undefined/legacy rows and
        commerce_sku rows (no recurring concept) are unaffected — the param is only appended when
        the stored interval is exactly <code>&quot;annual&quot;</code>.
      </p>
      <p>
        <code>checkout-setup-fee-skip-on-upgrade</code>: both{" "}
        <code>sendStarterUpsellEmail</code> and <code>sendGrowthUpsellEmail</code> (
        <code>src/lib/email/resend.ts</code>) tell a paying customer &quot;Setup is already covered
        by what you paid&quot; before linking to <code>/checkout?slug=...&amp;tier=...</code> — but{" "}
        <code>POST /api/stripe/checkout</code> priced in the one-time setup fee for{" "}
        <em>every</em> checkout unconditionally, with no check for whether the lead already had a
        prior order. Every <code>BundleDefinition</code> in <code>bundles.ts</code> carries the
        same <code>setupPriceUsd: 500</code>, so a Starter customer clicking the upsell link (or a
        Growth customer clicking the newer Growth→Complete one) landed on a checkout page charging
        a second $500 setup fee plus the new recurring price — directly contradicting the email,
        and a real billing-trust/chargeback risk if the customer didn&apos;t notice before paying.
        Fixed by resolving <code>leadSlug</code> earlier in the route and fetching{" "}
        <code>listOrdersByLeadSlug(leadSlug)</code> unconditionally (reused for the existing{" "}
        <code>existingCustomerId</code> derivation too, avoiding a second lookup): when the lead
        already has any prior order, the setup-fee Stripe Price ID is neither required nor added to{" "}
        <code>line_items</code> — every tier&apos;s setup fee covers the same one-time site build,
        so any prior order (regardless of which tier) means it was already paid. Deliberately does
        not filter out refunded/disputed prior orders, mirroring{" "}
        <code>existingRecurringStripeCustomerId</code>&apos;s own no-filter precedent — the only
        paths that ever reach this route with a lead that has prior orders are the two upsell
        emails, whose own eligibility checks already exclude a refunded/disputed source order. The
        Commerce add-on&apos;s own separate setup fee is unaffected — an existing Growth customer
        adding Commerce for the first time still pays that add-on&apos;s setup fee, since they
        never paid it before. Added a guard returning 400 for the one degenerate case this could
        otherwise create (a repeat Starter request for a lead that already has an order, with no
        recurring price and no add-on selected — nothing left to charge) rather than sending Stripe
        an empty <code>line_items</code> array.
      </p>
      <p>
        <code>checkout-form-setup-fee-display-parity</code>: the fix above only changed what{" "}
        <code>POST /api/stripe/checkout</code> actually charges — <code>checkout-form.tsx</code>{" "}
        never learned about the waiver, so it kept quoting the full setup fee in{" "}
        <code>&quot;Due today&quot;</code> even on the exact upgrade checkouts the server now
        discounts. A Growth customer following <code>sendGrowthUpsellEmail</code>&apos;s
        &quot;setup is already covered&quot; link would see <code>Due today: $699</code> ($500 +
        $199/mo) on this page, then actually be charged only $199 at Stripe — the opposite
        direction of the original bug, but the same class of email-vs-checkout price mismatch.
        Fixed by threading the same signal through: <code>loadCheckoutPrefillLead</code> (
        <code>prefill-slug.ts</code>) now also calls <code>listOrdersByLeadSlug</code> whenever a
        CRM lead resolves and returns <code>hasExistingOrder</code>, which{" "}
        <code>checkout/page.tsx</code> passes to <code>CheckoutForm</code> as a new{" "}
        <code>hasExistingOrder</code> prefill field. Extracted the &quot;Due today&quot; total and
        subtitle arithmetic into a new pure module, <code>src/lib/checkout/due-today.ts</code> (
        <code>checkoutSetupFeeTotal</code> / <code>checkoutDueTodaySubtitle</code>) — unit-tested
        in the normal node Vitest environment rather than needing this repo&apos;s absent
        jsdom/@testing-library/react render-test infra (same carve-out precedent as{" "}
        <code>leads-client-pending-announcement-shared-status-region</code>) — and wired it into{" "}
        <code>CheckoutForm</code> in place of the old inline calculation, mirroring the exact
        no-filter-refunded/disputed and Commerce-add-on-unaffected semantics{" "}
        <code>checkout-setup-fee-skip-on-upgrade</code> already established server-side. Verified
        end to end with a dev-server smoke check: seeded a lead with a prior order directly in
        SQLite, confirmed <code>/checkout?slug=...&amp;tier=complete</code> rendered &quot;First
        month only — setup already covered&quot; and a <code>$199</code> total (vs. $699 for the
        same tier with no prior order), then cleaned up the seeded rows.
      </p>
      <p>
        <code>webhook-setup-fee-skip-parity</code>: the setup-fee skip above shipped a real
        create-path/webhook parity gap of its own — the Stripe webhook&apos;s fulfillment gates (
        <code>sessionLineItemsMatchBundleCatalogPrices</code>, <code>expectedBundleCheckoutAmountCents</code>)
        still unconditionally required the setup Price on line items and in the expected amount, so
        every genuinely fee-skipped upgrade session failed both gates and the webhook silently
        skipped <code>recordLeadPayment</code>, the handoff, and both buyer emails for a customer
        who had actually paid — worse than the original double-charge bug, since the customer now
        paid correctly but received nothing. Fixed by having the webhook independently re-derive the
        same has-a-prior-order fact via <code>listOrdersByLeadSlug</code> (excluding this exact
        session&apos;s own order row, so a redelivery of an already-recorded session is never
        miscounted as a prior order).{" "}
        <code>sessionLineItemsMatchBundleCatalogPrices</code> gained an{" "}
        <code>options.requireSetupFee</code> (default <code>true</code>, backward compatible), and{" "}
        <code>expectedBundleCheckoutAmountCents</code> gained a <code>chargedSetupFee</code>{" "}
        parameter derived directly from whether the setup Price actually appears on the real line
        items — never from the prior-order lookup — so a tampered/forged session that omits the fee
        without a genuine prior order still fails exactly as before.
      </p>
      <p>
        <code>preview-tier-upsell-setup-fee-waiver-parity</code>: the setup-fee-skip series above
        scoped its display-parity fix strictly to <code>/checkout</code> — but{" "}
        <code>TierUpsell</code> (<code>src/components/preview/tier-upsell.tsx</code>), rendered by
        every <code>/preview/[slug]</code> page, still quoted each tier&apos;s full{" "}
        <code>bundle.setupPriceUsd</code> unconditionally. The upsell emails&apos; secondary link
        (&quot;Or revisit your site preview first&quot;) sends an already-paying customer straight
        back to this page, where they&apos;d see the un-waived setup fee — contradicting both the
        email they just read and, post-fix, <code>/checkout</code> itself. Fixed the same way as{" "}
        <code>checkout-form-setup-fee-display-parity</code>: a new{" "}
        <code>loadPreviewSetupFeeWaived</code> (<code>src/lib/checkout/preview-setup-fee.ts</code>)
        stage-gates on <code>paid</code>/<code>live</code> before calling{" "}
        <code>listOrdersByLeadSlug</code> (mirroring <code>loadPreviewCommerceItems</code>&apos;s
        own gate, so the high-volume cold-outreach preview path never pays that DB cost), threaded
        through <code>CategoryPreview</code> into <code>TierUpsell</code> as{" "}
        <code>setupFeeWaived</code>. A new pure <code>tierUpsellPricing</code> helper in{" "}
        <code>bundles.ts</code> swaps each card&apos;s headline price to the monthly price (or{" "}
        <code>$0</code> for Starter, which has none) with an &quot;already covered&quot; caption
        when waived. Verified end to end with a dev-server smoke check: the demo/cold preview
        still showed the full <code>$500</code> setup fee on all three cards, then a lead seeded
        directly in SQLite as <code>paid</code> with one prior order showed <code>$0</code>/
        <code>$99</code>/<code>$199</code> with &quot;setup already covered&quot; on Starter/
        Growth/Complete respectively.
      </p>
      <p>
        <code>acquisition-source-checkout-attribution</code>: the homepage pricing grid and each
        of the three <code>/websites-for-*</code> SEO category landing pages funneled to the same{" "}
        <code>/checkout</code> page with no way to tell which surface actually converted — no
        analytics tool is integrated in this app, and Stripe metadata carried no channel marker.
        Each CTA now appends an allowlisted <code>?source=</code> token (<code>home</code>,{" "}
        <code>cat-restaurant</code>, <code>cat-salon</code>, <code>cat-trades</code> —{" "}
        <code>CHECKOUT_ACQUISITION_SOURCES</code>,{" "}
        <code>src/lib/checkout/acquisition-source.ts</code>); <code>/checkout</code> parses it via{" "}
        <code>parseCheckoutAcquisitionSource</code> (unknown/missing values silently drop rather
        than blocking checkout — an optional attribution field, not a required one) and threads it
        through <code>CheckoutForm</code>&apos;s POST body as{" "}
        <code>acquisitionSource</code>. <code>POST /api/stripe/checkout</code> re-validates
        against the same fixed allowlist before writing{" "}
        <code>metadata.acquisitionSource</code> onto the Stripe Checkout Session — never trusting
        the client value verbatim, since it is client-visible and technically tamperable. The
        webhook re-validates a third time when reading{" "}
        <code>session.metadata.acquisitionSource</code> before passing it to{" "}
        <code>recordLeadPayment</code>, which persists it onto the new <code>orders</code> row
        (both backends; the three <code>replace()</code>-based Convex mutations —{" "}
        <code>clearRecurringCanceledByCustomer</code> / <code>clearRefunded</code> /{" "}
        <code>clearDisputed</code> — carry it forward in their conditional-spread field lists, the
        same landmine every prior optional <code>orders</code> field has needed). Commerce Buy now
        orders are unaffected — this is bundle-checkout-only attribution.{" "}
        <code>acquisitionSourceBreakdown</code> (<code>src/lib/metrics/pipeline-health.ts</code>)
        groups still-counting (non-refunded/disputed) orders by source and sums{" "}
        <code>orderLifetimeRevenueUsd</code>, rendered as a revenue-descending table on the
        Pipeline health dashboard panel — hidden entirely when there are no bundle orders yet.
      </p>
      <p>
        <code>acquisition-source-preview-and-outreach-attribution</code>: the original four-token
        allowlist above only tagged the homepage and the three SEO landing pages — but this
        cold-outbound business&apos;s dominant conversion path is a lead&apos;s own{" "}
        <code>/preview/[slug]</code> page (reached via an outreach email) and the outreach-email
        sequence itself, and neither tagged its checkout links at all. Every such conversion
        silently bucketed under &quot;Unknown / direct&quot; in{" "}
        <code>acquisitionSourceBreakdown</code>, understating the outreach funnel and
        overstating how &quot;mysterious&quot; most revenue looked — the opposite of what that
        panel exists to answer. Added two more allowlisted tokens: <code>preview</code> (the
        preview page&apos;s tier-upsell cards and hero &quot;Claim this site&quot; CTA,{" "}
        <code>TierUpsell</code> / <code>CategoryPreview</code>) and{" "}
        <code>outreach-email</code> (Email 1/2/3 and abandoned-checkout recovery nudges,{" "}
        <code>src/lib/email/resend.ts</code>). <code>sendCommerceAbandonedRecovery</code> was
        deliberately left untagged — it links to the client&apos;s own preview catalog, never{" "}
        <code>/checkout</code>, so there is no bundle acquisition to attribute. The Starter →
        Growth/Complete upsell email&apos;s checkout link (
        <code>buildStarterUpsellCheckoutPath</code>) was also left out of scope: that is an
        existing paying customer changing tiers, not a new-customer acquisition event.
      </p>
      <p>
        <code>checkout-cancel-url-acquisition-source-round-trip</code>: the two attribution passes
        above tagged every checkout entry point, but a shopper who opens Stripe Checkout and then
        clicks Stripe&apos;s own back/cancel button lands back on <code>/checkout</code> via{" "}
        <code>cancel_url</code> — which never carried <code>source</code> at all. A common real
        flow (back out once to double-check pricing, then retry) lost the original{" "}
        <code>?source=</code> token entirely on that retry, and the resulting paid order silently
        attributed to &quot;Unknown / direct&quot; even though the shopper&apos;s original visit
        was tagged. Fixed by appending the validated <code>acquisitionSource</code> onto{" "}
        <code>cancelParams</code> as <code>source</code> in{" "}
        <code>POST /api/stripe/checkout</code> — <code>CheckoutPage</code> already re-parses{" "}
        <code>?source=</code> on the way back in, so no read-side change was needed.
      </p>
      <p>
        <code>acquisition-source-digest-footnote</code>: the three attribution passes above wired{" "}
        <code>acquisitionSourceBreakdown</code> into the dashboard&apos;s Pipeline health panel
        only — an operator whose daily habit is reading the digest email rather than opening{" "}
        <code>/dashboard/leads</code> never saw the one number that system exists to answer.{" "}
        <code>buildDailyDigest</code> (<code>src/lib/digest/daily-digest.ts</code>) now calls the
        same <code>acquisitionSourceBreakdown</code> helper over its existing{" "}
        <code>orders</code> input and surfaces the highest-revenue row as a{" "}
        <code>topAcquisitionSourceLabel</code>/<code>topAcquisitionSourceRevenueUsd</code>/
        <code>topAcquisitionSourceOrderCount</code> footnote — same &quot;trend signal, not
        actionable above&quot; treatment as the existing win-rate footnote, rendered in both the
        empty-state and normal digest bodies. Null (omitted) when no order yet counts toward
        revenue, mirroring the dashboard panel&apos;s own hidden-when-empty behavior.
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
        an operator can see which tier is about to go out before clicking again. The daily digest
        (<code>daily-digest.ts</code>) mirrors this: <code>DigestCheckoutRecovery</code> /{" "}
        <code>DigestCommerceCheckoutRecovery</code> carry a <code>nextNudgeNumber</code> (
        <code>recoverySentCount + 1</code>), and each abandoned-checkout / Buy now recovery row
        renders &quot;(nudge #N)&quot; — an operator reading only the digest email (not the
        dashboard) can otherwise not tell a session about to get its first reassurance nudge from
        one about to get its final closing nudge.
      </p>
      <p>
        Growth/Complete/Commerce subscribers manage cards, invoices, and cancellation via Stripe
        Billing Portal: <code>POST /api/stripe/billing-portal</code> (post-checkout{" "}
        <code>sessionId</code>) and the operator <strong>Billing</strong> action on paid/live
        leads. The session-id path (<code>createBillingPortalForCheckoutSession</code>) requires{" "}
        <code>status === &quot;complete&quot;</code> and{" "}
        <code>payment_status === &quot;paid&quot;</code> or{" "}
        <code>&quot;no_payment_required&quot;</code> (
        <code>isStripeCheckoutSessionPaid</code> — same gate as webhook fulfillment and{" "}
        <code>loadCheckoutSuccessSession</code>; async ACH can leave complete+unpaid, and a
        client-supplied <code>sessionId</code> must not open Manage billing before funds clear;
        a 100%-off promo redemption is terminal and safe to treat as paid).
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
      <p>
        The homepage&apos;s primary pricing CTAs (<code>Get {"{bundle.name}"}</code>) link straight
        to <code>/checkout?tier=…</code> with no lead slug — the organic, no-preexisting-CRM-row
        path <code>resolveBundleCheckoutLeadSlug</code> mints an <code>organic-*</code> slug for.
        Until <code>checkout-business-fields-capture</code> this path collected only an email: the
        webhook&apos;s payment-stub insert (<code>buildPaymentStubLeadFields</code>) fell back to a
        title-cased slug as the CRM <code>businessName</code> (e.g. <code>organic-a1b2c3</code>{" "}
        → &quot;Organic A1b2c3&quot;) and a placeholder <code>(555) 000-0000</code> phone — both of
        which then rendered verbatim in the receipt and go-live emails a paying customer actually
        receives. <code>CheckoutForm</code> now shows optional <em>Business name</em> /{" "}
        <em>Business phone</em> inputs, but only when <code>prefill.businessName</code> is absent
        (an existing lead&apos;s real CRM fields must never be editable from anonymous checkout).
        Values are soft-capped (<code>normalizeCheckoutBusinessName</code>/
        <code>normalizeCheckoutBusinessPhone</code>, <code>src/lib/checkout/business-fields.ts</code>{" "}
        — reusing the existing <code>MAX_BUSINESS_NAME_LENGTH</code>/
        <code>MAX_CONTACT_PHONE_LENGTH</code> caps, never hard-rejecting a checkout over a cosmetic
        field) and carried as Stripe Checkout Session metadata, re-validated the same way{" "}
        <code>acquisitionSource</code> already is on the webhook side, then threaded through{" "}
        <code>recordLeadPayment</code> → <code>buildPaymentStubLeadFields</code>&apos;s new optional{" "}
        <code>overrides</code> parameter on both backends. An existing lead (<code>leadExists</code>{" "}
        true) never has these values applied — only a brand-new payment-stub row. Because the
        webhook already re-fetches the lead via <code>getLeadBySlug</code> immediately after{" "}
        <code>recordLeadPayment</code> to build its own local <code>businessName</code> for the
        receipt/handoff emails, no separate email-template change was needed — it picks up the
        real name automatically once persistence uses it.
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
        Mark live during the Vercel window is not silently reverted. Every Vercel Domains
        API call (register and release) carries a 15s <code>AbortSignal.timeout</code> (
        <code>VERCEL_REQUEST_TIMEOUT_MS</code>) so a hung Vercel response fails fast into
        the existing network-error handling (
        <code>{'vercelDomainStatus: "error_network"'}</code>) instead of blocking{" "}
        <code>enqueueProductionHandoff</code>, which is awaited
        synchronously from the paid-checkout Stripe webhook path — same class as the
        Anthropic generator fetch timeout below. A hard <code>tryProvisionVercelDomain</code>{" "}
        failure (any <code>vercelDomainStatus</code> starting with <code>error_</code>) is
        deliberately never reflected in <code>status</code> itself, so it looked identical
        to an ordinary handoff still awaiting the customer&apos;s own DNS change with zero
        operator visibility — <code>isVercelDomainProvisioningFailed</code>{" "}
        (<code>src/lib/deploy/handoff-preserve.ts</code>) now feeds a dedicated
        pipeline-health metric card and daily-digest row flag so a broken automated
        domain registration surfaces distinctly and gets a manual Vercel-console fix
        instead of silently waiting on DNS that will never arrive (see{" "}
        vercel-domain-provisioning-failure-visibility). The initial digest wiring only
        added the per-row flag inside the open-handoffs list, which is sorted
        oldest-first and capped at 5 — a failure on a newer handoff could fall outside
        that window and never reach the email, and the signal was never added to{" "}
        <code>actionableSections</code> (the single source of truth for{" "}
        <code>actionableItemCount</code> and the &quot;Nothing urgent today&quot;
        empty-state gate), so a digest whose only actionable item was a provisioning
        failure could misreport as empty — the same{" "}
        <code>daily-digest-empty-state-copy-drift</code> bug class the digest&apos;s own
        section-list refactor exists to prevent. Fixed by giving it its own uncapped
        count/age aggregate and dedicated digest section (see{" "}
        vercel-domain-provisioning-failure-digest-visibility). Bundle webhook
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
        (Work next queue + Quality column). Once a lead&apos;s 3-email sequence is exhausted,{" "}
        <code>scoreLead</code> reuses <code>isColdLead</code> — the same predicate the Cold
        leads due-queue (<code>listColdLeads</code>) is built from — rather than its own
        separate staleness cutoff: a lead that panel already flags for Re-engage/Close is
        forced to band <code>&quot;cold&quot;</code> and <code>actionable: false</code> so it
        cannot also occupy one of the (limited) Work next slots. Before{" "}
        <code>outreach-cold-quality-score-threshold-drift</code>, scoring used a hardcoded
        14-day cutoff while <code>isColdLead</code> fires at <code>COLD_AFTER_DAYS</code> (4
        days), so a lead already prompting Re-engage/Close on the Cold leads panel could still
        score hot and rank in Work next for up to 10 more days. Preview opens record{" "}
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
        <code>ANTHROPIC_API_KEY</code> is set. The Anthropic <code>fetch</code> carries a 30s{" "}
        <code>AbortSignal.timeout</code> so a hung/stalled connection fails fast into the stub
        fallback like any other error, rather than tying up the request for the hosting
        platform&apos;s own function-duration ceiling (direct Vitest coverage in{" "}
        <code>generators.test.ts</code> for stub edge branches + Anthropic blank-key / HTTP /
        parse / length-mismatch / timeout fallbacks and <code>packageTier</code>;{" "}
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
      <p>
        <code>formatMarketingVariantForBuffer</code> intentionally diverges from the dashboard
        &quot;Copy&quot; button and the emailed pack deliverable&apos;s shared{" "}
        <code>&quot;CTA: &quot;</code>-prefixed layout: Buffer&apos;s <code>createBufferUpdate</code>{" "}
        text is published straight to the lead&apos;s live Facebook/Instagram profile with no
        operator review step in between, while the Copy button and the emailed pack are both
        human-reviewed before anything goes out. The literal <code>&quot;CTA: &quot;</code> label
        reads fine in a reviewed copy buffer or client email, but published unedited to a real
        customer&apos;s public feed it read as leftover template text (
        <code>buffer-auto-post-cta-label-leak</code>) — the call to action is now folded in as its
        own line instead.
      </p>
      <p>
        <code>createBufferUpdate</code> sends the access token via the{" "}
        <code>Authorization</code> header, not the request body — it originally set{" "}
        <code>access_token</code> as a field on the same <code>URLSearchParams</code> body as{" "}
        <code>profile_ids[]</code>/<code>text</code>, the credential-leakage risk class{" "}
        <code>listBufferProfiles</code> was already explicitly hardened against (
        <code>buffer-token-header-not-query</code>): a form-encoded POST body is exactly what
        APM/error-monitoring tools, reverse-proxy body-logging, and HTTP debug/replay tooling
        commonly capture even when headers are redacted by default, and this is the
        higher-volume call site — invoked once per profile × pack variant on every schedule
        run, not once per operator account. Fixed to mirror <code>listBufferProfiles</code>
        &apos;s header-only pattern (<code>buffer-update-token-header-not-body</code>).
      </p>
      <p>
        <code>seasonal-promo-scaffold</code>: the homepage/<DocLink href="/docs/product-bundles">
          Product bundles
        </DocLink>{" "}
        Complete-tier bullet &quot;Full marketing — seasonal promos, A/B variants&quot; had no
        dashboard fulfillment path at all — <code>seasonal_promo</code>/<code>ad_copy</code> were
        reachable only via the raw <code>POST /api/marketing/generate</code> route, undocumented
        beyond &quot;ad-hoc, non-persisted.&quot; Shipped{" "}
        <code>generateSeasonalPromoAction</code> (<code>src/app/dashboard/leads/actions.ts</code>):
        gated by <code>leadEligibleForSeasonalPromo</code> (
        <code>src/lib/marketing/seasonal-promo.ts</code>) — paid/live stage AND an active{" "}
        <code>complete</code>-tier order specifically, reusing <code>bestMarketingOrderTier</code>
        &apos;s entitlement check rather than a raw tier-string compare — Growth-tier leads are not
        eligible, since this is the one feature that genuinely differentiates Complete&apos;s
        &quot;Full marketing&quot; from Growth&apos;s identical monthly pack (see section 7 above).
        Requests two <code>seasonal_promo</code> A/B variants plus one <code>ad_copy</code> piece
        via <code>seasonalPromoRequestForLead</code>. A new <code>BusinessContext.campaignContext</code>{" "}
        field (soft-capped at the tagline bound, <code>MAX_CAMPAIGN_CONTEXT_LENGTH</code>) carries
        an operator-named occasion (e.g. &quot;Labor Day weekend&quot;) into both the Anthropic
        prompt and the stub generator — every content type other than{" "}
        <code>seasonal_promo</code>/<code>ad_copy</code> ignores it. Left blank, it defaults to{" "}
        <code>defaultSeasonalPromoOccasion</code>: the current UTC calendar month (e.g. &quot;July
        promotion&quot;) — deliberately never a &quot;season&quot; word (summer/winter/etc.), since
        that guess is wrong for roughly half the world&apos;s businesses depending on hemisphere
        and this app has no reliable signal for which hemisphere a lead is in. Like the ad-hoc
        route this is intentionally NOT persisted — no DB row, no monthly cadence — the dashboard
        panel holds the result only in component state until the operator copies it or navigates
        away. Direct Vitest coverage: <code>seasonal-promo.test.ts</code> (eligibility, occasion
        default/soft-cap/override, request shape),{" "}
        <code>generate-seasonal-promo-action.test.ts</code> (auth, rate limit, eligibility gate,
        no-persist assertion, stub-vs-anthropic labeling — mirroring{" "}
        <code>generate-marketing-pack-action.test.ts</code>&apos;s pattern), and extended{" "}
        <code>generators.test.ts</code> / <code>generate-limits.test.ts</code> /{" "}
        <code>marketing/generate/route.test.ts</code> cases for{" "}
        <code>campaignContext</code> plumbing end to end.
      </p>

      <h2>8. Client AI phone (Complete)</h2>
      <p>
        FAQ/script packs: <code>src/lib/voice/</code> builds a 6-script receptionist pack via{" "}
        <code>StubClientVoiceGenerator</code> or <code>AnthropicClientVoiceGenerator</code> when{" "}
        <code>ANTHROPIC_API_KEY</code> is set — same 30s <code>AbortSignal.timeout</code> on the
        Anthropic <code>fetch</code> as the marketing generator above (direct Vitest coverage in{" "}
        <code>src/lib/voice/generators.test.ts</code> for stub edge branches + Anthropic blank-key /
        HTTP / parse / length-mismatch / timeout fallbacks, title fallback, and title/body/cta soft-caps on
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
        orphaned duplicate. Finding an existing Product by key only ever reused it as-is until{" "}
        <code>commerce-sku-stripe-product-name-resync</code>: Stripe Prices are immutable (hence the
        create-a-new-Price-on-change behavior above) but Products are mutable, and{" "}
        <code>syncCommerceCatalogToStripe</code> was never diffing the found Product&apos;s name
        against the current <code>businessName</code>/SKU name — an operator renaming a SKU (or the
        lead&apos;s business name changing) and clicking <strong>Sync to Stripe</strong> again left
        the live Stripe Product name frozen at whatever it was first created as, forever, even
        though the catalog/storefront correctly showed the new name — a shopper&apos;s Buy now
        Checkout Session and email receipt would keep reading the stale name indefinitely. Fixed by
        comparing the found Product&apos;s <code>name</code> to the freshly-computed{" "}
        <code>businessName — item.name</code> string and calling <code>products.update</code> with
        the new name when they differ (a no-op comparison, not an unconditional call, so a
        no-rename re-sync makes zero extra Stripe API calls). The same gap existed for the SKU{" "}
        <code>description</code> field until{" "}
        <code>commerce-sku-stripe-product-description-sync</code>: it was captured, length-capped,
        and shown on the public storefront card, but <code>syncCommerceCatalogToStripe</code> never
        forwarded it to Stripe at all — the Buy now Checkout Session Stripe itself renders (built
        from the Product) showed only the bare name/price, silently dropping whatever helpful detail
        the operator wrote right before the shopper paid. Fixed the same way as the name resync:{" "}
        <code>products.create</code> now includes <code>description</code> when present, and the
        existing name-diff check was widened to also diff description and call{" "}
        <code>products.update</code> with both fields when either changed (still a no-op comparison,
        not an unconditional call). Action-level
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
        <code>preserveCommerceStripeIds</code> / Sync-to-Stripe Product keys.{" "}
        <code>normalizeCommerceItems</code> also hard-rejects a client-submitted id that
        duplicates an earlier row in the same save — two SKUs sharing an id would sync to
        the same <code>commerceSkuStripeKey</code> Stripe Product with distinct Prices, and{" "}
        <code>preserveCommerceStripeIds</code>&apos;s id-keyed map would silently drop one
        duplicate&apos;s Stripe id association on the next save.{" "}
        <code>saveCommerceCatalogAction</code> itself was, until{" "}
        <code>dashboard-action-rate-limit-gaps</code>, one of five dashboard server actions
        (alongside <code>markHandoffLiveAction</code>, <code>updateInquiryStatusAction</code>,{" "}
        <code>updateLeadNotesAction</code>, and <code>snoozeLeadAction</code>) with no{" "}
        <code>checkRateLimit</code> call — every sibling write action in{" "}
        <code>src/app/dashboard/leads/actions.ts</code> already throttles per client IP after{" "}
        <code>requireOperatorAuth</code>, since auth alone is not a throttle when{" "}
        <code>OPERATOR_DASHBOARD_PASSWORD</code> is unset (the documented open-demo state). All
        five now call <code>checkRateLimit</code> with their own key (
        <code>commerce-catalog-save</code>, <code>deploy-handoff-mark-live</code>,{" "}
        <code>inquiry-status-update</code>, <code>lead-notes-update</code>,{" "}
        <code>lead-snooze</code>) immediately after the auth check, matching every other action in
        the file.{" "}
        <code>dashboard-action-rate-limit-gaps-followup</code> closed the two remaining gaps that
        pass&apos;s own action-by-action inventory missed: <code>markCommerceOrderPaidOutAction</code>{" "}
        (a state-changing money-payout write reachable with any client-submitted{" "}
        <code>stripeSessionId</code>) and <code>getCommerceCatalogAction</code> (a read fired every
        time the catalog editor opens) — the only two of this file&apos;s ~35 exported actions still
        missing the standard{" "}
        <code>checkRateLimit</code> call, now keyed <code>commerce-order-mark-paid-out</code> and{" "}
        <code>commerce-catalog-get</code> respectively. Route-level Vitest
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
        (pass-through)&quot;) — unpaid/owed only, via the shared{" "}
        <code>isCommerceOrderOwed</code> predicate (rows with <code>paidOutAt</code>,{" "}
        <code>refundedAt</code>, or <code>disputedAt</code> set are excluded, and so is any row
        with <code>amountPaidUsd === 0</code> — a 100%-off promo-code Buy now order settles at{" "}
        <code>no_payment_required</code> with nothing ever paid to the platform, so there is
        nothing to hand off; see <code>commerce-order-zero-amount-owed-exclusion</code> —
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
        Stripe-hosted onboarding link, and check live{" "}
        <code>charges_enabled</code>/<code>payouts_enabled</code>/<code>details_submitted</code>{" "}
        status. <code>leads.stripeConnectAccountId</code> (Convex + SQLite,{" "}
        <code>LEAD_STRIPE_CONNECT_CONVEX_PRIMARY</code> requireConvex fail-closed) is the only
        fail-closed persisted field — <strong>account creation and status-checking carry no
        money-movement risk</strong>. Since{" "}
        <code>stripe-connect-onboarding-pipeline-health-visibility</code> (2026-07-23),{" "}
        <code>checkStripeConnectAccountStatusAction</code> also caches its live result onto the
        lead (<code>stripeConnectChargesEnabled</code>/<code>stripeConnectPayoutsEnabled</code>/
        <code>stripeConnectDetailsSubmitted</code>/<code>stripeConnectStatusCheckedAt</code>,
        plus a set-once <code>stripeConnectAccountCreatedAt</code> written alongside the account
        id) — a display cache only (Stripe&apos;s own account object stays the source of truth).
        This cache write now passes{" "}
        <code>LEAD_STRIPE_CONNECT_STATUS_CONVEX_PRIMARY</code> (requireConvex fail-closed, same
        shape as <code>LEAD_STRIPE_CONNECT_CONVEX_PRIMARY</code> above) as of{" "}
        <code>stripe-connect-status-cache-convex-fail-closed</code> (2026-07-24) — originally
        shipped as an unconditional Convex→SQLite fallback (&quot;best-effort, same class as{" "}
        <code>updateLeadBufferPostedVariantKeys</code>&quot;), which turned out to be the wrong
        precedent: unlike the Buffer field, this cache feeds{" "}
        <code>connectOnboardingIncompleteCount</code>, a cross-instance due-queue metric that
        reads Convex-first, so a Convex mutation failure previously wrote the freshly checked
        status to instance-local SQLite only — silently split-braining that count until a later
        check happened to land on Convex successfully. Failing closed here means{" "}
        <em>skip persistence</em>, not <em>fail the request</em>:{" "}
        <code>checkStripeConnectAccountStatusAction</code> still wraps the persist call in a
        try/catch that swallows the resulting <code>ConvexPrimaryWriteError</code> the same as
        any other persist failure, so an already-successful live check is never turned into a
        reported error. This closes a
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
        <code>status: &quot;todo&quot;</code>. All four actions are gated behind{" "}
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
        Until <code>account-updated-connect-status-refresh</code> (2026-07-25), the ONLY code
        path that ever refreshed <code>stripeConnectChargesEnabled</code>/
        <code>PayoutsEnabled</code>/<code>DetailsSubmitted</code> was an operator&apos;s manual{" "}
        <strong>Check status</strong> click — so the &quot;Stripe Connect onboarding
        incomplete&quot; due-queue signal (<code>connectOnboardingIncomplete</code>) could never
        self-correct once an operator stopped re-checking a lead, even after the client actually
        finished onboarding on Stripe&apos;s hosted flow. The webhook route now also handles{" "}
        <code>account.updated</code>: it looks up the account id against every lead&apos;s{" "}
        <code>stripeConnectAccountId</code> (a linear scan over <code>getLeads()</code> —
        this dormant, low-volume scaffold has no dedicated reverse index, mirroring{" "}
        <code>findConnectAccountByLeadSlug</code>&apos;s own full-scan shape for the opposite
        direction) via the new <code>findLeadSlugByStripeConnectAccountId</code>{" "}
        (src/lib/commerce/stripe-connect.ts), and on a match persists the fresh flags through the
        same <code>updateLeadStripeConnectStatus</code> call{" "}
        <strong>Check status</strong> already uses, including the same{" "}
        <code>LEAD_STRIPE_CONNECT_STATUS_CONVEX_PRIMARY</code> fail-closed-on-Convex-error,
        swallow-and-continue policy — this caches a display value, not a ledger entry, so a
        persist failure never turns a valid Stripe event into a 5xx. No match (an account this app
        never created, or one whose id write never succeeded) is a silent no-op, not an error.
        Stripe only forwards Connect account events to the platform&apos;s webhook endpoint when
        the operator also checks <strong>Listen to events on connected accounts</strong> for that
        endpoint in the Stripe Dashboard (or adds a second Connect-scoped endpoint) — see{" "}
        <DocLink href="/docs/launch-checklist">launch checklist</DocLink> for the exact toggle;
        enabling the event type in <strong>Select events</strong> alone is not enough for this
        one event, unlike every other type in that same list.
      </p>

      <p>
        <code>checkStripeConnectAccountStatusAction</code> itself had a matching, narrower gap
        (<code>check-stripe-connect-status-action-revalidate-path</code>, 2026-07-26): it correctly
        persisted the fresh flags via <code>updateLeadStripeConnectStatus</code>, the exact same
        write <code>account.updated</code> above now also performs, but never called{" "}
        <code>revalidatePath(&quot;/dashboard/leads&quot;)</code> afterward — unlike every other
        mutating action in src/app/dashboard/leads/actions.ts. Pipeline-health&apos;s{" "}
        <code>connectOnboardingIncompleteCount</code> MetricCard and the daily digest are both
        computed server-side from <code>getLeads()</code> on <code>/dashboard/leads</code>, so an
        operator&apos;s <strong>Check status</strong> click that flipped{" "}
        <code>charges_enabled</code>/<code>payouts_enabled</code> true left that due-queue count
        stale on the same page until an unrelated action revalidated the same path or the operator
        did a hard reload — the identical missing-revalidatePath-after-a-persisting-write bug class{" "}
        <code>buffer-schedule-action-revalidate-path</code> closed for the Buffer scheduling
        action one session earlier. Fixed by calling <code>revalidatePath</code> immediately after
        a successful persist (skipped on a failed/fail-closed persist, since nothing changed in the
        store on that branch — there is nothing to invalidate).
      </p>

      <p>
        Stripe&apos;s <code>account_onboarding</code> Account Links are single-use and expire
        quickly if unopened — the original <strong>Get onboarding link</strong> flow only copied
        the freshly-minted URL to the operator&apos;s clipboard with an alert asking them to send
        it elsewhere, and that manual copy/switch-apps/paste/send hand-off routinely outlasted the
        link&apos;s live window, handing the client an already-dead URL with no signal anything
        had expired. As of <code>stripe-connect-onboarding-link-email-delivery</code> (2026-07-24),
        a fourth action, <code>sendStripeConnectOnboardingLinkToClientAction</code>, closes that
        race structurally instead of just warning about it: it mints a brand-new link (never
        reused or cached, so a second click after an expired first attempt just works) and emails
        it directly to <code>lead.email</code> in the same request via{" "}
        <code>sendStripeConnectOnboardingLinkEmail</code> (src/lib/email/resend.ts,{" "}
        <code>skipSuppression: true</code> — same billing-critical class as the dunning/
        subscription-pause notices, not cold marketing). The Payouts panel exposes this as a
        second, adjacent <strong>Email onboarding link</strong> button next to the original copy
        button, which stays available (an operator may prefer to hand-deliver via phone/text) but
        whose alert copy now points at the email button as the more reliable default.
      </p>

      <p>
        Both onboarding-link actions had a distinct, unrelated defect in the link&apos;s own{" "}
        <code>refresh_url</code>/<code>return_url</code>{" "}
        (<code>stripe-connect-onboarding-link-client-facing-redirect</code>, 2026-07-26): both
        pointed at <code>/dashboard/leads</code> — but this link is routinely handed off to the
        external local business completing Stripe&apos;s own hosted KYC flow, whether pasted by
        the operator or emailed directly via the button above, never opened only in the
        operator&apos;s own browser. <code>/dashboard/leads</code> is operator-auth gated (
        <code>proxy.ts</code>&apos;s <code>dashboardAuthGate</code>): a client landing there after
        finishing or refreshing the Stripe flow either bounced to{" "}
        <code>/dashboard/login</code> with no confirmation their onboarding was accepted, or — on
        an open-demo deployment with <code>OPERATOR_DASHBOARD_PASSWORD</code> unset — loaded the
        operator&apos;s internal Leads CRM outright, leaking every other lead&apos;s name/email/
        notes/revenue to a third party who was only supposed to complete their own onboarding.
        Both actions now point <code>refresh_url</code> and <code>return_url</code> at the
        lead&apos;s own public preview page (<code>leadPreviewAbsoluteUrl</code>) instead — a
        real, reachable, single-lead-scoped page every lead already has, even though it has no
        dedicated onboarding-status confirmation state of its own.
      </p>

      <p>
        <code>sendStripeConnectOnboardingLinkToClientAction</code> had one more gap
        (<code>stripe-connect-onboarding-link-send-race-guard</code>): unlike every sibling
        client-facing send action in this file — Starter upsell, the marketing/voice pack client
        sends, checkout-recovery nudges — it had zero duplicate-send protection at all, no sent
        marker and no compare-and-swap guard. A second dashboard tab, or a double-click before the
        button&apos;s <code>isPending</code>-disabled state applied, could mint two separate
        onboarding links and email both to the client with no operator-visible signal that a
        duplicate went out. Fixed the same way as{" "}
        <code>starter-upsell-send-race-guard</code>: a new{" "}
        <code>stripeConnectOnboardingLinkSentCount</code>/
        <code>lastStripeConnectOnboardingLinkSentAt</code> pair (both backends) tracks a monotonic
        send count, and <code>recordStripeConnectOnboardingLinkSent</code> only applies its write
        when the caller&apos;s <code>expectedStripeConnectOnboardingLinkSentCount</code> still
        matches the row&apos;s current count — an exact concurrent duplicate is rejected and
        surfaces as <code>success: false</code>, while a later, deliberate resend (an operator
        emailing a fresh link after an earlier one expired) always succeeds since it reads the
        current count first. The marker write is best-effort on a thrown error (the email already
        sent, so a persistence failure must not turn a successful send into a reported failure)
        but a resolved <code>false</code> — proof of a genuine race — is not discarded.
      </p>

      <p>
        A fresh-angle accessibility audit (2026-07-26,{" "}
        <code>stripe-connect-payouts-panel-form-error-inline-aria-announcement</code>) found the
        Payouts panel&apos;s four action buttons — <strong>Create Connect account</strong>,{" "}
        <strong>Get onboarding link</strong>, <strong>Email onboarding link</strong>, and{" "}
        <strong>Check status</strong> — still routed every failure through a bare{" "}
        <code>alert()</code>, unlike the Commerce catalog editor&apos;s{" "}
        <code>commerceCatalogError</code> two elements above them in the same panel (fixed by the
        earlier <code>leads-client-form-error-inline-aria-announcement</code> pass, which shipped
        before this Payouts scaffold&apos;s own error paths existed and so never covered them).
        Fixed by adding a <code>stripeConnectError</code> state — mirroring{" "}
        <code>commerceCatalogError</code>&apos;s shape exactly, since only one commerce
        editor/Payouts panel can be open at a time — cleared whenever the shared editor opens or
        closes and rendered as a <code>role=&quot;alert&quot;</code> message beneath the button
        row instead of interrupting the page. Only the four failure branches changed; the
        existing success-path <code>alert()</code> calls (copied onboarding link, queued/sent
        confirmation) are unchanged, matching this series&apos; scope of fixing error
        announcements only.
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
        Until <strong>revenue-total-usd-renewal-gap</strong>,{" "}
        <code>PipelineHealth.revenueTotalUsd</code> summed <code>orders.amountPaid</code> directly
        — the amount Stripe charged on the Checkout Session that created the order, i.e. the{" "}
        <em>first billing period only</em>. A Growth/Complete/Commerce-addon subscriber&apos;s
        monthly renewals never touched that field at all: <code>invoice.paid</code>&apos;s
        existing handling only restores/syncs recurring entitlement (above) and, even then, only
        for the notify path when a prior pause actually cleared. So the headline &quot;Recorded
        revenue&quot; card silently stopped growing for any subscriber past their first cycle,
        understating real collected revenue more with every billing period a subscriber stayed
        active. Fixed by adding <code>orders.lifetimeRevenueUsd</code> (cumulative USD collected)
        and <code>lastRenewalInvoiceId</code> (redelivery idempotency marker) alongside the
        existing recurring-entitlement handling: on every <code>invoice.paid</code> whose{" "}
        <code>billing_reason</code> is <code>subscription_cycle</code> (i.e. NOT the
        subscription&apos;s first invoice, already counted via <code>amountPaid</code> at order
        creation) with a positive <code>amount_paid</code>,{" "}
        <code>recordSubscriptionRenewalPayment</code> adds that invoice&apos;s amount onto the
        customer&apos;s currently sold-capability-entitled order (
        <code>orderGrantsSoldCapabilityEntitlement</code> — a canceled, refunded, or disputed order
        must not accrue further recorded revenue), skipping a redelivered invoice whose id already
        matches. This runs unconditionally (not gated on <code>cleared &gt; 0</code> like the
        notify path) since an ordinary healthy renewal — the common case — is exactly where
        revenue needs recording; a write failure returns <code>500</code> /{" "}
        <code>subscription_renewal_revenue</code> so Stripe retries rather than silently losing a
        renewal&apos;s revenue count. <code>orderLifetimeRevenueUsd</code> reads{" "}
        <code>lifetimeRevenueUsd</code>, falling back to <code>amountPaid</code> for a pre-existing
        row or a non-recurring (Starter) order that has never renewed — no migration/backfill
        needed. The three Convex mutations that replace-rewrite an{" "}
        <code>orders</code> row wholesale (<code>clearRecurringCanceledByCustomer</code>,{" "}
        <code>clearRefunded</code>, <code>clearDisputed</code>) now carry{" "}
        <code>lifetimeRevenueUsd</code>/<code>lastRenewalInvoiceId</code> forward explicitly, or a
        resubscribe/refund-reversal/dispute-win would silently wipe previously-recorded renewal
        revenue the same way an earlier omission would have cleared <code>refundedAt</code>/
        <code>disputedAt</code>. Left as a follow-up rather than folded into this fix: a dispute or
        refund on a renewal charge itself had no correlation path back to the order at all (
        <code>charge.refunded</code>/<code>charge.dispute.created</code> resolve via{" "}
        <code>stripe.checkout.sessions.list({"{ payment_intent }"})</code>, but a renewal
        invoice&apos;s PaymentIntent is created directly by Stripe&apos;s billing system, never
        through a Checkout Session) — a renewal-charge refund/dispute previously neither reduced{" "}
        <code>lifetimeRevenueUsd</code> nor set <code>refundedAt</code>/<code>disputedAt</code>,
        a real revenue-overstatement and clawback-blind-spot gap given{" "}
        <code>orderCountsTowardRevenue</code> excludes a flagged order&apos;s entire{" "}
        <code>lifetimeRevenueUsd</code> (not a partial amount) from{" "}
        <code>revenueTotalUsd</code>.
      </p>

      <p>
        Fixed by <strong>renewal-charge-refund-dispute-customer-correlation</strong>: when the
        Checkout Session lookup on <code>charge.refunded</code> misses, fall back to correlating
        via the charge&apos;s own Stripe Customer id (<code>charge.customer</code> — present
        directly on the Charge object, no extra Stripe API call needed) instead of giving up.
        <code>charge.dispute.created</code> needs one extra step first — unlike Charge, Dispute
        carries no <code>.customer</code> field of its own — so it retrieves the PaymentIntent (
        <code>stripe.paymentIntents.retrieve</code>) to read <em>its</em> <code>.customer</code>{" "}
        before the same correlation. Either way, once a Stripe Customer id is in hand,{" "}
        <code>getOrdersByStripeCustomerId</code> resolves that customer&apos;s order rows and{" "}
        <code>.find()</code> picks the one to flag. <strong>
          renewal-charge-refund-dispute-customer-correlation-paused-order-fix
        </strong>{" "}
        (a same-day follow-up) corrected the predicate used there from{" "}
        <code>orderGrantsSoldCapabilityEntitlement</code> to <code>orderHadRecurringEntitlement</code>{" "}
        (tier/<code>commerceAddon</code> only, ignoring <code>recurringCanceledAt</code>/
        <code>refundedAt</code>/<code>disputedAt</code>) — the original version used the same
        lookup <code>recordSubscriptionRenewalPayment</code> uses, but that predicate also requires
        the order&apos;s recurring entitlement to be currently active and not already flagged, so it
        silently failed to correlate exactly the orders most likely to need it: a subscription
        already paused (<code>recurringCanceledAt</code> set, e.g. from a prior{" "}
        <code>invoice.payment_failed</code> — a card problem serious enough to trigger a chargeback
        often also breaks the next renewal charge) or a second independent refund/dispute on the
        same customer after the first one already set <code>refundedAt</code>/
        <code>disputedAt</code>. This is the same bug class{" "}
        <code>orderEligibleForPauseNotice</code> (below) already exists to avoid — the fallback
        reused the wrong predicate on first ship. The explicit{" "}
        <code>recurringOrder.refundedAt</code>/<code>disputedAt</code> check immediately after the{" "}
        <code>.find()</code> still correctly no-ops a redelivery.{" "}
        <code>markOrderRefunded</code>/<code>markOrderDisputed</code> are called against the
        resolved order&apos;s own (original signup) <code>stripeSessionId</code>, which is what
        those mutations are keyed on regardless of which charge in the subscription&apos;s
        lifetime triggered the event. Both new lookups are required or gate the same money-ledger
        write as the Session-based path, so a transient failure returns 500 (
        <code>bundle_order_renewal_customer_lookup</code> /{" "}
        <code>bundle_order_dispute_renewal_payment_intent_lookup</code>) rather than silently
        skipping — Stripe retries. Deliberately not attempted: reducing{" "}
        <code>lifetimeRevenueUsd</code> by only the disputed/refunded charge&apos;s own amount.
        The existing whole-order exclusion (<code>orderCountsTowardRevenue</code>) already treats
        any refund/dispute on the <em>original</em> signup charge as a full exclusion, not a
        partial one — this fix keeps that same approximation for a renewal-charge refund/dispute
        rather than introducing a second, inconsistent semantics for one specific charge in an
        order&apos;s lifetime.
      </p>

      <p>
        The two fixes above shipped the customer-id correlation fallback only for the{" "}
        <em>opened</em> events (<code>charge.refunded</code>, <code>charge.dispute.created</code>)
        — their resolution/reversal twins (<code>refund.updated</code>,{" "}
        <code>charge.dispute.closed</code>) still resolved a Checkout Session only, and simply{" "}
        <code>break</code>-ed when none matched. Since a renewal charge&apos;s PaymentIntent is
        never attached to a Checkout Session in the first place, every event tied to that charge —
        not just the original one — misses that lookup, including a later reversal or closure.
        Concretely: a renewal-cycle order correctly got <code>refundedAt</code>/
        <code>disputedAt</code> set via the customer-id fallback when the renewal charge was
        refunded/disputed, but if that refund then reversed (an ACH/bank refund failure, the
        exact case <code>commerce-order-refund-reversal-tracking</code> exists for) or the dispute
        resolved <code>won</code>/<code>warning_closed</code>, the closing handler could not find
        a Checkout Session and never cleared the flag — a real, non-self-healing revenue-
        understatement bug with no recovery path short of a manual DB edit, exactly the{" "}
        &quot;opened&quot; vs &quot;closed/reversed&quot; twin gap the money/ledger integrity rules
        exist to prevent, reappearing on this newer renewal-charge correlation path. Fixed by{" "}
        <strong>refund-updated-dispute-closed-customer-correlation-fallback</strong>: both{" "}
        <code>refund.updated</code> and <code>charge.dispute.closed</code> now fall back to the
        same customer-id correlation when the Session lookup misses.{" "}
        <code>refund.updated</code> reuses the <code>Stripe.Charge</code> object it already
        re-fetched for the <code>refund-reversal-charge-aggregate-recheck</code> aggregate
        <code>amount_refunded</code> recheck (no second Stripe API call) to read{" "}
        <code>.customer</code> directly, preserving that invariant — the aggregate recheck still
        runs and gates the fallback, so a still-in-effect different partial refund on the same
        charge still blocks the clear regardless of which correlation path resolved the order.{" "}
        <code>charge.dispute.closed</code> retrieves the PaymentIntent for its{" "}
        <code>.customer</code> the same way <code>charge.dispute.created</code> already does (
        Dispute carries no <code>.customer</code> of its own), then branches exactly like its
        existing Session-based path: <code>won</code>/<code>warning_closed</code> clears{" "}
        <code>disputedAt</code> (idempotent no-op if already clear); <code>lost</code> ensures it
        is set (idempotent no-op if already set, covering a missed <code>created</code> event).
        The customer-order lookup itself (<code>getOrdersByStripeCustomerId</code> +{" "}
        <code>orderHadRecurringEntitlement</code>) was factored into a single shared{" "}
        <code>findRecurringOrderByStripeCustomerId</code> helper in route.ts, now called from all
        four handlers, so a future predicate correction (like the paused-order-fix above) only
        needs to change one place instead of drifting across up to four duplicated call sites.
        Both new failure paths are required (500 on failure, Stripe retries) since they gate the
        same money-ledger write as every other path in this fallback family.
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

      <p>
        A fresh-angle accessibility audit (2026-07-26,{" "}
        <code>checkout-tier-radiogroup-fieldset-legend</code>) found{" "}
        <code>/checkout</code> — the single highest-commitment page in the funnel, the page a
        shopper lands on right before entering payment — rendered its three bundle-tier{" "}
        <code>&lt;input type=&quot;radio&quot; name=&quot;tier&quot;&gt;</code> controls
        (<code>checkout-form.tsx</code>) inside a bare <code>&lt;div&gt;</code> with no{" "}
        <code>&lt;fieldset&gt;</code>/<code>&lt;legend&gt;</code> and no{" "}
        <code>aria-label</code>/<code>aria-labelledby</code> tying the group to the descriptive
        copy above it. A screen-reader user who jumps straight to the form controls (NVDA/JAWS
        form-navigation, VoiceOver&apos;s rotor) instead of reading the whole page linearly heard
        only &quot;radio button, checked/not checked&quot; with no indication these three controls
        are mutually exclusive pricing tiers — this codebase&apos;s only radio group, so the gap
        had no precedent to have been caught by. <code>eslint-plugin-jsx-a11y</code> has no rule
        requiring fieldset/legend grouping for a same-<code>name</code> radio set, so{" "}
        <code>npm run lint</code> never flagged it across the ~40 prior same-day accessibility
        passes. Fixed by wrapping just the three tier <code>&lt;label&gt;</code>s (not the
        separate Commerce add-on checkbox below them, which is an independent control) in a{" "}
        <code>&lt;fieldset&gt;</code> reset to <code>border-0 p-0 m-0</code> so no default browser
        chrome changes the visual layout, with a <code>sr-only</code> <code>&lt;legend&gt;</code>{" "}
        (&quot;Choose your bundle&quot;) — the existing visible descriptive paragraph above is left
        exactly as-is.
      </p>

      <p>
        A fresh-angle accessibility audit (2026-07-26,{" "}
        <code>leads-client-kanban-action-inline-aria-announcement</code>) found the two prior
        alert()-to-inline-aria passes on this page (
        <code>leads-client-form-error-inline-aria-announcement</code> and{" "}
        <code>stripe-connect-payouts-panel-form-error-inline-aria-announcement</code>) had each
        closed only the specific surfaces they named — a direct grep for <code>alert(</code> in{" "}
        <code>leads-client.tsx</code> still found 33 call sites, including the highest-traffic
        controls on the main Kanban board itself: the pipeline-stage <code>&lt;select&gt;</code>,
        the snooze/unsnooze buttons, and the cold-lead Re-engage/Close buttons — every one of them
        run far more often per day than the Payouts-panel or Commerce-catalog surfaces the earlier
        two passes fixed. Scoped this pass to those four highest-traffic handlers (
        <code>handleStageChange</code>, <code>handleSnooze</code>, <code>handleClearSnooze</code>,{" "}
        <code>handleColdDisposition</code>) rather than all 33 remaining call sites, to keep the
        diff reviewable; the rest are a documented follow-up for a future pass. Fixed by adding a{" "}
        <code>leadActionErrors</code> state keyed by lead slug (these four handlers, unlike{" "}
        <code>stripeConnectError</code>&apos;s single-panel scope, can each fire independently on
        any visible row, and some are triggered from the due-queue panels above the table as well
        as the table itself) — cleared at the start of each handler for that slug, and rendered as
        a single <code>role=&quot;alert&quot;</code> paragraph beneath the row&apos;s action
        buttons in the main table (the one place every affected lead is always mounted, matching
        the existing convention of refocusing back to this row&apos;s Notes toggle after a
        due-queue action). The stage <code>&lt;select&gt;</code> additionally gained{" "}
        <code>aria-invalid</code>/<code>aria-describedby</code> pointing at that paragraph.
      </p>

      <p>
        A follow-up fresh-angle pass (2026-07-27,{" "}
        <code>commerce-catalog-sync-archive-inline-aria-announcement</code>) found the same{" "}
        <code>alert()</code>-on-failure gap immediately adjacent to the Commerce editor row that{" "}
        <code>leads-client-form-error-inline-aria-announcement</code> had already fixed for the
        &quot;Save catalog&quot; button: the two buttons right next to it in the same row —
        &quot;Sync to Stripe&quot; (<code>handleSyncCommerceCatalogToStripe</code>) and
        &quot;Archive orphans&quot; (<code>handleArchiveOrphanCommerceStripeProducts</code>) —
        still routed their failure branches through a bare, modal{" "}
        <code>alert()</code> instead of the row&apos;s existing{" "}
        <code>commerceCatalogError</code> inline banner, missed because the earlier pass only
        covered the handler it named. <code>handleSyncCommerceCatalogToStripe</code> has a second
        call site with no adjacent inline-error surface at all: the &quot;Commerce catalogs
        unsynced&quot; due-queue panel&apos;s own quick-action button, which renders in a
        standalone <code>&lt;li&gt;</code> even when the full Commerce editor isn&apos;t open for
        that lead (the editor block — and{" "}
        <code>commerceCatalogError</code>&apos;s render site — is gated behind{" "}
        <code>commerceEditSlug === lead.slug</code>), so routing that call through{" "}
        <code>commerceCatalogError</code> would have silently swallowed the error rather than
        improving on <code>alert()</code>. The handler already distinguishes its two call sites by
        whether a <code>headingId</code> argument is passed (only the due-queue button passes
        one, for post-sync focus management) — reused that same signal to pick the right error
        surface: the due-queue call sets a new <code>commerceSyncQueueErrors</code> record keyed
        by slug, rendered as its own <code>role=&quot;alert&quot;</code> paragraph inside that{" "}
        <code>&lt;li&gt;</code> with the button&apos;s <code>aria-describedby</code> pointing at
        it (no <code>aria-invalid</code> — <code>eslint-plugin-jsx-a11y</code>&apos;s{" "}
        <code>role-supports-aria-props</code> rule correctly flags that attribute as unsupported
        on a native <code>button</code>, unlike the <code>&lt;select&gt;</code>/
        <code>&lt;input&gt;</code> elements the two prior passes added it to); the editor-panel
        call for both handlers now sets <code>commerceCatalogError</code>, matching &quot;Save
        catalog&quot; exactly. The success-path <code>alert()</code> calls in{" "}
        <code>handleArchiveOrphanCommerceStripeProducts</code> (archived-count confirmation,
        zero-orphans notice) were left untouched, matching this series&apos; established
        failure-only scope boundary — dozens of other <code>alert()</code> call sites remain a
        documented follow-up for a future pass.
      </p>

      <p>
        A further follow-up pass (2026-07-27,{" "}
        <code>deploy-handoff-live-create-inline-aria-announcement</code>) closed the two{" "}
        <code>alert()</code>-on-failure call sites in the &quot;Paid, not live&quot; and
        &quot;Production deploy handoffs&quot; due-queue panels — <code>handleMarkHandoffLive</code>{" "}
        (&quot;Mark live&quot;) and <code>handleCreateDeployHandoff</code> (&quot;Create deploy
        handoff&quot;) — the same automatic Stripe-webhook-driven DNS/go-live flow the earlier{" "}
        <code>markHandoffLiveAction</code>/<code>createDeployHandoffForLeadAction</code> coverage
        already documents, but whose failure branches had never been converted in any of the
        prior alert()-to-inline-aria passes. Added a single <code>handoffActionErrors</code> state
        keyed by lead slug, shared by both handlers, cleared at the start of each. A lead with{" "}
        <code>stage=&quot;paid&quot;</code> and an already-open (not-yet-live) handoff renders in{" "}
        <em>both</em> due-queue panels simultaneously (&quot;Paid, not live&quot; filters on{" "}
        <code>leads</code> by stage; &quot;Production deploy handoffs&quot; filters{" "}
        <code>handoffs</code> by status independently) — sharing one slug-keyed map across two
        panels meant a naive unconditional render would have put a duplicate DOM{" "}
        <code>id</code> on two <code>role=&quot;alert&quot;</code> paragraphs at once (one for an
        action the &quot;Paid, not live&quot; row&apos;s own button can&apos;t even trigger, since
        Create deploy handoff is hidden once a handoff exists). Fixed by gating the &quot;Paid,
        not live&quot; panel&apos;s error paragraph on the exact same condition as its button (
        <code>!handoffSlugs.has(lead.slug)</code>) and giving each panel&apos;s paragraph its own
        id prefix (<code>paid-not-live-handoff-error-</code> vs{" "}
        <code>production-deploy-handoff-error-</code>) so the two can never collide even if a
        future change loosens that guard.
      </p>

      <p>
        A further follow-up pass (2026-07-27,{" "}
        <code>website-inquiries-followup-inline-aria-announcement</code>) picked the next two
        nearest-the-top <code>alert()</code>-on-failure call sites in{" "}
        <code>leads-client.tsx</code>: <code>handleInquiryStatus</code> (&quot;Mark
        read&quot;/&quot;Archive&quot; in the Website inquiries panel) and{" "}
        <code>handleSendFollowUp</code> (&quot;Send Email 2/3&quot;, called from the Follow-ups
        due panel, the Work next panel, and the main table). <code>handleSendFollowUp</code>{" "}
        already matched the exact three-call-site shape (two due-queue panels plus an
        always-mounted main-table row) that <code>handleStageChange</code>/
        <code>handleSnooze</code> established the <code>leadActionErrors</code> convention for, so
        it was wired into that same slug-keyed map and paragraph rather than inventing a new one.{" "}
        <code>handleInquiryStatus</code> has no main-table analogue — each inquiry renders in
        exactly one always-mounted <code>&lt;li&gt;</code> in the Website inquiries panel, never
        duplicated across panels the way lead rows are — so it got its own{" "}
        <code>inquiryActionErrors</code> state keyed by inquiry id, rendered as a{" "}
        <code>role=&quot;alert&quot;</code> paragraph in that <code>&lt;li&gt;</code> (visible
        whether or not the reply composer is open, since Mark read/Archive don&apos;t require the
        composer), with both buttons&apos; <code>aria-describedby</code> pointing at it. Roughly
        20 <code>alert()</code> call sites remain in this file as a documented follow-up for a
        future pass.
      </p>

      <p>
        A further follow-up pass (2026-07-27,{" "}
        <code>checkout-recovery-payouts-inline-aria-announcement</code>) converted the next five
        nearest-the-top <code>alert()</code>-on-failure call sites, all in due-queue panels below
        the main table: <code>handleSendCheckoutRecovery</code> (Abandoned checkouts),{" "}
        <code>handleSendCommerceCheckoutRecovery</code> (Abandoned Buy now),{" "}
        <code>handleMarkCommerceOrderPaidOut</code> (Commerce payouts (manual)),{" "}
        <code>handleResendCommerceClientReceipt</code> (Missing client receipt), and{" "}
        <code>handleResendBundleBuyerEmail</code> (Bundle buyer email missing). Unlike the{" "}
        <code>leadActionErrors</code>/<code>handoffActionErrors</code> precedents above, these five
        panels never render the same row twice across panels, so a single shared{" "}
        <code>queueActionErrors</code> state (rather than five separate states) was safe to use —
        but each key is still namespaced with a per-panel prefix (
        <code>checkout-recovery:</code>, <code>commerce-recovery:</code>, <code>payout:</code>,{" "}
        <code>receipt:</code>, <code>buyer-email:</code>) as defense in depth against two
        different queues&apos; row ids ever coinciding, matching the id-prefix precedent already
        used for the dual-panel handoff fix. <code>handleMarkCommerceOrderPaidOut</code>&apos;s row
        is keyed by <code>stripeSessionId</code>, nested inside a per-lead summary <code>
          &lt;li&gt;
        </code>{" "}
        keyed by slug — its compact single-row flex layout was restructured into a small{" "}
        <code>flex flex-col</code> wrapper so the new error paragraph could render on its own line
        without breaking the existing amount/status flex row.{" "}
        <code>handleResendBundleBuyerEmail</code>&apos;s success path already re-reads and applies
        a partial-success <code>res.handoff</code> update even when <code>res.success</code> is{" "}
        <code>false</code> (one of receipt/DNS sent, the other failed) — the new error state is set
        alongside that existing update, not in place of it. 18{" "}
        <code>alert()</code> call sites remain in this file (mock-reply notice, billing portal,
        upsell email, marketing/client-voice pack generation and email, Buffer profile
        load/save/send, Stripe orphan-product archive, and a few success-only confirmations) as a
        documented follow-up for a future pass.
      </p>

      <p>
        A further follow-up pass (2026-07-27,{" "}
        <code>buffer-scaffold-inline-aria-announcement</code>) converted the three remaining{" "}
        <code>alert()</code>-on-failure call sites inside the dormant{" "}
        <code>ALLOW_MARKETING_SCHEDULING</code> Buffer auto-post scaffold nested in the Marketing
        pack panel: <code>handleListBufferProfiles</code> (Load Buffer profiles),{" "}
        <code>handleSaveBufferProfiles</code> (Save profiles for this lead), and{" "}
        <code>handleScheduleMarketingPackToBuffer</code> (Send pack to Buffer). That panel already
        modeled the correct inline pattern two dozen lines below (the{" "}
        <code>bufferScheduleResultByLead</code> outcome paragraph), making the three initiation
        failures still routing through a blocking modal <code>alert()</code> an inconsistency
        within the same panel rather than a fresh discovery. Because{" "}
        <code>marketingPackOpenSlug</code> gates only one lead&apos;s Marketing pack panel open at
        a time, a single non-slug-keyed <code>bufferActionError</code> string state was sufficient
        — mirroring the earlier <code>stripeConnectError</code> precedent rather than the
        slug/id-keyed <code>Record</code> states used for panels where several rows can be visible
        at once. All three buttons&apos; <code>aria-describedby</code> point at the same{" "}
        <code>buffer-action-error-&#123;slug&#125;</code> paragraph, which sits directly above the
        existing scheduled/skipped/failed outcome paragraph. 15 <code>alert()</code> call sites
        remain in this file (mock-reply notice, billing portal, upsell email, marketing/client-voice
        pack generation and email, Stripe orphan-product archive, and a few success-only
        confirmations) as a documented follow-up for a future pass.
      </p>

      <p>
        A further follow-up pass (2026-07-27,{" "}
        <code>billing-upsell-marketing-voice-pack-inline-aria-announcement</code>) converted the
        six remaining <code>alert()</code>-on-failure call sites in the main leads table&apos;s
        row-action cluster: <code>handleOpenBillingPortal</code> (Billing),{" "}
        <code>handleSendStarterUpsell</code> (Upsell), <code>handleGenerateMarketingPack</code>{" "}
        (Generate/Regenerate marketing pack), <code>handleEmailMarketingPack</code> (Email
        marketing pack), <code>handleGenerateClientVoicePack</code> (Generate/Regenerate voice
        pack), and <code>handleEmailClientVoicePack</code> (Email voice pack). All six already
        shared a slug-keyed row with the four handlers <code>leads-client-kanban-action-inline-
        aria-announcement</code> had already wired into <code>leadActionErrors</code>, and the
        same paragraph (<code>lead-action-error-&#123;slug&#125;</code>) already rendered directly
        beneath that row — so all six now clear/set that same map instead of inventing a new one,
        and each button gained a matching <code>aria-describedby</code>. Four of the six —{" "}
        <code>handleSendStarterUpsell</code> and <code>handleOpenBillingPortal</code> (used by the
        Starter upsell and MRR paused / canceled due-queue panels) and{" "}
        <code>handleGenerateMarketingPack</code> and <code>handleGenerateClientVoicePack</code>{" "}
        (used by the Marketing packs due and Voice packs due panels) — are also called from a
        due-queue panel above the main table, and none of those four panels previously rendered
        any inline error feedback at all for these buttons; a naive conversion would have made a
        due-queue-triggered failure fail silently (worse than the <code>alert()</code> it
        replaced, not better) for an operator who never scrolls down to the always-mounted main
        row. Each of the four due-queue panels now also renders{" "}
        <code>leadActionErrors[lead.slug]</code> as its own <code>role=&quot;alert&quot;</code>{" "}
        paragraph, each with its own panel-prefixed id (
        <code>starter-upsell-action-error-&#123;slug&#125;</code>,{" "}
        <code>mrr-paused-action-error-&#123;slug&#125;</code>,{" "}
        <code>marketing-packs-due-action-error-&#123;slug&#125;</code>,{" "}
        <code>voice-packs-due-action-error-&#123;slug&#125;</code>) rather than reusing the main
        table&apos;s <code>lead-action-error-&#123;slug&#125;</code> id, mirroring the{" "}
        <code>paid-not-live-handoff-error-</code> / <code>production-deploy-handoff-error-</code>{" "}
        duplicate-id precedent from <code>deploy-handoff-live-create-inline-aria-announcement</code>{" "}
        — a lead can be visible in a due-queue panel and the main table at the same time, and both
        read the same underlying map. 9 <code>alert()</code> call sites remain in this file (the
        mock-reply notice, two Stripe Connect onboarding-link confirmations, the orphan-product
        archive confirmations, the clipboard-copy failure shared across several panels, and a few
        other success-only confirmations) — all informational/success notices rather than action
        failures, a distinct and lower-priority class from the failure alerts this series has been
        closing, as a documented follow-up for a future pass.
      </p>

      <p>
        A final pass (2026-07-27,{" "}
        <code>leads-client-remaining-alert-informational-status-announcement</code>) closed out
        the last 9 <code>alert()</code> call sites in this file. 8 were success/informational
        notices, not failures — the mock-reply confirmation
        (<code>handleInquiryReply</code>), the Starter upsell/marketing-pack/voice-pack email
        confirmations (<code>handleSendStarterUpsell</code>, <code>handleEmailMarketingPack</code>
        , <code>handleEmailClientVoicePack</code>), the orphan-Stripe-Product archive
        no-op/archived-count confirmations (<code>handleArchiveOrphanCommerceStripeProducts</code>
        ), and the two Stripe Connect onboarding-link confirmations (
        <code>handleGetStripeConnectOnboardingLink</code>,{" "}
        <code>handleSendStripeConnectOnboardingLink</code>). Those are rendered with{" "}
        <code>role=&quot;status&quot;</code>, not <code>role=&quot;alert&quot;</code> — this
        codebase reserves <code>role=&quot;alert&quot;</code> (an assertive live region) for
        failures, and <code>role=&quot;status&quot;</code> (a polite live region, the same role
        the CSV-import success message and the Buffer scaffold&apos;s own outcome paragraph
        already use) for a success/no-op confirmation that does not need to interrupt. The 9th,{" "}
        <code>copyMarketingVariant</code>&apos;s clipboard-write <code>catch</code> block, is a
        genuine failure and kept <code>role=&quot;alert&quot;</code>.
      </p>
      <p>
        State shape followed each site&apos;s existing context rather than inventing a new
        pattern: <code>handleSendStarterUpsell</code>, <code>handleEmailMarketingPack</code>, and{" "}
        <code>handleEmailClientVoicePack</code> already route their failure branch through the
        slug-keyed <code>leadActionErrors</code> map, so their success branch now writes a
        parallel <code>leadActionNotices</code> map (same shape, cleared alongside{" "}
        <code>leadActionErrors</code> at the start of each handler so the two never show
        stale/contradictory text for one lead at once) rendered next to the existing paragraph in
        both the always-mounted main-table row and — for{" "}
        <code>handleSendStarterUpsell</code>, also called from the Starter upsell due-queue panel
        — that panel too. The Commerce editor&apos;s Archive-orphans confirmations and the Stripe
        Connect onboarding-link confirmations each got a single-string sibling —{" "}
        <code>commerceCatalogNotice</code> next to <code>commerceCatalogError</code>, and{" "}
        <code>stripeConnectNotice</code> next to <code>stripeConnectError</code> — matching those
        two single-panel-open error states&apos; own existing shape rather than a keyed map.{" "}
        <code>handleInquiryReply</code>&apos;s mock-reply notice got its own
        <code>inquiryActionNotices</code> map keyed by inquiry id, mirroring{" "}
        <code>inquiryActionErrors</code>, rendered in the inquiry&apos;s always-mounted{" "}
        <code>&lt;li&gt;</code> rather than inside the reply composer — the composer itself
        unmounts on a successful send (<code>closeReplyComposer</code>) before this message would
        show. <code>copyMarketingVariant</code> is called from three places with two different
        existing error shapes (the marketing/voice-pack variant Copy buttons share the per-lead{" "}
        <code>leadActionErrors</code> map; the Stripe Connect onboarding-link flow uses the
        single-string <code>stripeConnectError</code>), so it now takes the caller&apos;s error
        setter as a parameter instead of owning state or guessing which map to write into; the two
        Copy buttons were wired through a new <code>handleCopyLeadVariant(slug, text)</code> helper
        that clears the row&apos;s stale error/notice first, matching every other{" "}
        <code>leadActionErrors</code>-writing handler&apos;s shape. This closes the alert()-to-
        inline-announcement conversion series entirely — zero blocking <code>alert()</code> calls
        remain in this file.
      </p>
      <p>
        Abandoned-checkout recovery sends had a duplicate-email race
        (checkout-recovery-send-race-guard): <code>recordRecoverySent</code>/
        <code>sqliteRecordCheckoutRecoverySent</code> only re-checked the session&apos;s{" "}
        <code>status</code> at write time (see checkout-session-recovery-race-guard above), never
        its <code>recoverySentCount</code> — so two concurrent{" "}
        <code>sendCheckoutRecoveryAction</code>/<code>sendCommerceCheckoutRecoveryAction</code>{" "}
        calls for the same still-open session (two dashboard tabs, or a click landing before the
        button&apos;s <code>isPending</code>-disabled state took effect) both read the identical
        pre-write <code>recoverySentCount</code> snapshot, both passed the status guard, and both
        sent a real duplicate email to the customer — with identical, stale nudge-tier copy
        (recovery-email-escalating-cadence above), silently skipping a cadence tier. Both mark
        functions now take the caller&apos;s pre-read <code>recoverySentCount</code> as an{" "}
        <code>expectedRecoverySentCount</code> and only apply the write (optimistic concurrency)
        when the row&apos;s current count still matches it — the losing concurrent call returns{" "}
        <code>false</code> instead of silently double-writing. On a rejected mark, both dashboard
        actions re-fetch <code>listOpenCheckoutSessions()</code> and branch the message the same
        way <code>commerce-order-paid-out-race-message-accuracy</code> does: a session that&apos;s
        no longer open reports the existing &quot;completed after this page loaded&quot; message
        (a real payment race), while a still-open session whose count has already moved past the
        caller&apos;s snapshot reports a distinct &quot;already sent moments ago — skipped
        duplicate send&quot; message instead of falsely blaming a payment that never happened.
      </p>
      <p>
        <code>retail-category-landing-page</code>: <code>BusinessCategory</code> was a fixed
        four-way union (<code>restaurant</code> / <code>salon</code> / <code>trades</code> /{" "}
        <code>generic</code>) with exactly three <code>/websites-for-*</code> SEO landing pages —
        a prior audit flagged a fourth vertical as a real, well-scoped growth candidate
        (organic acquisition is the one growth lever an agent can build without operator
        credentials, per <code>category-landing.ts</code>&apos;s own header comment) but
        deliberately deferred it as its own iteration, since a new category literal touches the
        live Convex schema&apos;s <code>categoryValidator</code> — a materially different risk
        class than a content-only change. Added <code>retail</code> as a fifth, purely-additive
        literal: <code>convex/leads.ts</code>&apos;s <code>categoryValidator</code> gained{" "}
        <code>v.literal(&quot;retail&quot;)</code> (schema.ts itself stores <code>category</code>{" "}
        as a plain string, so this needed no migration), and every <code>Record&lt;BusinessCategory,
        …&gt;</code> map (<code>CATEGORY_THEMES</code>, the OG-image accent-hex map, the
        schema.org <code>@type</code> map — <code>Store</code> for retail) plus every exhaustive{" "}
        <code>switch</code> (<code>defaultTagline</code>,{" "}
        <code>acquisitionSourceForCategory</code>) failed to compile until a <code>retail</code>{" "}
        case was added — the same literal-union exhaustiveness this codebase already relies on
        elsewhere caught every touch point mechanically rather than by manual cross-reference. A
        new curated demo lead (<code>corner-mercantile</code>, a Longmont, CO boutique) backs the
        new <code>/websites-for-retail</code> landing page&apos;s <code>exampleLeadSlug</code> and
        the CSV/slug-inference tests; <code>resolvePreviewLead</code>&apos;s slug-keyword inference
        gained a retail branch (<code>shop|store|boutique|mercantile|market|retail|goods</code>).{" "}
        <code>cat-retail</code> was added to <code>CHECKOUT_ACQUISITION_SOURCES</code> so the new
        page&apos;s CTA is attributed the same way the other three landing pages already are.
        Sitemap listing and OG/Twitter card images needed zero new wiring — both are already
        derived from <code>CATEGORY_LANDING_PAGES</code> generically (see{" "}
        <code>category-landing-pages</code> above), and a clean production build confirmed{" "}
        <code>/websites-for-retail</code> and its two image routes prerender statically
        alongside the existing three.
      </p>
      <p>
        <code>health-category-landing-page</code>: added <code>health</code> as a sixth
        purely-additive <code>BusinessCategory</code> literal and a fifth{" "}
        <code>/websites-for-*</code> landing page, mirroring{" "}
        <code>retail-category-landing-page</code> above end to end —{" "}
        <code>convex/leads.ts</code>&apos;s <code>categoryValidator</code> gained{" "}
        <code>v.literal(&quot;health&quot;)</code>, every <code>Record&lt;BusinessCategory,
        …&gt;</code> map gained a <code>health</code> entry (a sky-blue theme, schema.org{" "}
        <code>MedicalBusiness</code> for the JSON-LD <code>@type</code>), and every exhaustive{" "}
        <code>switch</code> gained a <code>health</code> case, caught mechanically by{" "}
        <code>tsc</code> the same way the retail addition was. A new curated demo lead (
        <code>clearview-wellness-clinic</code>, a Lafayette, CO chiropractic/physical-therapy
        clinic) backs <code>/websites-for-health</code>&apos;s <code>exampleLeadSlug</code>;{" "}
        <code>resolvePreviewLead</code>&apos;s slug-keyword inference gained a health branch (
        <code>dental|dentist|chiro|clinic|wellness|therapy|medical|health|physio</code>) chosen to
        share no keywords with the existing restaurant/salon/trades/retail branches.{" "}
        <code>cat-health</code> was added to <code>CHECKOUT_ACQUISITION_SOURCES</code> for CTA
        attribution. Sitemap listing and OG/Twitter card images again needed zero new wiring
        (both stay generically derived from <code>CATEGORY_LANDING_PAGES</code>), and a clean
        production build plus a <code>npm run dev</code> smoke check confirmed{" "}
        <code>/websites-for-health</code> and its two image routes prerender statically and serve
        200s alongside the existing four.
      </p>
      <p>
        <code>automotive-category-landing-page</code>: added <code>automotive</code> as a seventh
        purely-additive <code>BusinessCategory</code> literal and a sixth{" "}
        <code>/websites-for-*</code> landing page, mirroring{" "}
        <code>retail-category-landing-page</code> and{" "}
        <code>health-category-landing-page</code> above end to end —{" "}
        <code>convex/leads.ts</code>&apos;s <code>categoryValidator</code> gained{" "}
        <code>v.literal(&quot;automotive&quot;)</code>, every <code>Record&lt;BusinessCategory,
        …&gt;</code> map gained an <code>automotive</code> entry (a red/amber theme, schema.org{" "}
        <code>AutoRepair</code> for the JSON-LD <code>@type</code>), and every exhaustive{" "}
        <code>switch</code> gained an <code>automotive</code> case, caught mechanically by{" "}
        <code>tsc</code> the same way the retail and health additions were. A new curated demo
        lead (<code>trailhead-auto-repair</code>, a Golden, CO auto repair shop) backs{" "}
        <code>/websites-for-automotive</code>&apos;s <code>exampleLeadSlug</code>;{" "}
        <code>resolvePreviewLead</code>&apos;s slug-keyword inference gained an automotive branch
        (<code>auto|mechanic|garage|tire|transmission|collision|motor</code>) chosen to share no
        keywords with the existing restaurant/salon/trades/retail/health branches.{" "}
        <code>cat-automotive</code> was added to <code>CHECKOUT_ACQUISITION_SOURCES</code> for CTA
        attribution. Sitemap listing and OG/Twitter card images again needed zero new wiring
        (both stay generically derived from <code>CATEGORY_LANDING_PAGES</code>), and a clean
        production build plus a <code>npm run dev</code> smoke check confirmed{" "}
        <code>/websites-for-automotive</code> and its two image routes prerender statically and
        serve 200s alongside the existing five.
      </p>
      <p>
        <code>automotive-repair-keyword-priority-fix</code>: the automotive branch above shared no
        keywords with the other five branches, but that one-directional check missed the reverse —
        <code>resolvePreviewLead</code>&apos;s if/else-if chain checked <code>trades</code> (whose
        own keyword list includes the bare word <code>repair</code>) before{" "}
        <code>automotive</code>, so the dominant real-world auto-repair naming convention (e.g.{" "}
        <code>joes-auto-repair</code>) matched <code>trades</code> first and never reached the
        automotive branch — mis-tiering a real cold-prospected lead&apos;s preview (
        <code>trades</code> defaults to Starter, automotive to Growth) and mis-typing its JSON-LD.
        Fixed by moving the automotive check immediately after salon, before trades, so the more
        specific vertical wins; three regression cases (
        <code>joes-auto-repair</code>, <code>smiths-auto-repair-shop</code>,{" "}
        <code>quick-fix-auto-repair-center</code>) were added to{" "}
        <code>demo-catalog.test.ts</code> that fail against the pre-fix ordering.
      </p>
      <p>
        <code>cleaning-category-landing-page</code>: added <code>cleaning</code> as an eighth
        purely-additive <code>BusinessCategory</code> literal and a seventh{" "}
        <code>/websites-for-*</code> landing page, mirroring the retail/health/automotive series
        above end to end — <code>convex/leads.ts</code>&apos;s <code>categoryValidator</code>{" "}
        gained <code>v.literal(&quot;cleaning&quot;)</code>, every{" "}
        <code>Record&lt;BusinessCategory, …&gt;</code> map gained a <code>cleaning</code> entry
        (an emerald theme; schema.org has no dedicated cleaning-service subtype, so the JSON-LD{" "}
        <code>@type</code> reuses <code>HomeAndConstructionBusiness</code>, the same real
        schema.org type <code>trades</code> uses, rather than inventing a nonexistent one), and
        every exhaustive switch (<code>defaultTagline</code>,{" "}
        <code>acquisitionSourceForCategory</code>) gained a <code>cleaning</code> case, forced by
        the same <code>never</code>-check compile safety net as every prior vertical in this
        series. A new curated demo lead (<code>brightside-cleaning-co</code>, a Louisville, CO
        residential/commercial cleaning company) backs the new page&apos;s live example, and{" "}
        <code>resolvePreviewLead</code>&apos;s slug-inference chain gained a{" "}
        <code>clean|maid|janitorial|housekeep|spotless</code> branch — chosen to share no keyword
        with any of the seven existing branches. <code>cat-cleaning</code> was added to{" "}
        <code>CHECKOUT_ACQUISITION_SOURCES</code> for CTA attribution. Sitemap listing and
        OG/Twitter card images again needed zero new wiring (both stay generically derived from{" "}
        <code>CATEGORY_LANDING_PAGES</code>), and a clean production build plus a{" "}
        <code>npm run dev</code> smoke check confirmed <code>/websites-for-cleaning</code> and its
        two image routes prerender statically and serve 200s alongside the existing six.
      </p>
      <p>
        <code>fitness-category-landing-page</code>: added <code>fitness</code> as a ninth
        purely-additive <code>BusinessCategory</code> literal and an eighth{" "}
        <code>/websites-for-*</code> landing page, mirroring the retail/health/automotive/cleaning
        series above end to end — <code>convex/leads.ts</code>&apos;s <code>categoryValidator</code>{" "}
        gained <code>v.literal(&quot;fitness&quot;)</code>, every{" "}
        <code>Record&lt;BusinessCategory, …&gt;</code> map gained a <code>fitness</code> entry (an
        indigo theme, hex <code>#6366f1</code>; schema.org&apos;s dedicated{" "}
        <code>ExerciseGym</code> subtype, distinct from <code>health</code>&apos;s
        patient/booking-focused <code>MedicalBusiness</code> — gyms, personal trainers, and
        yoga/pilates/martial-arts studios are membership + class-schedule focused, a distinct
        vertical), and every exhaustive switch (<code>defaultTagline</code>,{" "}
        <code>acquisitionSourceForCategory</code>) gained a <code>fitness</code> case, forced by the
        same <code>never</code>-check compile safety net as every prior vertical in this series. A
        new curated demo lead (<code>ironclad-fitness-studio</code>, an Erie, CO strength and
        conditioning gym) backs the new page&apos;s live example, and{" "}
        <code>resolvePreviewLead</code>&apos;s slug-inference chain gained a{" "}
        <code>gym|fitness|yoga|pilates|crossfit|martial-arts|personal-train</code> branch —
        mechanically checked in both directions against all seven existing branches&apos; keyword
        lists (not just the one-directional check <code>automotive-repair-keyword-priority-fix</code>
        {" "}found insufficient) and confirmed to share no substring with any of them.{" "}
        <code>cat-fitness</code> was added to <code>CHECKOUT_ACQUISITION_SOURCES</code> for CTA
        attribution. Sitemap listing and OG/Twitter card images again needed zero new wiring (both
        stay generically derived from <code>CATEGORY_LANDING_PAGES</code>), and a clean production
        build plus a <code>npm run dev</code> smoke check confirmed{" "}
        <code>/websites-for-fitness</code> and its two image routes prerender statically and serve
        200s alongside the existing seven.
      </p>
      <p>
        <code>legal-category-landing-page</code>: added <code>legal</code> as a tenth
        purely-additive <code>BusinessCategory</code> literal and a ninth{" "}
        <code>/websites-for-*</code> landing page (law firms and attorneys), mirroring the
        retail/health/automotive/cleaning/fitness series above end to end —{" "}
        <code>convex/leads.ts</code>&apos;s <code>categoryValidator</code> gained{" "}
        <code>v.literal(&quot;legal&quot;)</code>, every{" "}
        <code>Record&lt;BusinessCategory, …&gt;</code> map gained a <code>legal</code> entry (a blue
        theme, hex <code>#1d4ed8</code>; schema.org&apos;s dedicated <code>LegalService</code>{" "}
        subtype), and every exhaustive switch (<code>defaultTagline</code>,{" "}
        <code>acquisitionSourceForCategory</code>) gained a <code>legal</code> case, forced by the
        same <code>never</code>-check compile safety net as every prior vertical in this series. A
        new curated demo lead (<code>westbrook-law-group</code>, a Broomfield, CO family-law and
        estate-planning firm) backs the new page&apos;s live example, and{" "}
        <code>resolvePreviewLead</code>&apos;s slug-inference chain gained a{" "}
        <code>law|attorney|legal|lawyer</code> branch — mechanically checked (a small Python script,
        not by hand) in both directions against all eight existing branches&apos; keyword lists and
        confirmed to share no substring with any of them.{" "}
        <code>cat-legal</code> was added to <code>CHECKOUT_ACQUISITION_SOURCES</code> for CTA
        attribution. Sitemap listing and OG/Twitter card images again needed zero new wiring (both
        stay generically derived from <code>CATEGORY_LANDING_PAGES</code>), and a clean production
        build plus a <code>npm run dev</code> smoke check confirmed{" "}
        <code>/websites-for-legal</code> and its two image routes prerender statically and serve
        200s alongside the existing eight.
      </p>
      <p>
        <code>legal-category-lawn-substring-collision-fix</code>: that same-session mechanical
        keyword-collision check compared the legal branch&apos;s keyword list against every other
        branch&apos;s keyword list — but never against ordinary English words that are not
        themselves a keyword anywhere. The bare <code>law</code> alternative matches inside{" "}
        <code>lawn</code>, so a lawn-care or landscaping business (a plausible local-service
        customer for this product, and this app&apos;s own <code>trades</code> branch already
        covers landscaping) — e.g. <code>green-lawn-care</code> or{" "}
        <code>lawn-ranger-mowing</code>, neither of which contains <code>trades</code>&apos;s own{" "}
        <code>landscap</code> keyword — was misclassified as <code>legal</code> instead of falling
        through to <code>generic</code>. The bare <code>legal</code> alternative has the same
        problem: it matches inside <code>illegal</code>, and every demo lead in this catalog is
        Colorado-based, where <code>Illegal Pete&apos;s</code> is a real, well-known restaurant
        chain — <code>illegal-petes-burritos</code> would have been misclassified as{" "}
        <code>legal</code> too (its slug matches no <code>restaurant</code> keyword, since{" "}
        &quot;burritos&quot; isn&apos;t one of them). Fixed by scoping <code>law</code> and{" "}
        <code>legal</code> to a regex word boundary (<code>\blaw\b</code>,{" "}
        <code>\blegal\b</code>) so they only match as a distinct token, not as a substring of a
        longer word — <code>attorney</code> and <code>lawyer</code> are long/distinctive enough
        that no equivalent risk exists, so they stay bare. Verified every existing legal-category
        test slug (<code>westbrook-law-group</code>, <code>eastview-law-group</code>,{" "}
        <code>downtown-attorney</code>, <code>summit-legal-services</code>,{" "}
        <code>jane-doe-lawyer</code>) still matches after the change, and added a new regression
        test asserting <code>green-lawn-care</code>, <code>lawn-ranger-mowing</code>, and{" "}
        <code>illegal-petes-burritos</code> all resolve to <code>generic</code> — confirmed it
        fails against the pre-fix bare-substring regex before restoring the fix.
      </p>

      <p>
        Every other client-facing send action with a durable &quot;already sent&quot; marker —
        marketing/voice pack email, bundle buyer resend, checkout recovery — has a concurrency
        guard against a second dashboard tab or a double-click sending a real duplicate email.{" "}
        <code>sendStarterUpsellAction</code> (the paid Starter → Growth/Complete MRR nudge) had
        none at all: no <code>starterUpsell*SentAt</code> field, no mark/check helper,{" "}
        <code>sendStarterUpsellEmail</code> a plain unguarded <code>sendEmail()</code> call. Two
        open tabs on the same lead could both pass the identical eligibility check and both send
        the upgrade pitch, both silently reporting success. Unlike the marketing/voice pack
        marker (a one-shot &quot;already sent, never again&quot; gate reset by regenerating the
        pack), a Starter upsell nudge has no monthly regenerate step — an operator can
        legitimately re-send it to a still Starter-only lead weeks later, so a permanent
        already-sent gate would incorrectly block that. Shipped a plain expected-count
        compare-and-swap instead, mirroring <code>recordCheckoutRecoverySent</code>&apos;s shape
        rather than <code>markMarketingPackSentToClient</code>&apos;s: <code>leads</code> gained{" "}
        <code>starterUpsellSentCount</code>/<code>lastStarterUpsellSentAt</code> (both backends),
        and <code>recordStarterUpsellSent</code> (Convex <code>requireConvex: true</code>, mirroring{" "}
        <code>getLeadBySlug</code>&apos;s Convex-first reads) only advances the count when the
        caller&apos;s <code>expectedStarterUpsellSentCount</code> still matches the row&apos;s
        current count — an exact concurrent duplicate (same stale expected count) is rejected,
        but a later request that re-reads the lead first and passes the fresh count always
        succeeds. <code>sendStarterUpsellAction</code> sends first, then marks (best-effort on a
        thrown write error — the email already went out; a race-guard <code>false</code> return
        surfaces as a reported duplicate-send warning instead) — see{" "}
        <code>starter-upsell-send-race-guard</code>.
      </p>

      <p>
        Business-growth audit (<code>growth-upsell-nudge</code>): the Starter → Growth/Complete
        nudge above has no second step — a paid/live Growth customer (the AI marketing engine, no
        phone agent) had zero automated path toward Complete, the only tier with real
        differentiated value over Growth (seasonal promos, an AI phone agent for the business
        line, appointment booking and lead capture). Shipped{" "}
        <code>src/lib/billing/growth-upsell.ts</code>, mirroring{" "}
        <code>starter-upsell.ts</code>&apos;s shape exactly except the negative check:{" "}
        <code>orderEligibleForBillingPortal</code> is true for both Growth and Complete (it gates
        Billing vs no-Billing, not one tier vs the other), so it cannot serve as the &quot;already
        has this&quot; exclusion here — <code>hasCompleteOrder</code> checks for a Complete-tier
        order specifically instead, regardless of that order&apos;s refund/dispute status (same
        &quot;already sold, don&apos;t re-pitch&quot; reasoning <code>starter-upsell.ts</code>{" "}
        documents). <code>leads</code> gained <code>growthUpsellSentCount</code>/
        <code>lastGrowthUpsellSentAt</code> (both backends) and{" "}
        <code>recordGrowthUpsellSent</code> (Convex <code>requireConvex: true</code>), the same
        expected-count compare-and-swap shape as <code>recordStarterUpsellSent</code>.{" "}
        <code>sendGrowthUpsellAction</code> marks before it sends (persist-then-notify, mirroring{" "}
        <code>starter-upsell-stripe-connect-send-race-guard-ordering-fix</code>&apos;s corrected
        ordering, not the original shape the paragraph above describes) — a lost CAS or a
        fail-closed mark write skips the send entirely. New dashboard panel (&quot;Growth →
        Complete upsell&quot;) + row
        action (&quot;Upsell to Complete&quot;), a <code>growthUpsellCandidatesCount</code>{" "}
        pipeline-health card, and a matching daily-digest section, all mirroring their Starter
        upsell twins. See <code>send-growth-upsell-action.test.ts</code> +{" "}
        <code>growth-upsell.test.ts</code>.
      </p>

      <p>
        <code>replyToInquiryAction</code> (the CRM reply-to-visitor flow) was the one send action
        in this family still missing a duplicate-send race guard — and the one send in the whole
        set that reaches an actual end customer rather than the operator&apos;s own paid client.
        Its persist-then-notify design (mark <code>status=replied</code> in{" "}
        <code>recordClientInquiryReply</code> before Resend, so a Convex failure never lets an
        unrecorded send land) already re-checks <code>status !== &quot;archived&quot;</code>{" "}
        atomically at write time (<code>inquiry-reply-archive-race-guard</code>), but had no
        equivalent guard against an exact concurrent duplicate — two open tabs on the same
        inquiry&apos;s reply composer, or a double-click before the button&apos;s{" "}
        <code>isPending</code>-disabled state applies, could both pass the stale{" "}
        <code>inquiryCanReceiveReply</code> check, both persist, and both fire a real duplicate
        reply email to the visitor who submitted the contact form. Since{" "}
        <code>inquiryCanReceiveReply</code> deliberately allows replying to an
        already-replied inquiry (a legitimate follow-up is a real feature — unlike the
        marketing/voice pack marker, there is no one-shot &quot;already sent&quot; gate here
        either), the fix mirrors <code>recordStarterUpsellSent</code>&apos;s plain expected-count
        compare-and-swap rather than a permanent block:{" "}
        <code>clientInquiries</code> gained <code>replySentCount</code> (both backends), and{" "}
        <code>recordClientInquiryReply</code>/Convex <code>recordReply</code> take an{" "}
        <code>expectedReplySentCount</code> that must still match the row&apos;s current count at
        write time — a stale duplicate is rejected (returns <code>null</code>, the same signal as
        the archive-race guard), while a later, deliberate follow-up reply using a fresh read
        always succeeds. Because <code>null</code> from the mutation is now ambiguous (missing
        row, archived race, or duplicate-send race),{" "}
        <code>replyToInquiryAction</code> re-fetches the inquiry on a <code>null</code> result and
        branches to report the accurate current reason, the same re-fetch-and-branch approach as{" "}
        <code>commerce-order-paid-out-race-message-accuracy</code>, instead of one hardcoded
        message covering three different causes. See{" "}
        <code>inquiry-reply-send-race-guard</code>.
      </p>
      <p>
        <code>category-substring-collision-audit-02</code>: the{" "}
        <code>legal-category-lawn-substring-collision-fix</code> series only ever fixed the one
        branch it was scoped to (<code>legal</code>&apos;s bare <code>law</code>/
        <code>legal</code>), so a follow-up audit checked every remaining branch&apos;s bare
        keywords against ordinary English words and real-world business-naming conventions, not
        just against each other&apos;s keyword lists. Found three more live collisions in{" "}
        <code>resolvePreviewLead</code>: a bare <code>spa</code> matches inside{" "}
        <code>crawlspace</code> (a home-services business name with no other category keyword,
        e.g. <code>crawlspace-solutions</code>) and, more consequentially, matches the standalone
        word in the real-world &quot;auto-spa&quot; car-detailing naming convention (e.g.{" "}
        <code>auto-spa-car-wash</code>) before <code>automotive</code>&apos;s own <code>auto</code>{" "}
        keyword — checked later in the chain — ever runs; a bare <code>hair</code> matches inside a
        surname like <code>Hairston</code> (e.g. <code>hairston-roofing-llc</code>, which should
        resolve via <code>trades</code>&apos;s <code>roof</code> keyword instead); and a bare{" "}
        <code>kitchen</code> matches the common &quot;kitchen and bath remodeling&quot; contractor
        naming convention (e.g. <code>abc-kitchen-bath-remodeling</code>) before{" "}
        <code>trades</code> ever runs. Fixed with three changes: <code>spa</code> and{" "}
        <code>hair</code> in the <code>salon</code> branch are now word-boundary scoped (
        <code>\bspa\b</code>, <code>\bhair\b</code>), mirroring the legal fix&apos;s own pattern;
        the <code>automotive</code> branch moved earlier in the if/else-if chain to run before{" "}
        <code>salon</code> as well as <code>trades</code> (the existing code comment already
        explained why it runs before <code>trades</code> — this extends the same precedent to{" "}
        <code>salon</code>&apos;s bare <code>spa</code>); and the restaurant branch&apos;s bare{" "}
        <code>kitchen</code> match is now skipped when a <code>bath</code>/<code>remodel</code>/
        <code>renovat</code> marker is also present in the slug, with <code>remodel</code> and{" "}
        <code>renovat</code> added to <code>trades</code>&apos;s own keyword list so that class of
        business still resolves correctly instead of falling through to <code>generic</code>.
        Verified every existing category-inference test slug still resolves unchanged, added
        regression tests for all five new cases above, and confirmed each fails against the
        pre-fix logic before restoring the fix. See{" "}
        <code>category-substring-collision-audit-02</code>.
      </p>
      <p>
        <code>category-substring-collision-audit-03</code>: a follow-up audit checked the
        remaining branches <code>category-substring-collision-audit-02</code> didn&apos;t touch
        (<code>retail</code>/<code>health</code>/<code>cleaning</code>/<code>fitness</code>) and
        found two more live collisions in the <code>automotive</code> branch itself, checked
        earlier in the chain than <code>retail</code>. A bare <code>tire</code> matches inside{" "}
        <code>attire</code> (e.g. <code>elegant-attire-boutique</code>, a clothing retailer) and a
        bare <code>auto</code> matches inside <code>autograph</code> (e.g.{" "}
        <code>autograph-collectibles-store</code>, a memorabilia retailer) — both misclassified as{" "}
        <code>automotive</code> before ever reaching <code>retail</code>&apos;s own{" "}
        <code>boutique</code>/<code>store</code> keywords. Fixed with the same word-boundary
        scoping already used for <code>spa</code>/<code>hair</code>/<code>law</code>/
        <code>legal</code>: <code>\bauto\b</code>, <code>\btire\b</code>. A third collision needed
        a different fix: <code>garage</code> is a genuine standalone token in both an auto-repair
        garage and a &quot;garage sale&quot;/thrift-shop business name (e.g.{" "}
        <code>garage-sale-treasures</code>), so word-boundary scoping alone can&apos;t
        disambiguate it — a new <code>isGarageSaleOrThriftShop</code> guard (garage present
        alongside sale/thrift) excludes it from <code>automotive</code> and lets it fall through
        to <code>retail</code>&apos;s own keywords when present, mirroring{" "}
        <code>isKitchenRemodelingContractor</code>&apos;s compound-exclusion pattern. Slugs
        matching neither the automotive collision nor any other category&apos;s own keyword (e.g.{" "}
        <code>mens-attire-outlet</code>, <code>garage-sale-treasures</code>) fall through to{" "}
        <code>generic</code>, the same safe default the lawn/crawlspace false positives resolved
        to. Verified every existing category-inference test slug still resolves unchanged, added
        regression tests for all five new cases, and confirmed each fails against the pre-fix
        logic before restoring the fix. See{" "}
        <code>category-substring-collision-audit-03</code>.
      </p>

      <p>
        Manual <strong>Add lead</strong> (<code>addLeadAction</code>) was the one lead-creation
        path that never validated <code>category</code> against the same allowlist CSV import has
        always enforced (<code>parseCategory</code> hard-rejects an unrecognized value with a
        clear, row-level operator error). A Server Action&apos;s declared parameter type is not
        enforced at runtime against an arbitrary caller — the dashboard&apos;s own{" "}
        <code>&lt;select&gt;</code> only ever offers a valid category, but a raw POST to the
        action did not have to. An invalid category did not crash anything (both backends&apos;
        read paths already run <code>normalizeLeadCategory</code>, which falls back to{" "}
        <code>&quot;generic&quot;</code> for an unrecognized stored value — see{" "}
        <code>leads-category-tier-read-normalize-parity</code>), but it silently persisted the bad
        value and coerced it to <code>&quot;generic&quot;</code> on every later read with zero
        operator feedback, unlike CSV import&apos;s clear rejection. Fixed by adding the same
        allowlist check to <code>normalizeLeadCreateFields</code> (shared by both create paths),
        returning the same style of error CSV import already gives. While fixing this, also found
        that <code>csv-import.ts</code> maintained its own hand-written duplicate of the category
        list rather than importing the canonical <code>BUSINESS_CATEGORIES</code> array from{" "}
        <code>category-normalize.ts</code> — the exact kind of drift risk (three lists to update
        by hand: this one, the Convex validator, and category-normalize.ts&apos;s own array) that
        let this validation gap go unnoticed for as long as it did. Deduped it to import{" "}
        <code>BUSINESS_CATEGORIES</code> directly, including the error message text, so a future
        category addition only needs to update one source of truth for this pair of checks (the
        Convex-side <code>categoryValidator</code> stays a separate, differently-shaped literal
        union by necessity). See <code>add-lead-category-validation-parity</code>.
      </p>

      <p>
        <code>category-substring-collision-audit-04</code>: a fourth audit found three more live
        collisions using keywords the prior three rounds never touched (<code>trade</code>,{" "}
        <code>maid</code>, <code>clean</code>). A bare <code>trade</code> matches inside{" "}
        <code>trademark</code> and inside the standalone token pair{" "}
        <code>trade</code>/<code>secrets</code> (e.g. <code>trademark-law-group</code>,{" "}
        <code>trade-secrets-law-firm</code> — both real-world IP law firm naming conventions),
        misrouting them into <code>trades</code> before <code>legal</code>&apos;s own keywords
        ever run. A bare <code>maid</code> matches inside a place name/surname like{" "}
        <code>Maidenhead</code> (e.g. <code>maidenhead-legal-attorney</code>), misrouting it into{" "}
        <code>cleaning</code> before <code>legal</code>&apos;s <code>\blegal\b</code> keyword ever
        runs. A bare <code>clean</code> matches the &quot;clean eating&quot;/&quot;eat
        clean&quot; nutrition and meal-prep branding pattern (e.g.{" "}
        <code>clean-eatz-nutrition</code>), misrouting a nutrition business into{" "}
        <code>cleaning</code>. This preview page is not a demo-only surface — it&apos;s{" "}
        <code>resolvePreviewLead</code>&apos;s slug-inference fallback shown to cold, unconverted
        prospects at <code>/preview/&lt;their-business-name&gt;</code>, the core sales artifact
        this product uses to close deals, so a misclassified category flows straight into the
        wrong theme, the wrong <code>LocalBusiness</code> JSON-LD subtype, and the wrong tagline.
        Fixed with the same two patterns already established: <code>maid</code> is now
        word-boundary scoped (<code>\bmaid\b</code>), mirroring <code>spa</code>/<code>hair</code>
        /<code>law</code>/<code>legal</code>/<code>auto</code>/<code>tire</code>; word-boundary
        scoping can&apos;t help <code>trade</code> (embedded with no boundary inside{" "}
        <code>trademark</code>) or <code>clean</code> (a genuine whole token in both meanings), so
        two new compound-exclusion guards — <code>isTrademarkOrTradeSecretsLaw</code> and{" "}
        <code>isCleanEatingNutrition</code> — mirror <code>isKitchenRemodelingContractor</code>/
        <code>isGarageSaleOrThriftShop</code>&apos;s existing pattern, excluding the match from{" "}
        <code>trades</code>/<code>cleaning</code> respectively. The trademark/trade-secrets case
        falls through to <code>legal</code>; the clean-eating case matches no other branch&apos;s
        keywords either, so it falls through to <code>generic</code>, the same safe default every
        prior audit&apos;s unmatched false positives resolved to. Verified every existing
        category-inference test slug still resolves unchanged, added regression tests for all
        three new cases, and confirmed each fails against the pre-fix logic before restoring the
        fix. See <code>category-substring-collision-audit-04</code>.
      </p>

      <p>
        <code>category-substring-collision-audit-05</code>: a fifth audit found the vein was
        still not exhausted — nine more collisions, including one new pattern the prior four
        rounds didn&apos;t need. Bare <code>diner</code>/<code>grill</code>/<code>mechanic</code>
        /<code>nails</code>/<code>market</code>/<code>goods</code> each matched inside an
        unrelated word (e.g. a bare <code>diner</code> inside the surname{" "}
        <code>Gardiner</code>, a bare <code>market</code> inside{" "}
        <code>marketing</code> — the highest-value single find of this round, since a
        marketing/advertising agency is a plausible, common cold-prospect business type) and are
        now word-boundary scoped, mirroring the pattern from prior audits. Bare{" "}
        <code>roof</code> needed a different fix: a full <code>\broof\b</code> would have blocked
        the false positive inside <code>proofreading</code>/<code>waterproof</code> but also
        broken the genuine <code>roofing</code>/<code>roofer</code> suffix match an existing
        regression test depends on, so it&apos;s now LEFT-boundary-only (<code>\broof</code>, no
        trailing boundary) — blocks the prefix-embedded false positive while preserving every
        suffix-attached real match. Two more whole-word ambiguities got compound-exclusion
        guards mirroring <code>isKitchenRemodelingContractor</code>/
        <code>isGarageSaleOrThriftShop</code>: <code>isPaintballArena</code> (a paintball arena
        isn&apos;t a painting contractor) and <code>isElectricBikeShop</code> (an e-bike
        retailer isn&apos;t an electrician, falls through to <code>retail</code> instead). A
        research agent also assessed whether this bug class could close permanently via a
        corpus-driven regression test iterating a data-derived version of the branch table —
        judged feasible but out of scope for a single focused iteration; a future session may
        take this on as its own dedicated pass if a sixth manual round also turns up multiple
        fresh collisions. See <code>category-substring-collision-audit-05</code>.
      </p>

      <p>
        <code>category-substring-collision-audit-06</code>: a sixth round, this time found via a
        systematic reasoning pass over every bare (non-word-boundary) keyword still in the chain
        rather than ad hoc guessing, again turned up multiple fresh collisions — six, across six
        different keyword pairs never touched by rounds 1-5. Bare <code>kitchen</code> matched
        inside <code>kitchenware</code>/<code>kitchenaid</code> (a kitchenware retailer and a
        KitchenAid appliance-repair shop, both misrouted to <code>restaurant</code>); bare{" "}
        <code>beauty</code> matched inside the mattress brand <code>beautyrest</code>; bare{" "}
        <code>health</code> matched inside <code>healthy</code> (e.g. an eco-friendly
        &quot;Healthy Home Cleaning&quot; business, misrouted to <code>health</code> instead of{" "}
        <code>cleaning</code> since the health branch runs first). All three are now word-boundary
        scoped, mirroring the established pattern. Two more needed compound-exclusion guards
        instead, since a full word boundary would have broken a genuine suffix form:{" "}
        <code>isCraftOrHobbyWorkshop</code> excludes bare <code>shop</code> matching inside{" "}
        <code>workshop</code> (a pottery/woodworking workshop teaches or crafts, it doesn&apos;t
        sell off a shelf — falls through to <code>generic</code>), and{" "}
        <code>isDisasterRestorationService</code> excludes bare <code>store</code> matching inside{" "}
        <code>restore</code> only when a disaster/damage marker (storm/flood/water/fire/disaster/
        mold) is also present — scoped narrowly so the real-world &quot;ReStore&quot; secondhand/
        home-improvement thrift store naming convention still correctly resolves to{" "}
        <code>retail</code>. The sixth, <code>trade</code> matching inside <code>trader</code>,
        needed a different tool than every prior fix: a full <code>\btrade\b</code> boundary would
        have also broken the genuine <code>tradesman</code> suffix form (a real trades-business
        naming convention with no analogous false-positive risk), so the fix is a negative
        lookahead, <code>trade(?!r)</code> — excludes only the trailing &quot;r&quot; that makes{" "}
        <code>trader</code>, mirroring <code>roof</code>&apos;s own suffix-preserving
        left-boundary-only precedent from audit-05 rather than either a blanket boundary or a
        two-marker compound guard. Verified every existing category-inference test slug (all 133
        distinct slugs referenced across this file&apos;s test suite) still resolves unchanged,
        added regression tests for all six new cases plus the <code>tradesman</code>/
        &quot;ReStore&quot; sanity checks, and confirmed each new test fails against the pre-fix
        logic before restoring the fix. Per audit-05&apos;s own hand-off note, a sixth manual round
        turning up multiple fresh collisions was named as the trigger for building a
        corpus-driven, data-table-based systematic test instead of continuing incrementally — that
        condition is now met, and a future session should weigh that structural refactor rather
        than treating this pattern as an indefinitely repeatable incremental fix. See{" "}
        <code>category-substring-collision-audit-06</code>.
      </p>

      <p>
        <code>process-log-category-collision-corpus-consolidation</code>: rather than a full
        data-table rewrite of <code>resolvePreviewLead</code> itself (judged too risky for one
        pass — the branch chain carries six audits&apos; worth of precisely-tuned, individually
        commented exclusion guards), took the lower-risk half of the structural fix audit-05/-06
        both flagged: <code>demo-catalog.test.ts</code> previously wrote one bespoke{" "}
        <code>it()</code> block per collision finding across audits 02 through 06 (roughly twenty
        scattered blocks). Consolidated all of them into a single{" "}
        <code>COLLISION_REGRESSION_CASES</code> table (slug, expected category, optional tier, a
        one-line note) driven through one <code>it.each</code>, with zero change to{" "}
        <code>resolvePreviewLead</code>&apos;s production logic. A future audit that finds a fresh
        collision now appends one row to that table instead of authoring a new test block — the
        actual mechanical bottleneck the prior two hand-offs were pointing at was test-authoring
        overhead per finding, not a missing branch-table abstraction in the source itself. Verified
        byte-for-byte behavior parity: the full pre-existing assertion set (category, tier where
        pinned, dataSource) still runs unchanged, just through one loop instead of many blocks.
      </p>

      <p>
        <code>checkout-form-email-autocomplete</code>: a fresh-angle accessibility audit (form
        autocomplete attributes, WCAG 1.3.5 Identify Input Purpose) found the Checkout page&apos;s
        email input — the highest-value conversion field in the app, sitting one click before a
        Stripe redirect — was missing <code>autoComplete=&quot;email&quot;</code>, even though the
        exact same convention was already established sitewide: the public preview contact form
        (<code>name</code>/<code>email</code>/<code>tel</code>, all three fields) and the operator
        login password field both set it. Added <code>autoComplete=&quot;email&quot;</code> (plus a
        matching <code>name=&quot;email&quot;</code>) to <code>checkout-form.tsx</code>&apos;s email
        input — a pure markup addition, no logic change. The dashboard&apos;s manual &quot;Add
        lead&quot; email field was deliberately left as-is: that field enters a third party&apos;s
        contact info on the operator&apos;s behalf, not the signed-in user&apos;s own profile data,
        so browser autofill semantics don&apos;t apply the same way there.
      </p>

      <p>
        <code>docs-legal-pages-typography-plugin-missing</code>: a fresh-angle audit (verifying
        the compiled CSS output itself, rather than trusting a green build) found that every{" "}
        <code>/docs/*</code> page (via the shared <code>DocPage</code> component&apos;s{" "}
        <code>proseClass</code>) plus <code>/terms</code> and <code>/privacy</code> applied
        Tailwind Typography plugin classes — <code>prose</code>, <code>prose-zinc</code>,{" "}
        <code>prose-headings:*</code>, <code>prose-a:*</code>, <code>prose-code:*</code> — that
        matched zero rules in the compiled stylesheet. <code>@tailwindcss/typography</code> was
        never installed as a dependency and never registered in <code>globals.css</code>, so those
        class names shipped to the browser as inert strings: no paragraph rhythm, no heading-size
        differentiation, no list/table styling, no code-block formatting on the operator/legal
        documentation surface this app designates (see <code>AGENTS.md</code>) as the only place
        substantive docs may live — worst on the Terms/Privacy pages, which got zero visual
        structure at all. This produced no TypeScript, ESLint, Vitest, or build error, since{" "}
        <code>prose</code> is a syntactically valid (if meaningless without the plugin) class
        string — every prior session&apos;s &quot;tsc/lint/test/build all green&quot; check passed
        regardless; it&apos;s a pure CSS-output defect only visible by inspecting the compiled
        stylesheet or rendering the page. Confirmed directly: <code>grep -c &quot;\.prose&quot;{" "}
        .next/static/chunks/*.css</code> returned 0 matches pre-fix. Fixed by installing{" "}
        <code>@tailwindcss/typography</code> and registering it via Tailwind v4&apos;s CSS-first{" "}
        <code>@plugin &quot;@tailwindcss/typography&quot;;</code> directive in{" "}
        <code>globals.css</code> — confirmed post-fix that the compiled stylesheet now contains a
        full <code>.prose</code> rule set.
      </p>

      <p>
        <code>error-boundary-heading-focus-on-mount</code>: a fresh-angle accessibility audit
        (dynamic-content focus management, distinct from the closed table-header/alert-to-aria/
        focus-restore/reduced-motion/zoom-reflow/heading-hierarchy/form-autocomplete series) found{" "}
        <code>src/app/error.tsx</code> and <code>src/app/global-error.tsx</code> — the two React
        error boundaries that catch an unexpected runtime error — never moved focus to their own
        fallback UI when they mounted. Next&apos;s built-in route announcer (see{" "}
        <code>node_modules/next/dist/docs/03-architecture/accessibility.md</code>) only fires on a
        page navigation — it inspects <code>document.title</code>/<code>&lt;h1&gt;</code> after a
        route transition completes — but these boundaries can also mount with{" "}
        <em>no navigation at all</em>: a client-side interaction throwing mid-page swaps the
        segment (or, for <code>global-error.tsx</code>, the whole document) to the fallback UI in
        place. In that case a screen reader user got no cue whatsoever that &quot;Something went
        wrong&quot; had replaced the page they were just using — focus stayed wherever it was, and
        nothing was announced. Fixed by adding a <code>ref</code> plus a <code>tabIndex</code> of{" "}
        <code>-1</code> to each boundary&apos;s heading and calling{" "}
        <code>.focus()</code> on it inside the existing{" "}
        <code>useEffect</code> that already logs the error — mirroring the standard React error-
        boundary accessibility pattern (a programmatically-focusable, non-tabbable heading).
        Verified in a real browser (no React component test harness exists in this repo, per{" "}
        AGENT_PROTOCOL): a temporary throwing route + a Playwright script confirmed{" "}
        <code>document.activeElement</code> was the boundary&apos;s <code>&lt;h1&gt;</code> after
        mount, both removed before committing. <code>src/app/not-found.tsx</code> was deliberately
        left alone — it is a plain Server Component reached only via an actual route resolution
        (initial load or a <code>next/link</code> transition), a case Next&apos;s route announcer
        already covers, unlike the two boundaries above which can trigger mid-interaction with no
        navigation event at all.
      </p>

      <p>
        <code>starter-upsell-stripe-connect-send-race-guard-ordering-fix</code>: a Convex/SQLite
        idempotency-class audit found that two of the CAS (compare-and-swap) duplicate-send guards
        added in earlier sessions — <code>sendStarterUpsellAction</code> and{" "}
        <code>sendStripeConnectOnboardingLinkToClientAction</code> (both in{" "}
        <code>src/app/dashboard/leads/actions.ts</code>) — recorded their sent-marker{" "}
        <em>after</em> the real email send instead of before it, unlike every sibling guard in the
        same family (checkout-recovery, outreach, inquiry reply), which all persist the mark first.
        Marking after the send means the CAS check runs too late to actually prevent a duplicate:
        two concurrent requests (a second open dashboard tab, or a double-click before the
        button&apos;s <code>isPending</code>-disabled state applies) both read the same starting
        count, both pass eligibility, and <em>both send the real email</em> before either call
        reaches the mark — the guard only detected the collision afterward and reported{" "}
        <code>success: false</code> for the losing call, by which point the duplicate had already
        gone out. Fixed by moving the CAS mark to run immediately before the send in both actions
        (mirroring <code>recordCheckoutRecoverySent</code>&apos;s persist-then-notify ordering): a
        lost CAS or a fail-closed <code>ConvexPrimaryWriteError</code> on the mark now skips the
        send entirely, and a genuine send failure after a successful mark is reported with a note
        that the marker was already recorded (safe, since this marker is a concurrency guard only,
        not a one-shot gate — a deliberate resend still succeeds).
      </p>

      <p>
        <code>marketing-voice-pack-client-send-race-guard-ordering-fix</code>: the ordering bug
        the entry above fixed for <code>sendStarterUpsellAction</code> /{" "}
        <code>sendStripeConnectOnboardingLinkToClientAction</code> also existed in{" "}
        <code>sendMarketingPackToClientAction</code> and{" "}
        <code>sendClientVoicePackToClientAction</code> — both sent the email first and only
        recorded <code>markMarketingPackSentToClient</code> /{" "}
        <code>markClientVoicePackSentToClient</code>&apos;s CAS marker afterward, so two
        concurrent requests could both pass eligibility and both send a real duplicate
        marketing-pack or voice-FAQ-pack email before either reached the mark. Unlike the
        Starter-upsell/Stripe-Connect markers (an incrementing counter that a later, deliberate
        resend can always advance past), these two markers are <em>one-shot</em> gates —{" "}
        <code>sentToClientAt</code> is only ever cleared by regenerating the pack — so a naive
        mark-before-send reorder would permanently mark a pack &quot;sent&quot; even when the send
        that reservation was guarding then failed (a suppression hit, a Resend API error),
        defeating <code>listMarketingPacksMissingClientSend</code>&apos;s &quot;generated but
        never emailed&quot; visibility. Fixed with a reserve-then-send-then-release pattern
        instead of a blind reorder: the marker is written <em>before</em> the send (closing the
        concurrency window — a lost reservation or a fail-closed{" "}
        <code>ConvexPrimaryWriteError</code> skips the send entirely), and a new{" "}
        <code>clearMarketingPackSentToClient</code> / <code>clearClientVoicePackSentToClient</code>{" "}
        mutation (Convex <code>clearSentToClient</code>, plus the SQLite-fallback twin) releases
        the reservation — via an exact-match compare-and-swap on the timestamp this call itself
        wrote, a safe no-op if a regenerate already cleared it — only if the send then fails. The
        release call is itself best-effort (not <code>requireConvex</code>-gated): on the rare
        double-failure where the release also fails, the marker stays stuck showing
        &quot;sent&quot;, and regenerating the pack (which always clears{" "}
        <code>sentToClientAt</code>) is the documented manual recovery.
      </p>

      <p>
        <code>commerce-client-receipt-resend-race-guard-ordering-fix</code>: the same
        reserve-then-send-then-release pattern the entry above shipped for the marketing/voice pack
        sends was never checked against the third one-shot-marker send action,{" "}
        <code>resendCommerceClientReceiptAction</code> (the operator&apos;s row-level remedy for a
        Commerce Buy now order stuck on{" "}
        <code>listCommerceOrdersMissingClientReceipt</code>). It still sent the client receipt
        email first and only called <code>markCommerceOrderClientReceiptSent</code>&apos;s CAS
        marker afterward, so two concurrent resend clicks (a second dashboard tab, or a
        double-click before the button&apos;s <code>isPending</code>-disabled state applied) could
        both pass the not-yet-sent check and both send a real duplicate receipt email before either
        reached the mark. Fixed the same way: the marker is now reserved <em>before</em> the send (a
        lost reservation or a fail-closed <code>ConvexPrimaryWriteError</code> skips the send
        entirely), and a new <code>clearCommerceOrderClientReceiptSent</code> mutation (Convex{" "}
        <code>commerceOrders.clearClientReceiptSent</code>, plus the SQLite-fallback twin) releases
        the reservation — an exact-match compare-and-swap on the timestamp this call itself wrote —
        only if the send then fails, so the order correctly reappears as not-yet-sent for a retry.
        Deliberately left untouched: the Stripe webhook&apos;s own call to{" "}
        <code>markCommerceOrderClientReceiptSent</code> (the order&apos;s <em>initial</em> receipt
        send) stays mark-after-send — its idempotency comes from checking the marker before
        deciding whether to attempt a send at all and recovering on redelivery
        (<code>hasCommerceClientReceiptSentMarker</code> /{" "}
        <code>planCommerceWebhookSideEffects</code>), a fundamentally different, already
        deliberately-designed model from a dashboard button click, and the release mutation is
        never called from the webhook path.
      </p>

      <p>
        <code>marketing-voice-pack-send-stale-content-race-guard</code>: the reserve-then-send
        pattern the three entries above shipped closes the duplicate-send race but left a distinct
        one open — <code>sendMarketingPackToClientAction</code> /{" "}
        <code>sendClientVoicePackToClientAction</code> read the pack&apos;s <code>variants</code>{" "}
        once at the top of the action, then reserved the <code>sentToClientAt</code> marker keyed
        only on <code>leadSlug</code> (plus <code>yearMonth</code> for marketing packs), with no
        check that the pack was still the version that was read. A concurrent{" "}
        <em>Regenerate</em> landing between that read and the reservation clears{" "}
        <code>sentToClientAt</code> and swaps in new <code>variants</code>/
        <code>generatedAt</code> — the in-flight reservation then succeeded against the now-unset
        marker on the <em>new</em> row, while the send that followed still emailed the{" "}
        <em>stale</em> content captured earlier. The client would receive superseded copy while
        every consumer of <code>sentToClientAt</code> (pipeline-health, the daily digest,{" "}
        <code>listMarketingPacksMissingClientSend</code>) reported the current pack as delivered.
        Fixed by threading the read pack&apos;s <code>generatedAt</code> through as an{" "}
        <code>expectedGeneratedAt</code> argument on <code>markMarketingPackSentToClient</code> /{" "}
        <code>markClientVoicePackSentToClient</code> (Convex <code>markSentToClient</code>, plus
        the SQLite-fallback twin) — the reservation now also fails when the pack&apos;s current{" "}
        <code>generatedAt</code> no longer matches, even though a regenerate already cleared{" "}
        <code>sentToClientAt</code> and would otherwise look like a normal, unclaimed pack. On a
        lost reservation the action re-fetches the pack to tell this apart from an ordinary
        duplicate-send race and reports a distinct &quot;pack was regenerated while this send was
        in flight — refresh and resend&quot; message rather than the generic duplicate-send
        wording, since the correct operator action (resend the current version) differs from the
        duplicate-send case (do nothing, it already went out).
      </p>

      <p>
        <code>buffer-schedule-stale-pack-content-guard</code>: the same stale-content class also
        reached the dormant, opt-in Buffer auto-post path,{" "}
        <code>scheduleMarketingPackToBufferAction</code> — a structurally distinct function from
        the two email-send actions above (its own eligibility gate, its own{" "}
        <code>bufferPostedVariantKeys</code> marker), so the{" "}
        <code>expectedGeneratedAt</code> fix above did not cover it. It reads the current
        month&apos;s pack once at the top of the action, then makes a sequence of real, awaited
        Buffer API calls — <code>listBufferProfiles</code>, then one <code>createBufferUpdate</code>{" "}
        per profile/variant — all built from that single stale in-memory read. A concurrent{" "}
        <strong>Regenerate marketing pack</strong> click landing anywhere in that window let the
        action publish the operator&apos;s just-superseded copy to the lead&apos;s live
        Facebook/Instagram profile through Buffer — unlike an email, a live social post
        can&apos;t be recalled once it ships. The existing TOCTOU guard in this same function
        (re-reading the lead and merging onto a fresh <code>bufferPostedVariantKeys</code> read
        before the final persist) only protects the posted-variant <em>marker</em> from a lost
        update; it does nothing to stop stale <em>content</em> from reaching Buffer in the first
        place. Fixed by re-fetching the pack and comparing <code>generatedAt</code> against the
        captured value immediately before each profile&apos;s own posting pass (not just once up
        front) — a regenerate detected at any point stops the remaining profiles from receiving the
        superseded copy, and any profiles already posted to before the regenerate landed are
        reported as scheduled (their posts already went out and can&apos;t be undone) while the
        rest are reported skipped with a message telling the operator to re-run.
      </p>

      <p>
        <code>bundle-buyer-email-resend-race-guard-ordering-fix</code>: a research agent covering
        this file&apos;s empty-backlog tiers found the fourth and final action in the
        reserve-then-send race-guard series still on the older, weaker design —{" "}
        <code>resendBundleBuyerEmailAction</code> (the operator&apos;s row-level remedy for{" "}
        <code>isBundleHandoffMissingBuyerEmail</code>). Its own doc comment even named the gap: it
        computed <code>needsReceipt</code>/<code>needsDns</code> from one stale read, sent the
        receipt/DNS emails first, and only re-read the handoff <em>after</em> both sends completed
        to check whether a concurrent invocation had already recorded the same marker note — this
        could <em>detect</em> a lost race and warn the operator, but by then the real duplicate
        transactional email had already gone out to the paying bundle buyer, so it could never
        actually <em>prevent</em> the duplicate the way{" "}
        <code>commerce-client-receipt-resend-race-guard-ordering-fix</code> and the marketing/voice
        pack fixes above do for their own sends. Fixed by extending the same reserve-then-send
        pattern to this handoff&apos;s notes-array marker shape: a new{" "}
        <code>reserveBuyerEmailNotes</code> Convex mutation (plus the SQLite-fallback twin,{" "}
        <code>sqliteReserveBundleBuyerEmailNotes</code>) atomically re-checks each requested
        marker&apos;s absence and appends only the still-absent one(s) in the same write, returning
        which marker(s) were actually reserved so the caller sends only what it now owns. A
        concurrent invocation (a second open dashboard tab, or a double-click before the
        button&apos;s <code>isPending</code>-disabled state applies) sees its wanted marker(s)
        already reserved and skips the send entirely — the race is now closed <em>before</em> any
        email goes out, not just reported afterward. A reserved send that then fails releases its
        own marker via a new <code>releaseBuyerEmailNotes</code> mutation (exact string removal
        from the notes array, a safe no-op if already gone) so the handoff correctly reappears in{" "}
        <code>isBundleHandoffMissingBuyerEmail</code>&apos;s due-queue for a retry. The SQLite
        fallback needs no explicit compare-and-swap token (unlike the scalar-field twins above):
        its read-then-write is two synchronous <code>node:sqlite</code> calls with no{" "}
        <code>await</code> between them, so no concurrent async call can interleave mid-reservation
        — the same reasoning <code>updateDeployHandoffStatus</code>&apos;s own SQLite-fallback
        branch already relies on for its notes-append.
      </p>

      <h2 id="observability">10. Observability (error tracking)</h2>
      <p>
        Empty-backlog audit (2026-07-28,{" "}
        <code>empty-backlog-tiers-1-5-clean-sweep-observability-gap-noted</code>) found this repo
        had zero error-tracking/observability tooling — no Sentry, Datadog, Honeycomb, PostHog, or
        LogRocket, and no generic monitoring integration of any kind. Every failure path, including
        the Stripe webhook handler&apos;s 190+ <code>console.error</code>/<code>console.warn</code>{" "}
        call sites, was visible only via whatever the hosting platform&apos;s raw log retention
        happened to capture — no aggregation, alerting, or queryable index existed for a production
        payment-webhook failure, a Convex-outage SQLite-fallback trigger, or a Resend delivery
        failure.
      </p>
      <p>
        A real Sentry-equivalent SDK integration needs an operator-provided DSN — the same
        operator-gated class as <code>ALLOW_STRIPE_CONNECT_ONBOARDING</code> /{" "}
        <code>ALLOW_MARKETING_SCHEDULING</code> above — and a vendor-specific envelope format that
        should not be guessed at without that vendor&apos;s own SDK. Shipped instead: a
        vendor-agnostic generic webhook sink (<code>src/lib/observability/error-tracking.ts</code>
        ). Set <code>ERROR_TRACKING_WEBHOOK_URL</code> to any HTTP(S) endpoint that accepts a JSON
        POST — a custom receiver, a Datadog/Honeycomb log-intake URL, a Sentry-compatible ingestion
        proxy, etc. — and <code>captureError</code> best-effort POSTs a structured payload (
        <code>message</code>, <code>stack</code>, <code>component</code>, <code>severity</code>,{" "}
        <code>timestamp</code>, bounded free-text <code>context</code>) there, with an optional{" "}
        <code>ERROR_TRACKING_WEBHOOK_SECRET</code> sent as a bearer{" "}
        <code>Authorization</code> header (never the URL or body, mirroring{" "}
        <code>buffer-token-header-not-query</code>). Unlike the Connect/Buffer scaffolds this needs
        no separate <code>ALLOW_*</code> opt-in flag — sending the app&apos;s own error diagnostics
        to a URL the operator themselves configured carries no money-movement or third-party-visible
        side effect, so the URL&apos;s presence is itself the opt-in. Leaving it unset is a total
        no-op: every call site keeps its existing <code>console.error</code>/<code>console.warn</code>{" "}
        exactly as before this shipped. <code>captureError</code> never throws and aborts after{" "}
        <code>DEFAULT_ERROR_TRACKING_TIMEOUT_MS</code> (4s) rather than risk hanging a caller that
        must itself return promptly.
      </p>
      <p>
        First wiring: the Stripe webhook handler&apos;s <code>POST</code> now wraps its entire{" "}
        <code>switch (event.type)</code> in one outer <code>try</code>/<code>catch</code>. Every
        expected/recoverable failure inside a <code>case</code> is already caught and{" "}
        <code>console.error</code>&apos;d at its own call site — the idempotency/redelivery
        semantics documented throughout that file depend on exactly which sub-step failed, so none
        of that per-case handling changed. The outer catch exists only for a genuinely unexpected
        bug that escapes every inner catch (previously invisible beyond raw logs): it best-effort
        captures with <code>component: &quot;stripe-webhook&quot;</code> plus the event type/id, then
        re-throws unchanged — Next.js still turns that into a 500, preserving the exact retry
        behavior Stripe&apos;s delivery contract depends on. Wiring the remaining
        high-value failure paths (a Convex-outage SQLite-fallback trigger, a Resend delivery
        failure) is deliberately left for a future iteration rather than a blanket sweep of this
        session&apos;s single budget — see <code>/docs/process</code>.
      </p>
      <p>
        <code>error-tracking-message-length-cap</code>: a fresh-code audit of the scaffold above
        (brand new, never previously reviewed) found <code>buildErrorTrackingPayload</code> capped{" "}
        <code>stack</code> (<code>MAX_STACK_LENGTH</code>) and every <code>context</code> value (
        <code>MAX_CONTEXT_VALUE_LENGTH</code>) but left <code>message</code> — derived from{" "}
        <code>error.message</code> or <code>String(error)</code> for a non-<code>Error</code> thrown
        value — completely unbounded before <code>JSON.stringify</code>-ing it into the POST body.
        Since this field is only ever populated by the exact class of{" "}
        <em>genuinely unexpected</em> exception the scaffold exists to catch, a thrown value whose
        message embeds a large blob (a raw string throw, a parse error echoing the offending
        payload, a library that stuffs a full response body into <code>.message</code>) would bypass
        every other size bound this module enforces — an oversized POST to whatever endpoint the
        operator configured, not an app-availability issue (the send still has its own timeout).
        Fixed by adding <code>MAX_MESSAGE_LENGTH</code> (500, matching{" "}
        <code>MAX_CONTEXT_VALUE_LENGTH</code>) and truncating <code>message</code> the same way{" "}
        <code>stack</code> already was, plus tests covering an oversized <code>Error.message</code>,
        an oversized non-<code>Error</code> thrown value, and confirming a message at or under the
        cap is left untouched.
      </p>
      <p>
        <code>resend-email-capture-error-wiring</code>: closed the second of the two candidate
        failure paths the original scaffold entry named as future work — a Resend delivery
        failure. <code>src/lib/email/resend.ts</code>&apos;s <code>sendEmail</code> and{" "}
        <code>sendOperatorDailyDigest</code> are the only two Resend HTTP-call sites in the file
        (every other send helper in this module funnels through <code>sendEmail</code>), and both
        catch blocks already <code>console.error</code>&apos;d and returned{" "}
        <code>{"{ success: false, error }"}</code> without ever reporting to the scaffold. Both now
        also <code>await captureError(error, {"{ component, ... }"})</code> — <code>
          &quot;resend-email&quot;
        </code>{" "}
        (with the send&apos;s <code>leadSlug</code> when known — the internal identifier, not the
        recipient address, since an operator-configured{" "}
        <code>ERROR_TRACKING_WEBHOOK_URL</code> may not be a vetted PII processor) and{" "}
        <code>&quot;resend-operator-digest&quot;</code> respectively. Best-effort and non-blocking,
        matching every other call site&apos;s contract: a capture failure can never mask or replace
        the original send failure this catch already handles. The remaining named candidate — a
        Convex-outage SQLite-fallback trigger — has no shared choke point (84 separate hand-written{" "}
        <code>console.warn</code> sites across ~80 exported functions in <code>src/lib/db.ts</code>,
        confirmed via grep) and stays deliberately out of scope: wiring it would mean either
        touching all 84 call sites or first extracting a shared fallback-wrapper helper, either of
        which is a distinct, larger iteration in the most heavily-tested file in the repo, not a
        same-session addition.
      </p>
      <p>
        <code>stripe-webhook-payment-write-capture-error</code>: a fresh-angle audit found a
        structural blind spot in the Stripe webhook&apos;s own outer{" "}
        <code>try</code>/<code>catch</code> (the very first wiring above) — it only fires for an
        exception that escapes <em>every</em> inner <code>catch</code>, but nearly every one of
        this file&apos;s ~40 <code>webhookFulfillmentFailureResponse(...)</code> sites — including
        the one wrapping the single highest-stakes write in the file, <code>recordLeadPayment</code>{" "}
        + <code>enqueueProductionHandoff</code> for bundle checkouts — <code>return</code>s its own
        5xx JSON response instead of re-throwing. A <code>return</code> inside a{" "}
        <code>catch</code> is ordinary control flow, not a thrown exception, so it can never reach
        the outer <code>catch</code>&apos;s <code>captureError</code> call. Net effect: the scaffold
        already captured a genuinely unhandled bug, but not the file&apos;s actual designed failure
        contract (a local write failure returning 5xx so Stripe retries) — including the one case
        that most directly means a paying customer&apos;s payment isn&apos;t recorded and their site
        handoff didn&apos;t happen. Rather than sweep all ~40 sites (the same regression-risk
        reasoning already applied to <code>db.ts</code>&apos;s 84 sites above), wired{" "}
        <code>captureError</code> into just this one — the highest-value single site — with{" "}
        <code>failureKind: &quot;bundle_payment_or_handoff&quot;</code> added to the usual{" "}
        <code>component</code>/<code>eventType</code>/<code>eventId</code> context so it&apos;s
        distinguishable from the outer catch&apos;s own captures. The other ~39 sites remain
        unwired, a real gap but an explicitly deferred one, not a full sweep.
      </p>
      <p>
        <code>commerce-order-ledger-write-capture-error</code>: closes the Commerce-side sibling of
        the fix above. The webhook&apos;s <code>catch</code> around{" "}
        <code>insertCommerceOrder</code> (the Buy now order ledger write, distinct from bundle
        payments per the money-separation invariant below) shares the exact same shape — it{" "}
        <code>return</code>s its own <code>commerce_order_ledger</code> 5xx instead of re-throwing,
        so it never reached the outer catch&apos;s <code>captureError</code> either. A failure there
        means a paying Buy now customer&apos;s order isn&apos;t recorded and no operator
        inquiry/client receipt follows — the same severity tier as{" "}
        <code>bundle_payment_or_handoff</code>, on the other primary payment-recording write in this
        file. Wired <code>captureError</code> into just this one site, with{" "}
        <code>failureKind: &quot;commerce_order_ledger&quot;</code>, for the same single-site,
        deliberately-not-a-sweep reasoning as its bundle sibling. The remaining ~38{" "}
        <code>webhookFulfillmentFailureResponse(...)</code> sites (and the 84-site{" "}
        <code>db.ts</code> candidate above) stay out of scope.
      </p>
      <p>
        <code>orders-recurring-canceled-capture-error</code>: found the identical{" "}
        <code>return</code>-instead-of-re-throw blind spot at a different, coherent cluster of 5
        catch sites all sharing <code>failureKind: &quot;orders_recurring_canceled&quot;</code> —
        every place <code>markOrdersRecurringCanceledByCustomer</code> is called (
        <code>customer.subscription.deleted</code>, two branches of{" "}
        <code>customer.subscription.created|updated</code> handling a pause or a would-be
        reactivate with no recognized catalog Price on the Subscription&apos;s items, and the same
        two branches&apos; <code>invoice.payment_failed</code> / <code>invoice.paid</code> twins).
        A failure at any of these means a canceled or past-due subscriber keeps paid
        marketing-pack / voice-pack / Commerce-catalog entitlement indefinitely, with the only
        signal being a 5xx in Stripe&apos;s own dashboard (which the operator does not monitor)
        rather than this app&apos;s error-tracking webhook — until Stripe&apos;s own ~3-day retry
        window also lapses. Unlike the two single-site fixes above, this is one coherent,
        mechanically-identical operation (the same function, the same failure meaning) repeated
        across 5 call sites rather than 5 distinct write types, so all 5 were wired in one pass —
        each got its own <code>captureError</code> call immediately before its existing{" "}
        <code>webhookFulfillmentFailureResponse(&quot;orders_recurring_canceled&quot;)</code>{" "}
        line, matching the same <code>component</code>/<code>eventType</code>/<code>eventId</code>{" "}
        shape as every other capture in this file. Two of the five branches (the
        no-catalog-Price/foreign-Price edge cases on the reactivate and restore paths) had no
        prior failure-path test coverage at all, not just a missing capture assertion — added
        dedicated tests for both alongside updating the three pre-existing failure tests to also
        assert the new <code>captureError</code> call. The remaining ~33{" "}
        <code>webhookFulfillmentFailureResponse(...)</code> sites in this file stay out of scope.
      </p>
      <p>
        <code>stripe-webhook-dispute-resolution-capture-error</code>: swept the one remaining
        coherent handler family sharing the same return-instead-of-re-throw blind spot — all 26{" "}
        <code>webhookFulfillmentFailureResponse(...)</code> catch sites across{" "}
        <code>charge.refunded</code>, <code>charge.dispute.created</code>,{" "}
        <code>charge.dispute.closed</code>, and <code>refund.updated</code> (four Stripe event
        types that all correlate a Checkout Session/Customer and durably flag or clear{" "}
        <code>refundedAt</code>/<code>disputedAt</code>). None reached the outer catch&apos;s own{" "}
        <code>captureError</code> for the identical structural reason as{" "}
        <code>orders-recurring-canceled-capture-error</code>: each returns its own 5xx instead of
        throwing. The stakes here are correctness, not just observability —{" "}
        <code>isStarterOnlyOrder</code>, <code>isGrowthOrder</code>, and pipeline-health&apos;s
        revenue/clawback totals all key off <code>refundedAt</code>/<code>disputedAt</code>, so a
        silent write failure here means a refunded/disputed order keeps looking live: a disputed
        Growth customer would keep getting upgrade nudges, and a refunded/disputed Commerce order
        already marked paid out would silently miss its clawback flag. Wired all 26 in one pass —
        larger than the prior 5-site cluster but identical in shape (same function family, same
        failure meaning, purely mechanical), each getting a <code>captureError</code> call
        immediately before its existing <code>webhookFulfillmentFailureResponse(...)</code> line.
        While wiring tests, found the same test-coverage gap the prior cluster fix also
        surfaced: two branches — the lost-status bundle and commerce mark-disputed writes in{" "}
        <code>charge.dispute.closed</code> — had no dedicated failure-path test at all (only their{" "}
        <code>charge.dispute.created</code> twins were covered); added both. The remaining ~23{" "}
        <code>webhookFulfillmentFailureResponse(...)</code> sites in this file (checkout/commerce
        line-item lookups, email sends, subscription retrieves — each a distinct, non-repeating
        write type) stay out of scope, same reasoning as every prior single-site/cluster fix here.
      </p>
      <p>
        <code>orders-recurring-reactivated-capture-error</code>: the mirror-image gap left over from{" "}
        <code>orders-recurring-canceled-capture-error</code>, which wired the 5-site{" "}
        <em>pause</em> cluster but explicitly left its reactivate/renew counterpart in the same two
        handlers out of scope. Wired <code>captureError</code> into the 5 remaining sites: the{" "}
        <code>customer.subscription.updated</code> and <code>invoice.paid</code> restore branches
        (each calling <code>clearOrdersRecurringCanceledByCustomer</code> +{" "}
        <code>syncOrdersRecurringEntitlementByCustomer</code>,{" "}
        <code>failureKind: &quot;orders_recurring_reactivated&quot;</code>), the{" "}
        <code>invoice.payment_failed</code> and <code>invoice.paid</code>{" "}
        <code>stripe.subscriptions.retrieve</code> calls (
        <code>failureKind: &quot;subscription_retrieve&quot;</code>), and{" "}
        <code>invoice.paid</code>&apos;s <code>recordSubscriptionRenewalPayment</code> call (
        <code>failureKind: &quot;subscription_renewal_revenue&quot;</code>). Same stakes as the
        pause cluster: a silent failure here means a reactivated subscriber stays wrongly flagged as
        paused (marketing/voice packs withheld, stuck in the dashboard&apos;s paused-MRR-recovery
        queue) or a renewal invoice&apos;s amount silently never lands in{" "}
        <code>lifetimeRevenueUsd</code>/<code>revenueTotalUsd</code> — invisible except as a 5xx in
        Stripe&apos;s own dashboard. All 5 existing failure-path tests already asserted the 500
        response and <code>step</code>; extended each with the matching{" "}
        <code>captureError</code> assertion rather than adding new tests, since every branch already
        had failure-path coverage. The remaining ~16{" "}
        <code>webhookFulfillmentFailureResponse(...)</code> sites in this file stay out of scope.
      </p>
      <p>
        <code>stripe-connect-status-cache-write-capture-error</code>: a two-site gap outside the
        webhook file&apos;s own catch clusters — both places that persist the Stripe Connect
        onboarding status cache (<code>updateLeadStripeConnectStatus</code>, keyed by{" "}
        <code>LEAD_STRIPE_CONNECT_STATUS_CONVEX_PRIMARY</code> so a Convex failure fails closed
        rather than split-braining the cache) swallow their own write failure and continue,
        deliberately never 5xx-ing or surfacing an operator-facing error — this display cache is
        not a ledger write, so retrying or failing the caller would be wrong. But &quot;never
        surface an error&quot; also meant neither catch had any path to{" "}
        <code>captureError</code> at all — a different axis from the db-layer sweeps above, since
        this isn&apos;t about a return-instead-of-throw structural gap, just two catches that were
        never wired up in the first place. <code>route.ts</code>&apos;s <code>account.updated</code>{" "}
        handler (the webhook-driven refresh) and <code>actions.ts</code>&apos;s{" "}
        <code>checkStripeConnectAccountStatusAction</code> (the operator&apos;s manual &quot;Check
        status&quot; click) both call the same persistence function and both silently no-op on
        failure — meaning <code>pipeline-health</code>&apos;s{" "}
        <code>connectOnboardingIncompleteCount</code> MetricCard and the daily digest can both keep
        reading a stale cache indefinitely, with the dashboard action even returning{" "}
        <code>success: true</code> (the live Stripe fetch really did succeed; only the cache write
        failed) so there was no way for an operator to notice either. Added a{" "}
        <code>captureError</code> call to both catches (<code>component:
        &quot;stripe-connect-status&quot;</code>, distinct <code>failureKind</code> per call site,
        plus <code>leadSlug</code>) — <code>actions.ts</code> needed its first-ever{" "}
        <code>captureError</code> import in this ~3600-line file. Currently a dormant,
        low-volume surface (<code>ALLOW_STRIPE_CONNECT_ONBOARDING</code>-gated), but the same blind
        spot the busier clusters above already closed.
      </p>
      <p>
        <code>db-getLeads-convex-fallback-capture-error</code>: a closer look at the{" "}
        <code>db.ts</code> Convex-fallback gap named above (84{" "}
        <code>console.warn</code> &quot;falling back to SQLite&quot; sites, twice deferred as
        too large) found the gap is narrower in practice than the raw count suggests.
        Every write path this file&apos;s own dual-backend invariant names — the 24{" "}
        <code>*_CONVEX_PRIMARY</code> constants across <code>src/lib/**/*-persist.ts</code> — sets{" "}
        <code>requireConvex: true</code> at its real call site, which means{" "}
        <code>shouldFallbackToSqliteOnConvexFailure</code> returns <code>false</code> and the
        function <em>throws</em> a <code>ConvexPrimaryWriteError</code> instead of ever reaching
        its own <code>console.warn</code>-and-fallback branch — that branch is dead code for the
        one caller that matters (confirmed directly for <code>recordLeadPayment</code> and{" "}
        <code>recordSubscriptionRenewalPayment</code>, both called only with{" "}
        <code>WEBHOOK_CONVEX_PRIMARY</code>). A thrown <code>ConvexPrimaryWriteError</code> from
        one of these already propagates to whatever try/catch wraps the call site (the Stripe
        webhook&apos;s outer catch, for the write paths it calls) — already covered, not a gap.
        The genuinely live fallback branches are the plain <em>read</em> functions (
        <code>getLeads</code>, <code>getLeadBySlug</code>, <code>listOrders</code>, and similar) —
        reads have no <code>requireConvex</code> concept at all, so every one of them
        unconditionally degrades to SQLite on any Convex error, silently, on every call.
      </p>
      <p>
        Wired <code>captureError</code> into exactly one of those read paths —{" "}
        <code>getLeads()</code>, chosen as the single highest-blast-radius read in the file: every
        dashboard page, the daily digest, and the webhook&apos;s <code>account.updated</code>{" "}
        handler all call it, so a Convex outage there means the entire CRM silently runs on
        decayed SQLite data across every consumer at once. Deliberately not wired into every read
        function this session, for the same reason the webhook fix above didn&apos;t sweep its own
        40 sites — but also deliberately not the two hottest read paths blindly, since reads run
        far more often than a once-per-checkout webhook write. Read functions have no natural
        per-event boundary the way a webhook event does, so a sustained Convex outage would fire{" "}
        <code>captureError</code> on every single call rather than once per incident; this scaffold
        has no built-in dedup, and a serverless deployment can&apos;t rely on an in-process
        throttle surviving between invocations anyway. Accepted this as a known, reasonable
        trade-off for a dormant, operator-opt-in diagnostic feature (most receiving endpoints —
        Sentry-style tools, a custom log intake — already dedup/group incoming events server-side;
        building bespoke throttling here would be premature complexity) rather than inventing new
        infrastructure before anyone has actually turned this on. A future session extending this
        to more read paths should re-examine that trade-off if it stops being reasonable in
        practice.
      </p>
      <p>
        <code>db-read-path-capture-error-sweep-getLeadBySlug-listOrders</code>: took up that
        re-examination named above and extended <code>captureError</code> to the two read paths{" "}
        <code>getLeads()</code> deliberately deferred — <code>getLeadBySlug()</code> (the second
        highest-blast-radius read: backs the public <code>/preview/[slug]</code> SSR page, contact
        form lookup, checkout lead resolution, the billing portal, and most per-lead dashboard
        actions) and <code>listOrders()</code> (feeds revenue totals, pipeline health, the daily
        digest, and billing/entitlement eligibility checks). Same one-line pattern, same accepted
        no-dedup trade-off reasoning as <code>getLeads()</code> — this is one site-by-site pass
        continuing that scoping, not a reversal of it. All other <code>db.ts</code> read functions
        with the same live-fallback shape remain out of scope for this iteration.
      </p>
      <p>
        <code>checkout-session-record-capture-error-wiring</code>: closed the same observability gap
        one hop earlier in the money funnel — <code>recordCheckoutSessionCreated</code>&apos;s catch
        in both <code>src/app/api/stripe/checkout/route.ts</code> and{" "}
        <code>src/app/api/commerce/checkout/route.ts</code> already fails closed with a 502
        (<code>CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY</code> sets <code>requireConvex: true</code>),
        but neither wired <code>captureError</code> before this — a customer with an already-valid
        Stripe checkout URL being told to retry, with zero first-class signal beyond a raw{" "}
        <code>console.warn</code>. Wired <code>captureError</code> into both catches (
        <code>component: &quot;stripe-checkout&quot;</code> /{" "}
        <code>&quot;commerce-checkout&quot;</code>, <code>failureKind: &quot;checkout_session_record&quot;</code>),
        mirroring the webhook route&apos;s <code>bundle_payment_or_handoff</code> /{" "}
        <code>commerce_order_ledger</code> precedent exactly.
      </p>
      <p>
        <code>db-ts-convex-fallback-capture-error-full-sweep</code>: closes the one item every prior
        entry above named and deferred — the Convex-outage SQLite-fallback trigger, previously left
        unwired because sweeping all ~84-88 <code>console.warn(...falling back to SQLite...)</code>{" "}
        sites in <code>src/lib/db.ts</code> by hand was judged too large a single-session diff for
        the repo&apos;s most heavily-tested file. Mechanized instead of hand-wiring: a script walks
        the file, finds each fallback <code>console.warn</code> block, identifies its enclosing
        function, and inserts the same one-line{" "}
        <code>void captureError(e, {"{ component: \"db-<fnName>-convex-fallback\" }"})</code>{" "}
        pattern the 13 already-wired sites established — applied uniformly across all remaining 75
        sites in one pass instead of one function at a time, then verified with the full{" "}
        <code>tsc</code>/lint/test/build gate. While wiring, normalized every capture call in the
        file (the 12 pre-existing sites included) to <code>void</code> rather than{" "}
        <code>await</code>, so a slow or unreachable tracking endpoint can never add latency to the
        actual Convex-fallback request path — previously inconsistent, since an awaited call could
        stack up to <code>DEFAULT_ERROR_TRACKING_TIMEOUT_MS</code> (4s) of delay per request during a
        real outage. The read-path spam-during-outage concern raised when the first three read
        functions were wired (no dedup, a sustained outage fires on every call) was not solved with
        new throttling infrastructure — deliberately, per that same entry&apos;s own reasoning
        against premature complexity — but the newly-covered reads here are lower-traffic than
        those original three (per-lead detail views and periodic digest/cron reads, not
        every-page-load hot paths), so this extends an already-accepted trade-off rather than a new
        one. A handful of newly-wired write functions (confirmed for{" "}
        <code>recordLeadPayment</code>/<code>recordSubscriptionRenewalPayment</code>, each called
        from exactly one <code>requireConvex: true</code> site) have a fallback branch that is
        structurally unreachable today — the added <code>captureError</code> call there is inert,
        left in for uniformity rather than carved out as a special case. See{" "}
        <code>db-ts-convex-fallback-capture-error-full-sweep</code> in <code>/docs/process</code> for
        the full accounting.
      </p>
      <p>
        <code>buffer-schedule-stale-pack-variant-guard</code>: a residual gap in the same day&apos;s
        earlier <code>buffer-schedule-stale-pack-content-guard</code> fix — that fix re-checked the
        marketing pack&apos;s freshness once per Buffer profile, but{" "}
        <code>scheduleMarketingPackToBufferAction</code> can post more than one variant per profile
        (<code>MONTHLY_MARKETING_PACK_TYPES</code> generates 3 caption variants per lead per month),
        via several sequential <code>createBufferUpdate</code> calls inside that one profile&apos;s
        pass. A concurrent regenerate landing between the first and second variant post for the{" "}
        <em>same</em> profile still shipped the now-superseded copy to that profile&apos;s remaining
        posts, since the only freshness check for that profile had already passed. Moved the
        freshness re-check inside the innermost per-variant loop, immediately before each{" "}
        <code>createBufferUpdate</code> call, so a regenerate detected mid-profile stops the
        remaining variants for that profile too (not just the remaining profiles).
      </p>
      <p>
        <code>archive-orphan-stripe-products-per-item-guard</code>: the identical bug shape found
        again in a different subsystem —{" "}
        <code>archiveOrphanCommerceStripeProductsAction</code> re-read the Commerce catalog once,
        before its archive loop, to drop any orphan Stripe Product whose SKU had reappeared via a
        concurrent catalog save. But <code>archiveCommerceStripeProducts</code> archives its
        caller-supplied orphan list sequentially, one <code>stripe.products.update</code> call per
        item — a reappearance landing between two orphans&apos; own turns (not only before the loop
        started) still got the reappeared SKU&apos;s Product archived, breaking its live Buy now
        checkout with no operator signal until the next Sync to Stripe reactivated it.{" "}
        <code>archiveCommerceStripeProducts</code> now accepts an optional{" "}
        <code>isStillOrphan</code> callback invoked before EACH individual archive call rather than
        once before the batch; the action wires it to a fresh <code>getCommerceCatalog</code> read
        per candidate. <code>MAX_COMMERCE_SKUS</code> caps a catalog at 50 items, so the extra
        per-item reads are affordable for an operator-triggered, low-frequency cleanup action.
      </p>
      <p>
        <code>checkout-session-create-capture-error-wiring</code>: the last uninstrumented catch in
        the checkout money path — <code>checkout-session-record-capture-error-wiring</code> (above)
        wired <code>captureError</code> into the inner tracking catch in both{" "}
        <code>src/app/api/stripe/checkout/route.ts</code> and{" "}
        <code>src/app/api/commerce/checkout/route.ts</code>, but left the outer catch — the one
        wrapping the actual <code>stripe.checkout.sessions.create()</code> call itself — reporting
        only a generic 502 with no <code>captureError</code>, not even a <code>console.warn</code>.
        That outer catch fires on a bad/rotated <code>*_PRICE_ID</code> or{" "}
        <code>STRIPE_SECRET_KEY</code>, a Stripe outage, or a transient network error — the moment a
        shopper&apos;s checkout attempt fails before they ever reach Stripe&apos;s hosted page, one
        step upstream of the tracking catch already wired. Wired <code>captureError</code> into both
        outer catches (<code>failureKind: &quot;session_create&quot;</code>, same{" "}
        <code>component</code> values as their sibling catch), mirroring the exact call shape two
        lines below it in the same file.
      </p>
      <p>
        <code>db-order-read-family-capture-error-sweep</code>: continued the{" "}
        <code>db.ts</code> read-path series onto the next tier of live, unwired Convex-fallback
        reads in the bundle-order family — <code>listOrdersByLeadSlug()</code> (backs Manage
        billing, the public preview page&apos;s Commerce gate, and roughly a dozen per-lead
        dashboard eligibility actions), <code>getOrderByStripeSessionId()</code> (the Stripe
        webhook&apos;s refund/dispute correlation lookup, four call sites), and{" "}
        <code>getOrdersByStripeCustomerId()</code> (dunning and renewal-recovery notice
        resolution) — plus <code>listOpenCheckoutSessions()</code>, which feeds pipeline health,
        the daily digest, the Work-next lead scorer, and both abandoned-checkout recovery
        actions. Same one-line <code>captureError</code> pattern and accepted no-dedup trade-off
        as every prior entry in this series; the Commerce (Buy now) ledger&apos;s equivalent read
        family (<code>getCommerceOrderByStripeSessionId</code> and the{" "}
        <code>listCommerceOrders*</code> group) has the identical unwired shape and is the next
        deferred slice, not covered here.
      </p>
      <p>
        <code>resend-webhook-suppression-write-capture-error</code>: closed the one durable-write
        failure path in the codebase that had never been wired into the observability scaffold —{" "}
        <code>src/app/api/resend/webhook/route.ts</code>&apos;s <code>suppressEmail</code> catch
        (hard-bounce/complaint suppression) only <code>console.error</code>&apos;d before returning
        its 500, unlike every other durable-write failure path (the Stripe webhook, both checkout
        routes, and every wired <code>db.ts</code> read). A failed suppression write here means a
        hard-bounced or complained address keeps getting emailed by every future send — the exact
        sender-reputation-protection surface this route exists to close — with zero operator-visible
        signal beyond raw platform logs. Wired <code>captureError</code> in{" "}
        (<code>component: &quot;resend-webhook&quot;</code>,{" "}
        <code>failureKind: &quot;suppression_write&quot;</code>), mirroring the established pattern
        exactly.
      </p>
      <p>
        <code>db-commerce-order-read-family-capture-error-sweep</code>: closed the Commerce (Buy
        now) ledger read family named as the next deferred slice above —{" "}
        <code>listCommerceOrders</code>, <code>listUnpaidCommerceOrders</code>,{" "}
        <code>listCommerceOrdersRefunded</code>, <code>listCommerceOrdersDisputed</code>,{" "}
        <code>listCommerceOrdersMissingClientReceipt</code>, and{" "}
        <code>getCommerceOrderByStripeSessionId</code> — six functions backing the Commerce
        payouts panel, refund/dispute clawback visibility, the missing-client-receipt due queue,
        and Mark-paid-out lookups, all sharing the same unwired Convex-fallback shape the
        bundle-order family closed above. Same one-line <code>captureError</code> pattern,
        completing the read-path axis for both order families.
      </p>
      <p>
        <code>nav-header-checkout-cta-acquisition-source-fix</code>: with the observability axis
        exhausted, a standard five-tier sweep found a real gap in checkout-attribution
        completeness — <code>SiteHeader</code>&apos;s &quot;Get started&quot; button (mounted
        unconditionally from the single root <code>layout.tsx</code>, so it renders on{" "}
        <em>every</em> route: the homepage, all nine category landing pages, preview pages,
        checkout itself, and docs) linked to plain <code>/checkout</code> with no{" "}
        <code>?source=</code>. Every other checkout CTA in the app — the homepage pricing grid,
        every category landing page, the preview tier-upsell, outreach emails — was deliberately
        tagged with an allowlisted token; the header nav button was the one persistent,
        high-visibility CTA never covered, silently bucketing its conversions into{" "}
        &quot;Unknown / direct&quot; in <code>acquisitionSourceBreakdown</code>. Added a new{" "}
        <code>&quot;nav&quot;</code> token to <code>CHECKOUT_ACQUISITION_SOURCES</code> and changed
        the header link to <code>/checkout?source=nav</code>, matching the established
        per-CTA-token pattern exactly.
      </p>
      <p>
        <code>public-route-durable-write-capture-error-sweep</code>: with every{" "}
        <code>db.ts</code> read/write and both webhook handlers wired, the next unwired gap was
        two public-facing routes whose own durable-write catch never called{" "}
        <code>captureError</code> at all — a different axis from the db-layer sweeps above, since
        these two calls are already wrapped in a route-level <code>try/catch</code> that only ever{" "}
        <code>console.error</code>&apos;d.{" "}
        <code>src/app/api/unsubscribe/route.ts</code>&apos;s shared{" "}
        <code>verifyAndSuppress</code> helper (both the browser GET link and the RFC 8058 POST
        one-click endpoint route through it) catches a thrown <code>suppressEmail</code> failure
        and already fails closed with a 500, but never reported it — a lost CAN-SPAM/complaint
        suppression write is silently invisible beyond raw platform logs, the same
        sender-reputation-protection blind spot the Resend webhook fix above already closed for
        the inbound side. <code>src/app/api/contact/[slug]/route.ts</code>&apos;s{" "}
        <code>insertClientInquiry</code> catch is the Starter sold contact-form CRM persist write
        — a failure here means a visitor&apos;s message is dropped from the business&apos;s inbox
        with no operator signal at all (the route already refuses to claim success without a
        durable row via <code>contactPersistOutcome</code>, but that guard alone doesn&apos;t
        surface why persistence keeps failing). Wired <code>captureError</code> into both catches
        (<code>component: &quot;unsubscribe&quot;</code> /{" "}
        <code>component: &quot;contact-form&quot;</code>, each with its own{" "}
        <code>failureKind</code>), same one-line pattern as every prior entry in this series.
      </p>
      <p>
        <code>billing-portal-capture-error-wiring</code>: closed the last uninstrumented
        live-external-API-call failure surface — <code>createBillingPortalForCheckoutSession</code>{" "}
        (<code>src/lib/billing/create-portal-session.ts</code>), the self-serve &quot;Manage
        billing&quot; flow customers use from <code>/checkout/success</code> and operators use from
        the dashboard, had two distinct Stripe-call catches (line-item verification, portal-session
        creation) that returned a 502/error result but never called <code>captureError</code> —
        unlike every other Stripe-touching surface swept earlier today. A Stripe outage, a
        Price/env misconfiguration, or a systematic eligibility bug would silently break every
        subscription cancel/update-card click with zero operator-visible signal. Wired{" "}
        <code>captureError</code> into both catches (<code>component: &quot;billing-portal&quot;</code>
        , <code>failureKind: &quot;line_items_verify&quot;</code> /{" "}
        <code>&quot;session_create&quot;</code>), mirroring the checkout routes&apos; exact pattern.
        Left each dashboard action&apos;s own outer safety-net catch untouched, consistent with
        every prior entry in this sweep — <code>createBillingPortalForLead</code> and{" "}
        <code>createBillingPortalForCheckoutSession</code> already handle every real failure
        internally via a result object, so that outer catch is unreachable except for a genuine
        programming error.
      </p>

      <p>
        <code>stripe-checkout-recurring-upgrade-dedup</code>: a research agent auditing the
        Growth→Complete upsell feature traced its checkout link (
        <code>buildGrowthUpsellCheckoutPath</code>, <code>/checkout?slug=...&amp;tier=complete</code>)
        through to <code>POST /api/stripe/checkout</code> and found it always creates the Stripe
        Checkout Session with only <code>customer_email</code>, never an existing{" "}
        <code>customer</code> id. For an already-subscribed lead, Stripe mints a brand-new Customer
        and Subscription rather than reusing the existing one — an upgrading Growth customer ended
        up with two live subscriptions ($99 + $199/mo) under two different Stripe Customer records,
        with nothing anywhere in the codebase ever canceling the superseded one. The business has
        not yet run bootstrap-prices (<code>stripe-price-objects</code> is still{" "}
        <code>todo</code>), so no real customer had actually been double-billed by this — caught
        during the pre-launch autonomous dev routine rather than after real money was flowing.
        Fixed in two parts: <code>src/app/api/stripe/checkout/route.ts</code> now reuses the lead&apos;s
        existing live-recurring-order Stripe Customer id (
        <code>existingRecurringStripeCustomerId</code>, <code>src/lib/orders/recurring.ts</code>)
        instead of <code>customer_email</code> when one exists — a first-time subscriber has no
        prior orders, so this resolves to <code>null</code> and behaves exactly as before. The
        webhook route then detects and cancels any OTHER still-active recurring order&apos;s Stripe
        subscription for the same lead (<code>otherLiveRecurringStripeCustomerIdsToSupersede</code>)
        after a recurring order is recorded, best-effort, so a customer is never billed twice even
        if two sessions race or a pre-fix session is still in flight.
      </p>
      <p>
        Merging this in alongside a concurrently-shipped sibling PR (a customer-facing win-back
        notice on genuine <code>customer.subscription.deleted</code> events) surfaced a real
        interaction: canceling the superseded subscription via the live Stripe API fires a genuine
        <code>customer.subscription.deleted</code> event, which the sibling&apos;s new handler would
        otherwise treat as real churn and send a &quot;sorry to see you go&quot; win-back email to a
        customer who just upgraded, not canceled. Fixed by stamping a distinguishing{" "}
        <code>cancellation_details.comment</code> (
        <code>SUPERSEDED_SUBSCRIPTION_CANCELLATION_COMMENT</code>) when canceling a superseded
        subscription, and checking for it (
        <code>stripeSubscriptionCancellationWasInternalSupersede</code>) before sending the win-back
        notice — only that email is skipped; the CRM cancel-marking and stale-notice-marker-clear
        logic still run as before (idempotent either way, since the bundle-order handler already
        marked the order <code>recurringCanceledAt</code> synchronously moments earlier).
      </p>
      <p>
        <code>recurring-upgrade-dedup-past-due-customer-reuse-gap</code>: a research agent auditing
        the dedup fix above for the same bug family elsewhere in the codebase found a real residual
        gap in its own logic. <code>existingRecurringStripeCustomerId</code> and{" "}
        <code>otherLiveRecurringStripeCustomerIdsToSupersede</code> both gated on{" "}
        <code>orderHasActiveRecurringEntitlement</code>, which requires{" "}
        <code>recurringCanceledAt</code> to be unset — but that field is set by BOTH a terminal{" "}
        <code>customer.subscription.deleted</code> AND a temporary past_due/unpaid/pause_collection
        pause, where the underlying Stripe Subscription is still very much alive mid-dunning. A
        customer whose old subscription happened to be past_due at upgrade time would not have that
        Customer reused by the checkout route, and the webhook&apos;s own supersede-cancel would
        neither find it (recurringCanceledAt already set) nor have canceled it even if it had (the{" "}
        <code>subscriptions.list</code> call filtered on <code>status: &quot;active&quot;</code>,
        which excludes past_due). If dunning later recovered the old subscription, it would resume
        billing alongside the new one — reproducing the exact double-billing bug the fix above was
        meant to eliminate, just via a payment-failure timing window instead of same-day
        double-checkout. Fixed by switching both predicates to{" "}
        <code>orderHadRecurringEntitlement</code> (ignores <code>recurringCanceledAt</code>{" "}
        entirely — the same established pattern this file already uses for{" "}
        <code>orderEligibleForPauseNotice</code>, for the identical reason) and dropping the{" "}
        <code>status: &quot;active&quot;</code> filter on the Stripe <code>subscriptions.list</code>{" "}
        call (Stripe&apos;s own default already excludes only <code>status=canceled</code>). Reusing
        an old Customer, or calling Stripe for one whose Subscription is already fully canceled, is
        harmless either way — <code>subscriptions.list</code> simply returns nothing to cancel.
      </p>
      <p>
        <code>stripe-checkout-recurring-upgrade-dedup-shared-customer-fix</code>: a research agent
        found the dedup fix above never actually fired in the exact case it was built for. Its own{" "}
        <code>otherLiveRecurringStripeCustomerIdsToSupersede</code> excluded any prior order sharing
        the new session&apos;s Stripe Customer id, on the theory that a shared Customer id meant a
        Billing Portal resync rather than a second subscription stacked on top. But{" "}
        <code>existingRecurringStripeCustomerId</code> (the checkout route) makes the new,
        subscription-mode Checkout Session reuse the lead&apos;s existing Customer id whenever one
        exists — i.e. in precisely the Growth→Complete upgrade scenario this feature targets — and
        Stripe does not cancel or replace an existing Subscription just because a new Checkout
        Session names that same Customer; it mints a second, independent Subscription under it. So
        on the primary, intended upgrade path the old exclusion always matched (old and new order
        now share one Customer id) and the supersede logic silently found nothing to cancel — the
        exact double-billing bug the feature exists to prevent, still reachable on its very first
        real use. Every existing test for this logic used two distinct Customer ids for the old and
        new orders, a shape that can only arise from a stale pre-fix order or a genuine race, never
        from the now-standard reuse path — which is why this fell through undetected.
      </p>
      <p>
        Fixed by no longer keying supersede detection on Customer-id equality at all. Renamed{" "}
        <code>otherLiveRecurringOrdersToSupersede</code> (src/lib/orders/recurring.ts) now returns
        every other recurring order (stripeSessionId + stripeCustomerId), regardless of whether it
        shares the new Customer id. The webhook (src/app/api/stripe/webhook/route.ts) groups those
        by Customer id for the Stripe <code>subscriptions.list</code> call as before, but now tells
        the old Subscription apart from the brand-new one by Subscription id — the just-completed
        Checkout Session&apos;s own <code>session.subscription</code> (present without expand in
        subscription mode) — never canceling whichever active Subscription matches it. If a shared
        Customer&apos;s superseded order is found but <code>session.subscription</code> is
        unexpectedly missing, the fix skips cancellation entirely for that Customer (surfaced via{" "}
        <code>captureError</code>) rather than risk a blind cancel-all wiping out the Subscription
        the customer just paid for. CRM cancellation-marking changed to match: a new{" "}
        <code>markOrderRecurringCanceledBySessionId</code> (Convex <code>markRecurringCanceledBySessionId</code>{" "}
        + SQLite, mirroring <code>markOrderRefunded</code>&apos;s per-session-id shape) marks only
        the specific superseded order, since the pre-existing{" "}
        <code>markOrdersRecurringCanceledByCustomer</code> patches every order row for a Customer id
        — which, once old and new orders share that id, would have also marked the brand-new order
        recurring-canceled the instant it was created.
      </p>
      <p>
        <code>operator-digest-cron-secret-env-banner</code>: a research agent auditing the
        freshly-shipped Vercel Cron daily-digest automation found that{" "}
        <code>OperatorDigestEmailEnvBanner</code>, the only existing digest readiness signal, never
        checks <code>CRON_SECRET</code>. The manual <strong>Send daily digest</strong> button still
        works fine with only <code>OPERATOR_DIGEST_EMAIL</code> set, but the cron route&apos;s own
        gate has zero dashboard visibility if missing or later unset — the one mechanism built to
        remove reliance on the operator remembering to click a button could be silently dead, with
        nothing on <code>/dashboard</code> or <code>/dashboard/leads</code> showing it (only a
        failing cron run in Vercel&apos;s own dashboard, a surface a single-operator user has no
        routine reason to check). Added a separate <code>assessOperatorDigestCronEnvReadiness</code>{" "}
        + <code>OperatorDigestCronEnvBanner</code> — deliberately its own readiness check and
        banner, not folded into the email one, since the two failure modes are not equivalent (a
        missing <code>CRON_SECRET</code> does not block the manual button) and need independent
        wording and independent hide conditions. Verified via a dev-server smoke check that the
        banner renders on both dashboard pages with <code>CRON_SECRET</code> unset and correctly
        hides once it&apos;s set.
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
