import { DocLink, DocPage } from "@/components/docs/doc-page";
import { brand } from "@/lib/brand";

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

      <h2>Starter — $500 one-time</h2>
      <ul>
        <li>Category template landing page, mobile responsive</li>
        <li>Contact form, Google Maps, hours, basic SEO (form + map live on /preview/[slug])</li>
        <li>Preview subdomain → custom domain handoff</li>
        <li>Self-serve Stripe checkout</li>
      </ul>

      <h2>Growth — $500 + $99/mo</h2>
      <p>
        Everything in Starter plus AI marketing engine: 8 social/GBP posts + 2 emails/month,
        brand voice from site data. Operators generate a monthly pack on the leads dashboard and
        can <strong>Email pack</strong> to the client (Resend) so they can post themselves;
        Buffer / GBP / Meta auto-scheduling stays optional once OAuth is configured.
      </p>

      <h2>Complete — $500 + $199/mo</h2>
      <p>
        Everything in Growth plus full marketing tier and client AI phone agent (answers their
        business line — booking, FAQ, lead capture). Until Twilio is live, operators fulfill with
        a generated FAQ/script pack on the leads dashboard (see{" "}
        <DocLink href="/docs/voice-agent-flow">Voice agent flow</DocLink>).
      </p>

      <h2>Commerce — +$300 + $49/mo</h2>
      <p>
        Stacks on any bundle. Operator-editable catalog ≤50 SKUs on the live preview. Operator
        clicks Sync to Stripe on a saved catalog to create real Stripe Products/Prices per SKU
        (reuses STRIPE_SECRET_KEY, idempotent on re-run); synced items show a Buy now button
        that opens Stripe Checkout directly. Unsynced items still fall back to Request order →
        inquiry inbox. Retail, restaurant ordering, booking deposits, or gift cards.
      </p>
      <p>
        <strong>Operator note:</strong> Buy now money is collected through the platform&apos;s
        own Stripe account, not the client business&apos;s. Total collected is visible as
        &quot;Commerce sales (pass-through)&quot; on the operator dashboard, but there is no
        automated payout to the client yet — reconcile and pay clients manually until Stripe
        Connect ships (see <DocLink href="/docs/process">process</DocLink>,
        commerce-payouts-stripe-connect).
      </p>

      <h2>Recommendation logic</h2>
      <ul>
        <li>High phone volume → Complete</li>
        <li>Wants marketing only → Growth</li>
        <li>Price-sensitive trades → Starter</li>
        <li>Online orders or deposits → add Commerce</li>
      </ul>

      <h2>Upsell path</h2>
      <p>Preview tier cards → self-serve Stripe, or platform voice explains tiers → checkout link via SMS.</p>
    </DocPage>
  );
}
