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
        compliance. When <code>OPERATOR_DASHBOARD_PASSWORD</code> is set,{" "}
        <code>src/proxy.ts</code> gates <code>/dashboard/*</code> and lead mutation server actions
        require a signed session cookie. Google Places API and other licensed sources remain future
        work after legal review. No UI scraping.
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

      <h2>5. Platform voice agent</h2>
      <p>Vapi/Retell → <code>/api/voice/platform/webhook</code> → site config updater + Stripe checkout link.</p>

      <h2 id="payments">6. Payments (self-serve)</h2>
      <p>
        <code>POST /api/stripe/checkout</code> creates a real Stripe Checkout Session (501 only
        when Price IDs / secret key are missing).{" "}
        <code>POST /api/stripe/webhook</code> verifies signatures, marks the lead paid, records the
        order, sends a receipt email when Resend is configured, and enqueues a production deploy
        handoff (DNS + contact form). Operator bootstrap:{" "}
        <code>POST /api/stripe/bootstrap-prices</code> with <code>ALLOW_STRIPE_BOOTSTRAP=1</code>{" "}
        creates Products/Prices and returns env var snippets. Remaining for first paid order: run
        bootstrap (or Dashboard) so Price ID env vars are set. Deploy details:{" "}
        <DocLink href="/docs/production-deploy">Production deploy</DocLink>.
      </p>
      <p>
        Every slug-attributed Checkout Session is tracked in <code>checkout_sessions</code> (
        <code>src/lib/checkout/</code>) as <code>open</code> until the completed webhook flips it
        to <code>complete</code>. Sessions still <code>open</code> 2+ hours after creation surface
        on an &quot;Abandoned checkouts&quot; panel on <code>/dashboard/leads</code> for an
        operator-triggered recovery email (Resend, honors suppression, cooldown between nudges) —
        see <code>src/lib/checkout/abandoned-recovery.ts</code>. The same open sessions feed{" "}
        <code>scoreLead</code> / Work next (+18 abandoned, +6 when recovery is due) so carts
        outrank plain outreach-due leads, and pipeline health aggregates abandoned-cart +
        recovery-due counts (with oldest abandoned age) beside paid-not-live.
      </p>
      <p>
        Growth/Complete/Commerce subscribers manage cards, invoices, and cancellation via Stripe
        Billing Portal: <code>POST /api/stripe/billing-portal</code> (post-checkout{" "}
        <code>sessionId</code>) and the operator <strong>Billing</strong> action on paid/live
        leads. Orders store <code>stripeCustomerId</code> when the webhook records payment;
        older orders fall back to retrieving the Checkout Session. Activate Customer Portal in
        the Stripe Dashboard before first live use (see{" "}
        <DocLink href="/docs/launch-checklist">Launch checklist</DocLink>).
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
        Handoff records live in SQLite (<code>deploy_handoffs</code>). Suggested host{" "}
        <code>{"{slug}.domain"}</code>, contact form at <code>/api/contact/[slug]</code>{" "}
        (persists <code>client_inquiries</code> + email notify), optional Vercel Domains API.
        Operators confirm DNS then mark the lead <code>live</code>. Inquiry inbox on{" "}
        <code>/dashboard/leads</code> supports operator reply (Resend + suppression → status{" "}
        <code>replied</code> with stored body). Opening the reply composer on a{" "}
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
        discovery stages). Operator free-text <code>notes</code> on each lead capture call
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
        history, drops off Work next and cold counts).
      </p>

      <h2>7. Marketing engine (Growth + Complete)</h2>
      <p>
        Monthly packs: <code>src/lib/marketing/</code> builds an 8-post + 2-email pack via{" "}
        <code>StubMarketingGenerator</code> or <code>AnthropicMarketingGenerator</code> when{" "}
        <code>ANTHROPIC_API_KEY</code> is set. Operators trigger{" "}
        <code>generateMarketingPackAction</code> on{" "}
        <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> for paid/live leads with a
        Growth/Complete order; packs persist one row per lead per UTC month (SQLite + Convex{" "}
        <code>marketingPacks</code>). Copy/paste to post until Buffer / GBP / Meta OAuth is
        configured. See <DocLink href="/docs/marketing-automation">Marketing automation</DocLink>{" "}
        and <DocLink href="/docs/process">process log</DocLink>.
      </p>

      <h2>8. Client AI phone (Complete)</h2>
      <p>
        FAQ/script packs: <code>src/lib/voice/</code> builds a 6-script receptionist pack via{" "}
        <code>StubClientVoiceGenerator</code> or <code>AnthropicClientVoiceGenerator</code> when{" "}
        <code>ANTHROPIC_API_KEY</code> is set. Eligibility: paid/live + Complete order; one row
        per lead (SQLite + Convex <code>clientVoicePacks</code>) — regenerating replaces.
        Operators copy scripts into a temp number / Cal.com until Twilio +{" "}
        <code>/api/voice/client/webhook</code> ship. See{" "}
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
        <code>commerceCatalogsMissingCount</code>) and list in the daily digest. Stripe Products
        sync shipped: <code>syncCommerceCatalogToStripeAction</code> (dashboard &quot;Sync to
        Stripe&quot; button) calls <code>syncCommerceCatalogToStripe</code> (
        <code>src/lib/commerce/stripe-sync.ts</code>) to idempotently create/find a Stripe
        Product + Price per SKU (keyed by <code>commerce_sku_&#123;leadSlug&#125;_&#123;skuId&#125;</code>{" "}
        metadata, reuses <code>STRIPE_SECRET_KEY</code> — no new secrets), then persists
        <code>stripeProductId</code>/<code>stripePriceId</code> back onto each item.{" "}
        <code>/preview/[slug]</code> shows Buy now for synced SKUs — <code>POST /api/commerce/checkout</code>{" "}
        resolves the Stripe Price server-side from the stored catalog (never trusts a
        client-submitted price) and creates a one-time Checkout Session. Unsynced items keep the
        &quot;Request order&quot; → contact form → inquiry inbox stub.
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
