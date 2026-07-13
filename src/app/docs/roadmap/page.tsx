import { DocLink, DocPage } from "@/components/docs/doc-page";
import { brand } from "@/lib/brand";

export default function RoadmapDocPage() {
  return (
    <DocPage
      title="Roadmap"
      subtitle={`Phased plan for ${brand.legalEntity} — digital presence bundles`}
      related={[
        { href: "/docs/product-bundles", label: "Product bundles" },
        { href: "/docs/architecture", label: "Architecture" },
        { href: "/docs/compliance", label: "Compliance" },
      ]}
    >
      <h2>Phased bundle rollout</h2>
      <table>
        <thead>
          <tr>
            <th>Phase</th>
            <th>Delivers</th>
            <th>Tier</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>0</td>
            <td>Scaffold</td>
            <td>—</td>
          </tr>
          <tr>
            <td>1, 3, 5</td>
            <td>Website + Stripe + deploy</td>
            <td>Starter ($500)</td>
          </tr>
          <tr>
            <td>2</td>
            <td>Platform voice sells bundles</td>
            <td>All tiers</td>
          </tr>
          <tr>
            <td>6</td>
            <td>Marketing engine</td>
            <td>Growth ($500 + $99/mo)</td>
          </tr>
          <tr>
            <td>7</td>
            <td>Client AI phone</td>
            <td>Complete ($500 + $199/mo)</td>
          </tr>
          <tr>
            <td>8</td>
            <td>Stripe catalog</td>
            <td>Commerce (+$300 + $49/mo)</td>
          </tr>
        </tbody>
      </table>

      <h2 id="phase-0">Phase 0 — Scaffold (complete)</h2>
      <ul>
        <li>Next.js + dashboard + preview + checkout routes</li>
        <li>TSX documentation at /docs/*</li>
        <li>Two-layer branding ({brand.legalEntity})</li>
        <li>Marketing and voice code scaffolds</li>
      </ul>

      <h2 id="phase-1">Phase 1 — Website foundation</h2>
      <p>
        Category templates + tier cards on preview: shipped (restaurant / salon / trades +
        generic fallback). Convex + SQLite-fallback persistence and manual lead entry: shipped
        (see <DocLink href="/docs/process">process log</DocLink>). Operator auth on{" "}
        <code>/dashboard</code> (shared-secret session via{" "}
        <code>OPERATOR_DASHBOARD_PASSWORD</code>): shipped. Preview contact form + Maps embed
        (Starter promise): shipped. Pipeline health metrics (revenue, stage funnel, open
        handoffs, abandoned carts / recovery due, missing email) on{" "}
        <DocLink href="/dashboard/leads">/dashboard/leads</DocLink>: shipped. Preview subdomain
        hosting (routing): shipped — a lead&apos;s <code>suggestedHost</code> (e.g.{" "}
        <code>joes-plumbing.localsitestudio.com</code>, already generated per deploy handoff) now
        serves that lead&apos;s <code>/preview/[slug]</code> directly once the slug resolves to a
        real lead (see <DocLink href="/docs/process">process log</DocLink>{" "}
        <code>preview-subdomain-routing</code>). Remaining: the one-time wildcard DNS (a single{" "}
        <code>*.localsitestudio.com</code> CNAME to Vercel) and wildcard domain on the Vercel
        project — operator infrastructure, not code.
      </p>

      <h2 id="phase-2">Phase 2 — Outreach + platform voice</h2>
      <p>
        Resend outreach + receipt emails, CAN-SPAM templates, and Convex-first suppression list
        (SQLite fallback for operator reads; public <code>GET /api/unsubscribe</code> uses{" "}
        <code>requireConvex</code> so a multi-instance deploy cannot claim unsubscribe success
        after a SQLite-only write): shipped.
        Email 2/3 follow-ups (operator-triggered, <code>outreachStep</code> /{" "}
        <code>lastOutreachAt</code>, due queue on the leads dashboard): shipped — every Email
        1/2/3 send durably marks the step before calling Resend, and with Convex configured
        that mark uses <code>requireConvex</code> (
        <code>outreach-cadence-persist-then-send</code>) so a mutation failure skips the send
        rather than risking a duplicate on another instance. Lead quality
        scoring (0–100 pure TypeScript scorer + Work next queue on{" "}
        <DocLink href="/dashboard/leads">/dashboard/leads</DocLink>): shipped. Preview open
        tracking (<code>lastPreviewOpenAt</code>, <code>?src=outreach</code> email links;
        public beacon uses <code>requireConvex</code> when Convex is configured so multi-instance
        Work next / Opened badge cannot miss a SQLite-only write): shipped. Operator lead notes
        (free-text call outcomes on{" "}
        <DocLink href="/dashboard/leads">/dashboard/leads</DocLink>, SQLite + Convex; with Convex
        configured, Save uses <code>requireConvex</code> so notes cannot succeed only in
        instance-local SQLite — <code>lead-notes-convex-primary</code>): shipped.
        Soft notes prompt when stage → <code>discovery_call</code> or Email 3 sends (skippable,
        never blocks the mutation): shipped. Work next snooze (<code>snoozedUntil</code>, 1d/3d/7d
        presets — parks a lead off the queue without wiping score history): shipped. Snoozed-lead
        pipeline-health aggregate (count + soonest return, plus a Work next footnote — not a second
        priority panel): shipped. Cold-lead
        detection (leads that exhaust Email 1-3 with no reply, surfaced as a table badge +
        pipeline-health count/oldest-age since the follow-up queue never resurfaces them):
        shipped. Cold-lead archive action (one-click <code>Re-engage</code> resets cadence to{" "}
        <code>discovered</code>; optional Cold-panel checkbox also sends Email 1 immediately via{" "}
        <code>outreach_sent</code>; <code>Close</code> moves to terminal <code>closed</code> stage;
        with Convex configured, the disposition write uses <code>requireConvex</code> —{" "}
        <code>cold-disposition-convex-primary</code>):
        shipped. Follow-ups-due pipeline-health aggregate (<code>followUpsDueCount</code> +
        oldest age since last send via <code>isFollowUpDue</code>, sitting beside unreplied
        inquiries and abandoned carts so Email 2/3 backlog is visible without scanning Due
        badges row-by-row): shipped. Operator daily digest includes currently-snoozed lead
        count + soonest return as a footnote (reuses <code>isLeadSnoozed</code> — not a second
        priority section): shipped. Fixed: <code>isFollowUpDue</code> did not check{" "}
        <code>snoozedUntil</code>, so a snoozed lead past its Email 2/3 cadence gap still
        appeared in the &quot;Follow-ups due&quot; panel (with a live Send button) and counted
        toward <code>followUpsDueCount</code> / the digest section — contradicting the operator&apos;s
        explicit snooze. Cold-lead detection (<code>isColdLead</code>) intentionally keeps
        including snoozed leads, since <code>Re-engage</code>/<code>Close</code> on a snoozed
        cold lead is a valid explicit override that itself clears the snooze. Remaining:
        Vapi/Retell platform voice and bundle explanation tools.
      </p>

      <h2 id="phase-3-payments">Phase 3 — Payments (in progress)</h2>
      <p>
        Checkout API creates real Stripe Checkout Sessions per tier (see{" "}
        <code>src/lib/pricing/bundles.ts</code> and <code>/api/stripe/checkout</code>). Tier
        selection UI live at <DocLink href="/checkout">/checkout</DocLink> — prefills from{" "}
        <code>?slug=</code> (business name / email / recommended tier) and marketing CTAs pass{" "}
        <code>tier</code> / <code>commerce</code>. Homepage checkouts without a lead slug mint a
        stable <code>organic-*</code> attribution slug so webhook fulfillment still creates CRM /
        handoff rows after payment.{" "}
        <code>/api/stripe/webhook</code> verifies signatures, marks leads paid in the database, and
        sends receipt email. Required fulfillment writes return <code>500</code> on failure so
        Stripe retries; when Convex is configured those writes use <code>requireConvex</code>{" "}
        (no SQLite-only ACK). To create Prices without the Stripe UI: set{" "}
        <code>ALLOW_STRIPE_BOOTSTRAP=1</code> and <code>POST /api/stripe/bootstrap-prices</code>,
        paste the returned <code>envSnippet</code> into secrets, then unset the flag.
        Abandoned-checkout recovery: shipped — sessions created but not completed after 2h surface
        on an operator-triggered recovery queue on{" "}
        <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> (see{" "}
        <code>src/lib/checkout/abandoned-recovery.ts</code>). When Convex is configured,{" "}
        <code>recordCheckoutSessionCreated</code> on both bundle and Commerce Buy now checkout
        routes uses <code>requireConvex</code> (returns <code>502</code> on failure) so
        Convex-first abandoned queues cannot miss a cart that only landed in instance-local
        SQLite — the create-side twin of webhook <code>markCheckoutSessionComplete</code>. Operator
        recovery emails durable-mark <code>recoverySentAt</code> with <code>requireConvex</code>{" "}
        before send so a Convex blip cannot leave the session due on other instances after a nudge.
        Those open sessions also boost the
        Work next quality score (hotter than preview opens) so carts do not hide behind cold
        follow-ups, and pipeline health shows abandoned-cart + recovery-due counts next to
        paid-not-live. Stripe Billing Portal: shipped for Growth/Complete/Commerce — operator{" "}
        <strong>Billing</strong> on paid/live leads, customer{" "}
        <strong>Manage subscription</strong> on <code>/checkout/success</code> (
        <code>POST /api/stripe/billing-portal</code> with <code>sessionId</code>);{" "}
        <code>listOrders</code> is newest-first on Convex too so the portal picks the latest
        eligible order. Checkout for an unknown slug creates a paid payment stub lead on both
        backends. Remaining: run
        bootstrap (or Dashboard) for test + live Price IDs, and activate Customer Portal in the
        Stripe Dashboard. Operator path:{" "}
        <DocLink href="/docs/launch-checklist">Launch checklist</DocLink>.
      </p>

      <h2 id="phase-4">Phase 4 — Data ingestion</h2>
      <p>
        CSV bulk import on the leads dashboard: shipped (tagged <code>dataSource</code> per batch).
        Slug collisions on re-import or manual add skip/reject instead of overwriting pipeline
        state (see <DocLink href="/docs/process">process log</DocLink>{" "}
        <code>upsert-lead-collision-guard</code>). Google Places API and other licensed sources
        still require legal review — no Maps/Facebook scrapers.
      </p>

      <h2 id="phase-5">Phase 5 — Production deploy</h2>
      <p>
        Post-payment handoff: shipped — webhook always enqueues DNS instructions + contact form
        endpoint (Convex <code>deployHandoffs</code> + SQLite fallback), including on Stripe
        redelivery after a partial first attempt (<code>bundle-webhook-handoff-on-redelivery</code>
        — <code>alreadyRecorded</code> skips receipt/DNS emails only). Required fulfillment write
        failures return <code>500</code> so Stripe retries (
        <code>stripe-webhook-retry-on-fulfillment-failure</code>); with Convex configured, webhook
        writes pass <code>requireConvex</code> (
        <code>stripe-webhook-convex-primary-no-fallback</code>). Optional Vercel domain
        API when tokens are set, operator{" "}
        <strong>Mark live</strong> on <DocLink href="/dashboard/leads">/dashboard/leads</DocLink>
        — Mark live, Assign Vercel project, and Assign custom domain all pass{" "}
        <code>requireConvex</code> (<code>deploy-handoff-operator-writes-convex-primary</code>)
        when Convex is configured, so a mutation failure surfaces as a retry instead of a
        SQLite-only success invisible to other instances.
        See <DocLink href="/docs/production-deploy">Production deploy</DocLink>. Per-client Vercel
        project isolation: shipped as an operator-assignable field per handoff (falls back to the
        shared project when unset) — full automated project creation remains manual. Preview
        subdomain → custom domain handoff: shipped end-to-end — operator saves a client&apos;s
        own domain on the handoff card, retries Vercel domain provisioning, and{" "}
        <code>src/proxy.ts</code> host-based routing serves that lead&apos;s preview at the
        client&apos;s domain root once DNS resolves (<code>proxy-custom-domain-parity</code>).
        Upsell / re-purchase handoff rebuilds preserve operator-set{" "}
        <code>customDomain</code> / <code>vercelProjectId</code> (
        <code>deploy-handoff-preserve-custom-domain</code>) and progressed{" "}
        <code>live</code>/<code>provisioned</code> status + notes (
        <code>deploy-handoff-preserve-status-on-upsell</code>).
        Remaining: registrar DNS automation. Client inquiry inbox (persist-required contact-form posts —{" "}
        <code>503</code> when the ledger write fails; with Convex configured,{" "}
        <code>requireConvex</code> so SQLite-only success cannot hide the row from other
        instances — + operator panel + dashboard reply via
        Resend with <code>requireConvex</code> + persist-then-notify on reply/status marks —
        <code>inquiry-reply-convex-primary</code>): shipped. Unreplied inquiry counts on pipeline
        health: shipped (new + read, with oldest age). Work next snooze: shipped. Inquiry
        mark-read on composer open: shipped. Snoozed-lead pipeline aggregates: shipped.
        Cold-lead archive/re-engage one-click (+ optional Email 1 on re-engage; with Convex
        configured, the disposition write uses <code>requireConvex</code> so Re-engage/Close
        cannot succeed only in instance-local SQLite —{" "}
        <code>cold-disposition-convex-primary</code>): shipped.
        Follow-ups-due pipeline aggregate: shipped. Daily digest snoozed footnote: shipped.
        Paid-Starter → Growth/Complete upsell nudge: shipped (operator email + checkout link).
        Growth/Complete monthly marketing packs: shipped. Marketing packs due this UTC month
        surface on pipeline health + daily digest; Starter upsell candidates also appear in the
        digest. Closed-leads funnel footnote: shipped (<code>closedLeadCount</code> on pipeline
        health — see <DocLink href="/docs/process">process log</DocLink>).
      </p>
      <h2>Phase 6 — Marketing engine</h2>
      <p>
        Operator-triggered monthly marketing pack for paid/live Growth/Complete leads: shipped
        (<code>generateMarketingPackAction</code> on{" "}
        <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> — 8 social/GBP posts + 2
        emails, Anthropic when <code>ANTHROPIC_API_KEY</code> is set, stub fallback, persisted
        per lead/month; when Convex is configured the persist uses <code>requireConvex</code>{" "}
        so Generate pack cannot succeed only in instance-local SQLite —{" "}
        <code>marketing-pack-convex-primary</code>). <strong>Email pack</strong> (
        <code>sendMarketingPackToClientAction</code>) delivers the pack to{" "}
        <code>lead.email</code> via Resend. Eligible-but-missing packs count on pipeline health
        and list in the daily digest. Buffer / GBP / Meta auto-scheduling stays operator-gated
        on secrets.
      </p>

      <h2>Phase 7 — Client AI phone</h2>
      <p>
        Operator-triggered FAQ/script pack for paid/live Complete leads: shipped (
        <code>generateClientVoicePackAction</code> on{" "}
        <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> — inbound greeting, hours,
        services, booking CTA, after-hours, take-a-message; Anthropic when{" "}
        <code>ANTHROPIC_API_KEY</code> is set; one pack per lead).{" "}
        <strong>Email voice pack</strong> (<code>sendClientVoicePackToClientAction</code>)
        delivers the pack to <code>lead.email</code> via Resend. Eligible-but-missing packs count
        on pipeline health (<strong>Voice packs due</strong>) and list in the daily digest.
        Twilio + client webhook provisioning remain. See{" "}
        <DocLink href="/docs/voice-agent-flow">Voice agent flow</DocLink>.
      </p>

      <h2>Phase 8 — Commerce</h2>
      <p>
        Operator-editable catalog ≤50 SKUs for paid/live <code>commerceAddon</code> leads:
        shipped (<code>saveCommerceCatalogAction</code> on{" "}
        <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> — shown on{" "}
        <code>/preview/[slug]</code>; missing panel on dashboard). Eligible-but-missing catalogs
        count on pipeline health and list in the daily digest. Stripe Products sync shipped:
        operator clicks Sync to Stripe on a saved catalog (
        <code>syncCommerceCatalogToStripeAction</code> →{" "}
        <code>syncCommerceCatalogToStripe</code>) to idempotently create a Stripe
        Product + Price per SKU (reuses <code>STRIPE_SECRET_KEY</code>, no new secrets);
        <code>/preview/[slug]</code> shows Buy now (<code>/api/commerce/checkout</code>,
        server-resolved price) for synced items and falls back to Request order → inquiry inbox
        for unsynced ones. Catalog edits preserve Stripe Product/Price ids server-side (price
        edits clear the Price id until the next Sync). Save catalog / Sync to Stripe persist with{" "}
        <code>requireConvex</code> when Convex is configured so SQLite-only success cannot leave
        Buy now blocked on other instances. Sync does not archive Products for
        removed SKUs — operators use <strong>Archive orphans</strong> (
        <code>archiveOrphanCommerceStripeProducts</code>, <code>active=false</code>, never
        auto-delete). Saved-but-unsynced catalogs count on
        pipeline health and list in the daily digest beside catalogs-missing. Completed Buy now
        orders are recorded in a separate <code>commerceOrders</code> ledger (idempotent on
        Stripe session id) and rolled up as a &quot;Commerce sales (pass-through)&quot;
        pipeline-health metric (unpaid/owed only — settled <code>paidOutAt</code> rows drop out) —
        deliberately kept out of <code>revenueTotalUsd</code>, since
        that money is owed to the client, not the platform. Stripe redeliveries of the same
        Buy now session recover missing operator inquiry + client receipt when the ledger
        exists but no <code>commerce_checkout</code> inquiry embeds the session id (
        <code>planCommerceWebhookSideEffects</code>); duplicates skip only when that inquiry
        already exists. Inquiry write failures after the ledger return HTTP 500 so Stripe
        actually redelivers into that recovery path (client receipt stays best-effort after
        inquiry succeeds). Per-lead owed totals and recent
        order lines surface on the <strong>Commerce payouts (manual)</strong> panel for
        reconciliation until Connect ships, and the same per-lead owed totals appear in the
        operator daily digest (<strong>Commerce payouts owed</strong>). Each order line has a{" "}
        <strong>Mark paid out</strong> action (<code>paidOutAt</code>,{" "}
        <code>requireConvex</code> when Convex is configured) so settled orders drop out
        of the health card, panel, and digest owed totals, guarding against double-paying a client. Abandoned Buy now carts are tracked
        on the same <code>checkout_sessions</code> table with <code>kind=commerce_sku</code>{" "}
        (never mixed into bundle recovery / Work next); open carts past 2h surface on an
        Abandoned Buy now panel + digest section with a recovery email linking{" "}
        <code>/preview/[slug]#catalog</code>. Completed Buy now also emails the Commerce client
        (<code>lead.email</code>) via <code>sendCommerceBuyNowClientReceipt</code> so they can
        fulfill — distinct from the shopper abandoned-recovery email and from the Local Site
        Studio bundle receipt. Still open: an actual payout path to
        the client (Stripe Connect) — operator/legal-gated, see{" "}
        <code>commerce-payouts-stripe-connect</code> in{" "}
        <DocLink href="/docs/process">process</DocLink>.
      </p>

      <p>
        Read <DocLink href="/docs/compliance">Compliance</DocLink> before any outreach code.
      </p>
    </DocPage>
  );
}
