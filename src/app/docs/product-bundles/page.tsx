import type { Metadata } from "next";
import { DocLink, DocPage } from "@/components/docs/doc-page";
import { brand } from "@/lib/brand";
import {
  monthlyMarketingEmailCount,
  monthlyMarketingSocialPostCount,
} from "@/lib/marketing/monthly-pack";
import { docPageMetadata } from "@/lib/seo";
import {
  bundlePriceHeadingLabel,
  commerceAddonPriceHeadingLabel,
  getBundle,
} from "@/lib/pricing/bundles";

export const metadata: Metadata = docPageMetadata("/docs/product-bundles");

export default function ProductBundlesDocPage() {
  return (
    <DocPage
      title="Product bundles"
      subtitle={`Sold under ${brand.name} · fulfilled by ${brand.legalEntity}`}
      related={[
        { href: "/docs/business-model", label: "Business model" },
        { href: "/docs/voice-agent-flow", label: "Voice agent flow" },
        { href: "/docs/architecture", label: "Architecture" },
      ]}
    >
      <table>
        <thead>
          <tr>
            <th>Bundle</th>
            <th>Tagline</th>
            <th>Best for</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Starter</td>
            <td>Your site, live in days</td>
            <td>Trades, consultants — credibility + contact only</td>
          </tr>
          <tr>
            <td>Growth</td>
            <td>Site + customers on autopilot</td>
            <td>Salons, gyms — wants visibility, won&apos;t post themselves</td>
          </tr>
          <tr>
            <td>Complete</td>
            <td>Never miss a call or customer</td>
            <td>Phone-heavy — home services, appointment salons</td>
          </tr>
          <tr>
            <td>Commerce add-on</td>
            <td>Sell online, not just inform</td>
            <td>Retail, restaurant pickup, salon deposits</td>
          </tr>
        </tbody>
      </table>

      <h2>Starter — {bundlePriceHeadingLabel(getBundle("starter")!)}</h2>
      <ul>
        <li>Category template landing page, mobile responsive</li>
        <li>Contact form, Google Maps, hours, basic SEO (form + map live on /preview/[slug])</li>
        <li>Preview subdomain → custom domain handoff</li>
        <li>Self-serve Stripe checkout</li>
      </ul>

      <h2>Growth — {bundlePriceHeadingLabel(getBundle("growth")!)}</h2>
      <p>
        Everything in Starter plus AI marketing engine: {monthlyMarketingSocialPostCount()}{" "}
        social/GBP posts + {monthlyMarketingEmailCount()} emails/month, brand voice from site
        data. Operators generate a monthly pack on the leads dashboard and
        can <strong>Email pack</strong> to the client (Resend) so they can post themselves;
        when Convex is configured, Generate pack fails closed (<code>requireConvex</code>) so a
        multi-instance deploy cannot claim success after a SQLite-only write that leaves Email
        pack / packs-due blind elsewhere. Buffer / GBP / Meta auto-scheduling stays optional
        once OAuth is configured.
      </p>

      <h2>Complete — {bundlePriceHeadingLabel(getBundle("complete")!)}</h2>
      <p>
        Everything in Growth plus full marketing tier and client AI phone agent (answers their
        business line — booking, FAQ, lead capture). Until Twilio is live, operators fulfill with
        a generated FAQ/script pack on the leads dashboard and can{" "}
        <strong>Email voice pack</strong> to the client (Resend) so they can paste into a temp
        number / Cal.com (see <DocLink href="/docs/voice-agent-flow">Voice agent flow</DocLink>).
        When Convex is configured, Generate voice fails closed (<code>requireConvex</code>) so a
        multi-instance deploy cannot claim success after a SQLite-only write that leaves Email
        voice pack / voice-packs-due blind elsewhere.
      </p>

      <h2>Commerce — {commerceAddonPriceHeadingLabel()}</h2>
      <p>
        Stacks on any bundle. Operator-editable catalog ≤50 SKUs on the live preview. Operator
        clicks Sync to Stripe on a saved catalog to create real Stripe Products/Prices per SKU
        (reuses STRIPE_SECRET_KEY, idempotent on re-run); synced items show a Buy now button
        that opens Stripe Checkout directly. When Convex is configured, Save catalog / Sync to
        Stripe fail closed (<code>requireConvex</code>) so a multi-instance deploy cannot claim
        success after a SQLite-only write that leaves Buy now blocked elsewhere — action-level
        Vitest in <code>save-commerce-catalog-action.test.ts</code> locks Save catalog auth,
        eligibility, preserve Stripe ids, and fail-closed persist;{" "}
        <code>get-commerce-catalog-action.test.ts</code> locks the read that seeds Save/Sync
        (auth, empty slug, row or null). Unsynced items still fall back to Request order →
        inquiry inbox. After removing SKUs from a catalog, Archive orphans deactivates leftover
        Stripe Products for that lead (operator-triggered; never auto-deletes on save/sync;
        action-level Vitest in{" "}
        <code>archive-orphan-commerce-stripe-products-action.test.ts</code>). A
        completed Buy now also emails the local business (<code>lead.email</code>
        ) with the SKU/amount so they can fulfill — the sold order-notification promise — separate
        from the operator inquiry inbox and from Stripe Connect payouts. Stripe redeliveries of the
        same Checkout Session recover a missing inquiry and a missing client email independently
        when the <code>commerceOrders</code> ledger row exists: inquiry when no prior{" "}
        <code>commerce_checkout</code> inquiry embeds that session id (uncapped{" "}
        <code>listCommerceCheckoutInquiriesBySlug</code>); client receipt when{" "}
        <code>clientReceiptEmailSentAt</code> is unset. Inquiry presence alone must not permanently
        skip a failed/suppressed client order-notification. Inquiry write failures after the ledger
        return HTTP 500 so Stripe retries into that recovery path. Retail, restaurant
        ordering, booking deposits, or gift cards.
      </p>
      <p>
        <strong>Operator note:</strong> Buy now money is collected through the platform&apos;s
        own Stripe account, not the client business&apos;s. Total collected is visible as
        &quot;Commerce sales (pass-through)&quot; on the operator dashboard, and per-lead
        totals + recent lines appear on the <strong>Commerce payouts (manual)</strong> panel
        on <DocLink href="/dashboard/leads">/dashboard/leads</DocLink> for reconciliation, and
        the same per-lead owed totals appear in the operator daily digest so liability is
        visible without opening the dashboard. Once an operator actually pays a client their
        share, <strong>Mark paid out</strong> on that order line removes it from both owed
        totals so the same money can&apos;t be double-counted or double-paid (when Convex is
        configured the mark fails closed rather than succeeding only on instance-local SQLite). The dashboard
        &quot;Commerce sales (pass-through)&quot; card uses the same unpaid filter, so
        Mark paid out clears attention there too.
        There is no automated payout to the client yet — pay clients manually until Stripe
        Connect ships (see <DocLink href="/docs/process">process</DocLink>,
        commerce-payouts-stripe-connect).
      </p>

      <h2>Discounts / promo codes</h2>
      <p>
        Every Checkout Session (bundle + Commerce add-on at <code>/api/stripe/checkout</code>,
        Commerce Buy now at <code>/api/commerce/checkout</code>) sets{" "}
        <code>allow_promotion_codes: true</code>, so Stripe&apos;s own promo-code field appears on
        the hosted Checkout page with no app code change per campaign. Create a Coupon and a
        Promotion Code (the customer-facing string, e.g. <code>LAUNCH20</code>) directly in the
        Stripe Dashboard (Product catalog → Coupons) — a launch discount, referral-partner code, or
        win-back offer for a churned Growth/Complete subscriber all work this way. The webhook
        already records <code>session.amount_total</code> (the post-discount charged amount), so a
        redeemed code needs no ledger, entitlement, or pipeline-health change to stay accurate.
      </p>

      <h2>Recommendation logic</h2>
      <ul>
        <li>High phone volume → Complete</li>
        <li>Wants marketing only → Growth</li>
        <li>Price-sensitive trades → Starter</li>
        <li>Online orders or deposits → add Commerce</li>
      </ul>

      <h2>Source of truth</h2>
      <p>
        Sold USD amounts and Stripe Price env var names live in{" "}
        <code>src/lib/pricing/bundles.ts</code> (direct Vitest coverage in{" "}
        <code>bundles.test.ts</code>). Checkout UI, tier upsell, bootstrap, and env readiness all
        read from that module — Stripe Price IDs themselves stay in secrets after operator
        bootstrap.
      </p>

      <h2>Upsell path</h2>
      <p>Preview tier cards → self-serve Stripe, or platform voice explains tiers → checkout link via SMS.</p>
    </DocPage>
  );
}
