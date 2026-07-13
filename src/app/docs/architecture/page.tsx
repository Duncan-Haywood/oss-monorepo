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
        compliance. Re-imports and manual add-lead treat slug collisions as create-path conflicts:
        existing leads are skipped (CSV) or rejected (add form) so pipeline fields
        (stage / outreach / notes / snooze) are never silently reset via{" "}
        <code>upsertLead</code>. When <code>OPERATOR_DASHBOARD_PASSWORD</code> is set,{" "}
        <code>src/proxy.ts</code> gates <code>/dashboard/*</code> and lead mutation server actions
        require a signed session cookie. <code>src/proxy.ts</code> also rewrites the root path to a
        lead&apos;s <code>/preview/[slug]</code> when the request Host matches a client&apos;s own
        domain saved via <strong>Save domain</strong> on <code>/dashboard/leads</code> (Starter
        &ldquo;Preview subdomain → custom domain handoff&rdquo; promise) — see{" "}
        <DocLink href="/docs/production-deploy">Production deploy</DocLink>. Google Places API and
        other licensed sources remain future work after legal review. No UI scraping.
      </p>
      <p>
        See <DocLink href="/docs/compliance">Compliance</DocLink>.
      </p>

      <h2>2. Site generation</h2>
      <p>
        Category templates (restaurant, salon, trades, generic) render at{" "}
        <code>/preview/[slug]</code> from the lead catalog (
        <code>src/lib/leads</code>). Demo slugs: <code>example-bakery</code>,{" "}
        <code>serene-salon</code>, <code>mountain-plumbing</code>. Tier upsell cards link to
        checkout with <code>slug</code> + recommended <code>tier</code>.
      </p>

      <h2 id="seo">2b. SEO &amp; discoverability</h2>
      <p>
        Starter sells &ldquo;Basic SEO&rdquo; (see landing page copy) — <code>/preview/[slug]</code>{" "}
        renders per-lead <code>generateMetadata</code> (title, description, canonical URL, Open
        Graph/Twitter tags) plus a schema.org <code>LocalBusiness</code> JSON-LD block (subtype by
        category: Restaurant, HairSalon, HomeAndConstructionBusiness). <code>/sitemap.xml</code>{" "}
        lists marketing pages and every known lead slug (demo catalog + persisted leads);{" "}
        <code>/robots.txt</code> allows crawling except <code>/dashboard</code> and{" "}
        <code>/api</code>. Canonical origin comes from <code>NEXT_PUBLIC_APP_URL</code> (see{" "}
        <code>src/lib/seo.ts</code>) — set it in production so canonical/OG URLs and the sitemap
        don&apos;t point at localhost.
      </p>

      <h2 id="preview-hosting">3. Preview hosting</h2>
      <p>
        Primary app on Vercel. Previews at <code>{"{slug}"}.preview.domain.com</code> via wildcard DNS.
      </p>

      <h2>4. Outreach (automated)</h2>
      <p>Email primary; optional outbound voice; inbound callback routes to platform voice agent.</p>
      <p>
        Every automated send (outreach Email 1-3, daily digest, marketing/voice pack email,
        Starter upsell, abandoned-checkout recovery) calls <code>sendEmail</code> (
        <code>src/lib/email/resend.ts</code>), which checks the CAN-SPAM unsubscribe suppression
        list before sending and <code>GET /api/unsubscribe</code> writes to it. The suppression
        list (SQLite + Convex <code>suppressions</code>) follows the same Convex-first,
        SQLite-fallback pattern as every other table for operator reads — but the public
        unsubscribe route passes <code>requireConvex</code> (
        <code>UNSUBSCRIBE_CONVEX_PRIMARY</code>) when Convex is configured so a mutation failure
        returns <code>500</code> instead of claiming success after a SQLite-only write that other
        instances&apos; <code>isEmailSuppressed</code> (Convex-first) would never see.
      </p>

      <h2>5. Platform voice agent</h2>
      <p>Vapi/Retell → <code>/api/voice/platform/webhook</code> → site config updater + Stripe checkout link.</p>

      <h2 id="payments">6. Payments (self-serve)</h2>
      <p>
        <code>POST /api/stripe/checkout</code> creates a real Stripe Checkout Session (501 only
        when Price IDs / secret key are missing).{" "}
        <code>POST /api/stripe/webhook</code> verifies signatures, marks the lead paid, records the
        order, sends a receipt email when Resend is configured, and enqueues a production deploy
        handoff (DNS + contact form). The <code>orders</code> insert is idempotent on{" "}
        <code>stripeSessionId</code> (UNIQUE index in SQLite, existing-row check in Convex) — a
        redelivered <code>checkout.session.completed</code> (Stripe retries on timeout) is detected
        and the receipt/DNS emails are skipped rather than resent — but{" "}
        <code>enqueueProductionHandoff</code> still runs on every delivery (idempotent on slug +
        stripeSessionId) so a first-delivery crash after the order insert cannot permanently skip
        Phase 5 fulfillment. If required fulfillment writes fail (
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
        other instances cannot see. Matches the same idempotency
        guarantee already required for{" "}
        <code>checkout_sessions</code> and <code>commerce_orders</code>. Operator bootstrap:{" "}
        <code>POST /api/stripe/bootstrap-prices</code> with <code>ALLOW_STRIPE_BOOTSTRAP=1</code>{" "}
        creates Products/Prices and returns env var snippets. Remaining for first paid order: run
        bootstrap (or Dashboard) so Price ID env vars are set. Deploy details:{" "}
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
        Mark-complete on the webhook already used the same fail-closed policy. Homepage /
        pricing CTAs that omit a lead slug mint a stable{" "}
        <code>organic-*</code> attribution slug at session create (
        <code>resolveBundleCheckoutLeadSlug</code>) so webhook fulfillment, payment stubs, and
        deploy handoffs still run after Stripe collects money — empty{" "}
        <code>metadata.slug</code> previously skipped the entire paid path. Rows carry a{" "}
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
        Convex-first due queues able to nudge again. Only <code>kind=bundle</code> open sessions feed <code>scoreLead</code> / Work next (+18
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
        <code>sortOrdersNewestFirst</code> on the Convex path) so{" "}
        <code>latestEligibleOrder</code> opens Manage subscription against the newest eligible
        row. When checkout completes for a slug with no CRM lead yet,{" "}
        <code>recordLeadPayment</code> / Convex <code>markLeadPaid</code> insert a paid{" "}
        <code>payment_stub</code> lead (<code>buildPaymentStubLeadFields</code>) so revenue and
        paid-not-live stay aligned. Activate Customer Portal in the Stripe Dashboard before first
        live use (see <DocLink href="/docs/launch-checklist">Launch checklist</DocLink>).
      </p>
      <p>
        Paid Starter customers (one-time $500, no Growth/Complete/Commerce order yet) get an
        operator-triggered <strong>Upsell</strong> email from{" "}
        <code>/dashboard/leads</code> — eligibility is the inverse of billing-portal eligibility
        (<code>src/lib/billing/starter-upsell.ts</code>). The email previews the marketing add-on
        and links to <code>/checkout?slug=…&amp;tier=growth|complete</code> (Complete when the
        lead&apos;s <code>recommendedTier</code> is Complete; otherwise Growth). Billing and
        Upsell never both appear for the same order set.
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
        that other instances (reading Convex-first) would never see. Suggested host{" "}
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
        <code>live</code> → <code>provisioned</code>.
        Operators confirm DNS then mark the lead <code>live</code>. Inquiry inbox on{" "}
        <code>/dashboard/leads</code> supports operator reply (Resend + suppression → status{" "}
        <code>replied</code> with stored body). When Convex is configured, reply + status
        marks pass <code>requireConvex</code> (<code>INQUIRY_REPLY_CONVEX_PRIMARY</code>) and
        Reply durably marks <code>replied</code> before Resend (persist-then-notify) so
        unreplied metrics on other instances cannot miss a successful reply or risk a
        duplicate send. Opening the reply composer on a{" "}
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
        leads missing email (<code>src/lib/metrics/pipeline-health.ts</code>). Lead quality scoring (
        <code>src/lib/leads/quality-score.ts</code>) ranks outreach targets on the same page
        (Work next queue + Quality column). Preview opens record{" "}
        <code>lastPreviewOpenAt</code> via <code>POST /api/preview/[slug]/open</code> when
        outreach emails use <code>?src=outreach</code> (or the lead is already in outreach /
        discovery stages). When Convex is configured that beacon passes{" "}
        <code>requireConvex</code> (<code>PREVIEW_OPEN_CONVEX_PRIMARY</code>) so a mutation
        failure returns <code>503</code> instead of claiming <code>recorded:true</code> after a
        SQLite-only write that Convex-first Work next / Opened-badge readers never see.
        Operator free-text <code>notes</code> on each lead capture call
        outcomes from the dashboard row expander (not shown on client preview sites). Moving a
        lead to <code>discovery_call</code> or sending Email 3 auto-opens that expander with a
        soft prompt (Skip dismisses without undoing the stage/email change). Optional{" "}
        <code>snoozedUntil</code> parks a lead off Work next (1d/3d/7d presets) while keeping
        the quality score visible — Unsnooze clears it; parked count also appears on pipeline
        health and as a footnote on the operator daily digest (count + soonest return) so
        forgotten snoozes do not hide when the operator never opens the dashboard. The same
        digest also lists marketing packs due this UTC month, Starter → MRR upsell candidates,
        Commerce catalogs missing, and Complete voice packs due (action sections, reusing{" "}
        <code>listMarketingPacksDue</code> / <code>listStarterUpsellCandidates</code> /{" "}
        <code>listCommerceCatalogsMissing</code> / <code>listClientVoicePacksDue</code>). A lead that
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
      </p>

      <h2>7. Marketing engine (Growth + Complete)</h2>
      <p>
        Monthly packs: <code>src/lib/marketing/</code> builds an 8-post + 2-email pack via{" "}
        <code>StubMarketingGenerator</code> or <code>AnthropicMarketingGenerator</code> when{" "}
        <code>ANTHROPIC_API_KEY</code> is set. Operators trigger{" "}
        <code>generateMarketingPackAction</code> on{" "}
        <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> for paid/live leads with a
        Growth/Complete order; packs persist one row per lead per UTC month (SQLite + Convex{" "}
        <code>marketingPacks</code>). <code>sendMarketingPackToClientAction</code> emails the
        pack to <code>lead.email</code> via Resend (<code>src/lib/marketing/deliver-pack.ts</code>
        ) so clients can post themselves. Buffer / GBP / Meta OAuth auto-posting remains
        optional. See <DocLink href="/docs/marketing-automation">Marketing automation</DocLink>{" "}
        and <DocLink href="/docs/process">process log</DocLink>.
      </p>

      <h2>8. Client AI phone (Complete)</h2>
      <p>
        FAQ/script packs: <code>src/lib/voice/</code> builds a 6-script receptionist pack via{" "}
        <code>StubClientVoiceGenerator</code> or <code>AnthropicClientVoiceGenerator</code> when{" "}
        <code>ANTHROPIC_API_KEY</code> is set. Eligibility: paid/live + Complete order; one row
        per lead (SQLite + Convex <code>clientVoicePacks</code>) — regenerating replaces.{" "}
        <code>sendClientVoicePackToClientAction</code> emails the pack to <code>lead.email</code>{" "}
        via Resend (<code>src/lib/voice/deliver-pack.ts</code>) so clients can paste into a temp
        number / Cal.com. Twilio + <code>/api/voice/client/webhook</code> remain Phase 7. See{" "}
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
        metadata, reuses <code>STRIPE_SECRET_KEY</code> — no new secrets), then persists
        <code>stripeProductId</code>/<code>stripePriceId</code> back onto each item. When Convex
        is configured, Save catalog and Sync to Stripe pass <code>requireConvex</code> (
        <code>COMMERCE_CATALOG_CONVEX_PRIMARY</code>) so a mutation failure surfaces instead of
        SQLite-only success while Buy now / unsynced readers stay Convex-first. Catalog
        saves re-attach those ids from the existing DB row via{" "}
        <code>preserveCommerceStripeIds</code> so an ordinary edit does not wipe Buy now.
        Sync never archives Products for removed SKUs — operators click{" "}
        <strong>Archive orphans</strong> (
        <code>archiveOrphanCommerceStripeProductsAction</code>) to set those Products{" "}
        <code>active=false</code> (never auto-deletes; scoped to the lead&apos;s metadata).{" "}
        <code>/preview/[slug]</code> shows Buy now for synced SKUs — <code>POST /api/commerce/checkout</code>{" "}
        resolves the Stripe Price server-side from the stored catalog (never trusts a
        client-submitted price) and creates a one-time Checkout Session. Unsynced items keep the
        &quot;Request order&quot; → contact form → inquiry inbox stub. A completed Buy now
        Checkout Session also writes a <code>commerceOrders</code> ledger row (
        <code>src/lib/commerce/orders.ts</code>, SQLite + Convex, idempotent on Stripe session id)
        — kept deliberately separate from the <code>orders</code> table used for Local Site
        Studio&apos;s own revenue, since <code>orderEligibleForBillingPortal</code> /{" "}
        <code>leadEligibleForStarterUpsell</code> read any <code>commerceAddon</code> order row as
        &quot;this lead has a recurring Commerce subscription.&quot;{" "}
        <code>insertCommerceOrder</code> returns <code>&#123; alreadyRecorded &#125;</code>. On
        Stripe <code>checkout.session.completed</code> redelivery, missing operator inquiry +{" "}
        <code>sendCommerceBuyNowClientReceipt</code> are recovered when no{" "}
        <code>commerce_checkout</code> inquiry embeds the session id (
        <code>planCommerceWebhookSideEffects</code>); duplicates skip only when that inquiry
        already exists. Inquiry write failures after a durable ledger write return HTTP 500 (
        <code>commerce_order_inquiry</code>) so Stripe redelivers into that recovery path —
        client receipt stays best-effort only after inquiry succeeds. Sessions missing{" "}
        <code>metadata.skuId</code> skip
        ledger and side effects entirely (warn + break) — the alreadyRecorded gate cannot run
        without a SKU. Pipeline health surfaces the
        total as <code>commerceOrdersRevenueUsd</code> (&quot;Commerce sales (pass-through)&quot;)
        — unpaid/owed only (rows with <code>paidOutAt</code> are excluded, matching the payout
        panel + digest). This money sits in the platform&apos;s own Stripe account with no automated payout path to
        the client yet (see <code>commerce-payouts-stripe-connect</code>). Operators reconcile
        manual payouts from the <strong>Commerce payouts (manual)</strong> panel on{" "}
        <DocLink href="/dashboard/leads">/dashboard/leads</DocLink>, which groups{" "}
        <code>listCommerceOrders</code> by lead via <code>summarizeCommerceOrdersByLead</code>{" "}
        (each row keyed by <code>CommerceOrderRecord.id</code> —{" "}
        <code>newCommerceOrderId()</code> generates it once in{" "}
        <code>insertCommerceOrder</code> and passes it to both backends as the Convex
        table&apos;s <code>orderId</code> column, matching the app-owned-id pattern every
        other ledger already used; the Convex path originally had no id column at all,
        so payout rows silently lost React list identity once Convex was configured).
        Each order line has a <strong>Mark paid out</strong> button that sets{" "}
        <code>paidOutAt</code> (SQLite + Convex — the static <code>api.commerceOrders.markPaidOut</code>{" "}
        map entry is required so Convex primary deploys actually persist; when Convex is configured
        the operator action also passes <code>requireConvex</code> via{" "}
        <code>COMMERCE_PAID_OUT_CONVEX_PRIMARY</code> so a mutation failure surfaces instead of
        SQLite-only success while unpaid owed readers stay Convex-first) once the operator has actually sent the client
        their share — paid-out lines drop out of the panel&apos;s owed total, the pipeline-health
        card, and the digest{" "}
        (<code>unpaidTotalUsd</code>/<code>unpaidCount</code>) so the same amount can never look
        owed twice. The same rollup also appears as a <strong>Commerce payouts owed</strong>{" "}
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
