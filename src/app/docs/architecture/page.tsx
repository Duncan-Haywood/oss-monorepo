import { DocLink, DocPage } from "@/components/docs/doc-page";
import { brand } from "@/lib/brand";

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
        compliance. Optional <code>hours</code> cells use the same{" "}
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
        cannot see. Action-level Vitest in <code>add-lead-action.test.ts</code> locks that Add
        lead glue (auth, slug/businessName gates, sanitize, field-length soft-caps / hard-reject,
        existing-slug conflict, requireConvex fail-closed, outreach_sent mark-before-Resend) and{" "}
        <code>import-leads-csv-action.test.ts</code> locks bulk Import CSV (auth, empty /
        invalid CSV, per-row requireConvex, existing-slug skip, partial Convex failure) beside
        upsert-persist helpers. Dashboard
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
        the secret or a pasted login field cannot lock the operator out —{" "}
        <code>src/proxy.ts</code> dashboardAuthGate also verifies via exported{" "}
        <code>getPassword()</code> (never raw <code>process.env</code>) so a secret-manager
        paste cannot accept login then infinite-redirect at the Host gate — and{" "}
        <code>proxy.test.ts</code> Host gate + trim-parity cases. Until the password is a
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
        <code>next()</code> (no demo-catalog fallthrough), and never Host-diverting{" "}
        <code>/api/*</code> or <code>/dashboard/*</code> — helper suites alone are not enough.
        Google Places API and other licensed sources remain future work after legal review. No UI
        scraping.
      </p>
      <p>
        <code>src/lib/db.ts</code> imports <code>&quot;server-only&quot;</code>, so it cannot be
        imported directly by Vitest (mirrors the <code>stripe-sync.ts</code> testability pattern:
        every existing test mocks <code>@/lib/db</code> wholesale rather than exercising its real
        Convex/SQLite fallback). Every SQLite row-mapping/JSON-parsing helper in <code>db.ts</code>{" "}
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
        backends). <code>checkoutSessions.listOpen</code> sorts the app{" "}
        <code>createdAt</code> ascending (abandoned-recovery works oldest carts first) and{" "}
        <code>inquiries.listBySlug</code> sorts the app <code>createdAt</code> descending before
        slicing to <code>limit</code> — both because their <code>by_status</code>/
        <code>by_leadSlug</code> indexes have no <code>createdAt</code> sort field, so a raw{" "}
        <code>.order()</code> would sort by <code>_creationTime</code> instead of the app column.
      </p>
      <p>
        See <DocLink href="/docs/compliance">Compliance</DocLink>.
      </p>

      <h2>2. Site generation</h2>
      <p>
        Category templates (restaurant, salon, trades, generic) render at{" "}
        <code>/preview/[slug]</code> from the lead catalog (
        <code>src/lib/leads</code>). Demo slugs: <code>example-bakery</code>,{" "}
        <code>serene-salon</code>, <code>mountain-plumbing</code>.{" "}
        <code>resolvePreviewLead</code> (slug keyword → category + recommended tier) and the
        demo catalog have direct Vitest coverage in{" "}
        <code>src/lib/leads/demo-catalog.test.ts</code>. Per-category shell / accent / CTA
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
        AI-generated demo under our domain without consent. Both surfaces share one predicate —{" "}
        <code>isLeadPreviewIndexable</code> (<code>src/lib/seo.ts</code>) keyed on{" "}
        <code>isCuratedDemoLeadSlug</code> (<code>src/lib/leads/demo-catalog.ts</code>) — so the
        sitemap and the page-level robots directive cannot drift. <code>/robots.txt</code> allows
        crawling except <code>/dashboard</code> and <code>/api</code>. Canonical origin comes from{" "}
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
        unless every handoff gets Assign project. Until{" "}
        <code>NEXT_PUBLIC_CONVEX_URL</code> is a non-placeholder deployment URL, the same
        dashboards show a pink multi-instance persistence banner via{" "}
        <code>assessConvexUrlEnvReadiness</code> (
        <code>src/lib/convex/convex-url-env-readiness.ts</code>) — missing / whitespace /
        example.convex.cloud|changeme placeholders are flagged;{" "}
        <code>resolveConvexDeploymentUrl</code> also gates <code>src/lib/db.ts</code> client
        init so whitespace-only cannot construct <code>ConvexHttpClient</code>. Local
        single-process SQLite remains fine for solo demos. <code>siteUrl()</code>&apos;s precedence (
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
        <code>GET /api/unsubscribe</code> writes to it. Post-payment transactional sends —{" "}
        <code>sendReceiptEmail</code>, the bundle DNS go-live <code>sendEmail</code> in the Stripe
        webhook, and <code>sendCommerceBuyNowClientReceipt</code> — pass{" "}
        <code>skipSuppression: true</code> so a cold-outreach unsubscribe cannot block receipt /
        DNS instructions / Commerce order notification after money is taken (marker-only gating
        left Stripe redelivering forever against the same suppress). Starter sold contact-form
        CRM also skips: <code>POST /api/contact/[slug]</code> inquiry notify to{" "}
        <code>lead.email</code>, and operator <code>sendInquiryReply</code> to the visitor —
        persist-then-notify must not mark an inquiry replied while marketing suppression
        permanently blocks the visitor reply. Sold Growth/Complete pack delivery on{" "}
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
        same per-instance fixed-window helper as contact / checkout / preview-open){" "}
        <em>before</em> token verify, returning <code>429</code> + <code>Retry-After</code> on
        exceed so a harvested footer link or a script hammering HMAC +{" "}
        <code>suppressEmail</code> cannot unboundedly mutate the global suppression list. The
        route also hard-rejects <code>email</code> query params longer than{" "}
        <code>MAX_CONTACT_EMAIL_LENGTH</code> before HMAC verify — rate limits blunt request
        count, not per-request payload / crypto work / suppressions-row size; soft-cap would
        break signed footer tokens (truncation ≠ the address the token was minted for). The
        suppression
        list (SQLite + Convex <code>suppressions</code>) follows the same Convex-first,
        SQLite-fallback pattern as every other table for operator reads — but the public
        unsubscribe route passes <code>requireConvex</code> (
        <code>UNSUBSCRIBE_CONVEX_PRIMARY</code>) when Convex is configured so a mutation failure
        returns <code>500</code> instead of claiming success after a SQLite-only write that other
        instances&apos; <code>isEmailSuppressed</code> (Convex-first) would never see. Every
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
        handoff (DNS + contact form). The <code>orders</code> insert is idempotent on{" "}
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
        marker-write failures return <code>500</code> so Stripe retries. If required fulfillment
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
        other instances cannot see. Route-level Vitest in{" "}
        <code>src/app/api/contact/[slug]/route.test.ts</code> locks contact-form orchestration
        (<code>CONTACT_FORM_CONVEX_PRIMARY</code> pass-through, persist-required 503, notify only
        after a durable inquiry row, <code>notifySent</code> from inspecting{" "}
        <code>sendEmail</code>&apos;s <code>{"{ success }"}</code> shape — not just the throw path —
        validation, soft-capped visitor fields via{" "}
        <code>normalizeContactFormFields</code> / <code>MAX_CONTACT_*</code> so the sold notify
        HTML cannot exceed the CRM row bounds, and{" "}
        <strong>known-lead gate</strong>: CRM <code>getLeadBySlug</code> or curated{" "}
        <code>DEMO_LEADS</code> before persist/notify — inventable/slug-inferred tokens return{" "}
        <code>404 unknown_lead</code> so skipSuppression cannot spam{" "}
        <code>brand.supportEmail</code>; path slug length hard-rejects over{" "}
        <code>MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH</code> (120, shared with preview-open via{" "}
        <code>isPublicLeadSlugPathLengthOk</code>) before CRM/demo lookup — charset-only
        validation is not a size bound) beyond{" "}
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
        window; fixed so both paths share the same gate. Route-level Vitest in{" "}
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
        tracking — rate limits blunt request count, not payload size. Mark-complete on the
        webhook already used the same fail-closed policy. Homepage /
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
        Growth/Complete/Commerce subscribers manage cards, invoices, and cancellation via Stripe
        Billing Portal: <code>POST /api/stripe/billing-portal</code> (post-checkout{" "}
        <code>sessionId</code>) and the operator <strong>Billing</strong> action on paid/live
        leads. Orders store <code>stripeCustomerId</code> when the webhook records payment;
        older orders fall back to retrieving the Checkout Session.{" "}
        <code>listOrders</code> returns newest-first on both backends (
        <code>convex/orders.list</code> sorts by <code>createdAt</code> desc at the source,
        plus <code>sortOrdersNewestFirst</code> in <code>db.ts</code> as belt-and-suspenders)
        so <code>latestEligibleOrder</code> opens Manage subscription against the newest eligible
        row. When checkout completes for a slug with no CRM lead yet,{" "}
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
        an opaque id would only waste a retrieve on a guaranteed miss. Because a completed{" "}
        <code>sessionId</code> is not truly
        secret either (it leaks via redirect URLs, the <code>Referer</code> header, and browser
        history), an explicit body <code>returnUrl</code> is only honored when its origin matches
        the derived <code>appUrl</code> (<code>isSameOriginReturnUrl</code>) — otherwise the route
        falls back to the derived default rather than handing Stripe an attacker-controlled{" "}
        <code>return_url</code>, which would otherwise let a genuine{" "}
        <code>billing.stripe.com</code> URL redirect to a phishing page on exit. That comparison
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
        Paid Starter customers (one-time $500, no Growth/Complete/Commerce order yet) get an
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
        resolve, not only throws) — locked by{" "}
        <code>update-lead-stage-action.test.ts</code> (auth, unknown-slug not-found before
        any write, requireConvex fail-closed, non-outreach revalidate, mark-before-Resend,
        missing-email skip, outreach-mark Convex skip-send, suppression/Resend{" "}
        <code>success:false</code>) so stage glue is not left to stage-persist helpers alone.
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
        page that would invent false Generate debt or hide Sync-to-Stripe debt). A lead that
        exhausts all 3 outreach
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

      <h2>7. Marketing engine (Growth + Complete)</h2>
      <p>
        Monthly packs: <code>src/lib/marketing/</code> builds an 8-post + 2-email pack via{" "}
        <code>StubMarketingGenerator</code> or <code>AnthropicMarketingGenerator</code> when{" "}
        <code>ANTHROPIC_API_KEY</code> is set (direct Vitest coverage in{" "}
        <code>generators.test.ts</code> for stub edge branches + Anthropic blank-key / HTTP /
        parse / length-mismatch fallbacks and <code>packageTier</code>;{" "}
        <code>build-request.test.ts</code> for empty services/hours defaults and growth vs
        complete <code>automationLevel</code>). Until the key is a non-placeholder secret,{" "}
        <code>assessAnthropicEnvReadiness</code> surfaces a teal dashboard banner so operators
        cannot mistake Stub* template packs for sold AI quality. Operators trigger{" "}
        <code>generateMarketingPackAction</code> on{" "}
        <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> for paid/live leads with a
        Growth/Complete order; packs persist one row per lead per UTC month (SQLite + Convex{" "}
        <code>marketingPacks</code>). Ad-hoc operator generation remains available at{" "}
        <code>POST /api/marketing/generate</code> (auth + client-IP rate-limit + validation +
        contentTypes ≤ monthly pack ceiling + soft-capped business context + stub-vs-LLM
        messaging covered by{" "}
        <code>src/app/api/marketing/generate/route.test.ts</code>) — prefer the
        dashboard pack action for persisted fulfillment. Action-level Vitest in{" "}
        <code>src/app/dashboard/leads/generate-marketing-pack-action.test.ts</code> locks auth,
        eligibility, <code>MARKETING_PACK_CONVEX_PRIMARY</code> persist, stub-vs-anthropic labeling,
        and <code>ConvexPrimaryWriteError</code> fail-closed — generators / monthly-pack / route
        suites alone do not cover that glue. When Convex is configured, Generate pack passes{" "}
        <code>requireConvex</code> (<code>MARKETING_PACK_CONVEX_PRIMARY</code>) so a mutation
        failure surfaces a retry instead of leaving packs-due / Email pack blind on other
        instances. <code>sendMarketingPackToClientAction</code> emails the
        pack to <code>lead.email</code> via Resend (<code>src/lib/marketing/deliver-pack.ts</code>
        ) so clients can post themselves — <code>sendMarketingPackToClientEmail</code> passes{" "}
        <code>skipSuppression: true</code> (paid Growth/Complete feature delivery, not cold
        marketing). Action-level Vitest in{" "}
        <code>src/app/dashboard/leads/send-marketing-pack-to-client-action.test.ts</code> locks
        auth, eligibility, current-month pack gate, send failure, and preview URL wiring
        (deliver-pack helpers alone do not cover that glue). Buffer / GBP / Meta OAuth
        auto-posting remains optional. See{" "}
        <DocLink href="/docs/marketing-automation">Marketing automation</DocLink> and{" "}
        <DocLink href="/docs/process">process log</DocLink>.
      </p>

      <h2>8. Client AI phone (Complete)</h2>
      <p>
        FAQ/script packs: <code>src/lib/voice/</code> builds a 6-script receptionist pack via{" "}
        <code>StubClientVoiceGenerator</code> or <code>AnthropicClientVoiceGenerator</code> when{" "}
        <code>ANTHROPIC_API_KEY</code> is set (direct Vitest coverage in{" "}
        <code>src/lib/voice/generators.test.ts</code> for stub edge branches + Anthropic blank-key /
        HTTP / parse / length-mismatch fallbacks and title fallback). Lead→request shaping (
        <code>clientVoiceBusinessContextFromLead</code> /{" "}
        <code>clientVoicePackRequestForLead</code>) has direct edge coverage in{" "}
        <code>src/lib/voice/build-request.test.ts</code> (empty services →{" "}
        <code>our services</code>, hours/state omission). Eligibility: paid/live + Complete order;
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
        <code>commerceCatalogsUnsyncedCount</code> / digest Sync to Stripe due). Stripe Products
        sync shipped: <code>syncCommerceCatalogToStripeAction</code> (dashboard &quot;Sync to
        Stripe&quot; button) calls <code>syncCommerceCatalogToStripe</code> (
        <code>src/lib/commerce/stripe-sync.ts</code>) to idempotently create/find a Stripe
        Product + Price per SKU (keyed by <code>commerce_sku_&#123;leadSlug&#125;_&#123;skuId&#125;</code>{" "}
        metadata, reuses <code>STRIPE_SECRET_KEY</code> — no new secrets; product/price list
        lookups paginate via shared <code>listAllPages</code> in{" "}
        <code>src/lib/stripe/list-all-pages.ts</code> with direct unit coverage) — action-level
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
        <code>MAX_LEAD_SLUG_LENGTH</code> (63) and the catalog-save SKU id ceiling (64)
        via <code>parseCommerceCheckoutSlug</code> / <code>parseCommerceCheckoutSkuId</code>{" "}
        before any DB or Stripe work — soft-cap would look up the wrong row. Route-level Vitest
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
        Sessions missing <code>metadata.skuId</code> skip
        ledger and side effects entirely (warn + break) — the alreadyRecorded gate cannot run
        without a SKU. Pipeline health surfaces the
        total as <code>commerceOrdersRevenueUsd</code> (&quot;Commerce sales (pass-through)&quot;)
        — unpaid/owed only (rows with <code>paidOutAt</code> are excluded, matching the payout
        panel + digest). This money sits in the platform&apos;s own Stripe account with no automated payout path to
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
        owed twice. Pipeline-health and daily-digest tests guard against a future re-wire to a
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
        lead has no email or when the session was already ledgered.
      </p>

      <h2>Tech stack</h2>
      <ul>
        <li>Next.js 16 + TypeScript + Tailwind v4</li>
        <li>Vercel hosting, Stripe Checkout</li>
        <li>Vapi/Retell (platform + client voice)</li>
        <li>Resend (email), Buffer (scheduling MVP)</li>
        <li>Database: Convex (chosen) — demo leads in TypeScript until wired</li>
      </ul>
    </DocPage>
  );
}
