import { DocLink, DocPage } from "@/components/docs/doc-page";
import { brand } from "@/lib/brand";

export default function BusinessModelDocPage() {
  return (
    <DocPage
      title="Business model"
      subtitle={`Public brand: ${brand.name} · Legal: ${brand.legalEntity}`}
      related={[
        { href: "/docs/product-bundles", label: "Product bundles" },
        { href: "/docs/voice-agent-flow", label: "Voice agent flow" },
        { href: "/docs/marketing-automation", label: "Marketing automation" },
      ]}
    >
      <h2>Value proposition</h2>
      <p>
        Digital presence bundles for local businesses — preview before purchase, zero human
        sales friction. Customers get a link, talk to AI for changes, pick a bundle self-serve.
      </p>

      <h2>Pricing — bundles</h2>
      <table>
        <thead>
          <tr>
            <th>Bundle</th>
            <th>Price</th>
            <th>Includes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Starter</td>
            <td>$500 one-time</td>
            <td>Landing page, contact form, maps, SEO, domain handoff</td>
          </tr>
          <tr>
            <td>Growth</td>
            <td>$500 + $99/mo</td>
            <td>Starter + AI marketing (8 social/GBP + 2 emails/mo)</td>
          </tr>
          <tr>
            <td>Complete</td>
            <td>$500 + $199/mo</td>
            <td>Growth + full marketing + client AI phone agent</td>
          </tr>
          <tr>
            <td>Commerce add-on</td>
            <td>+$300 + $49/mo</td>
            <td>Stripe checkout, catalog ≤50 SKUs</td>
          </tr>
        </tbody>
      </table>
      <p>
        Invoices and Stripe receipts show <strong>{brand.legalEntity}</strong>. Outreach uses
        the public brand.
      </p>

      <h2>Automated funnel</h2>
      <ol>
        <li>Discover business (API/CSV)</li>
        <li>Auto-generate preview site</li>
        <li>Email with preview link (+ optional outbound voice)</li>
        <li>Customer views preview or calls AI assistant</li>
        <li>Voice discovery updates preview (optional)</li>
        <li>Stripe checkout — self-serve</li>
        <li>Automated production deploy + DNS handoff</li>
      </ol>

      <h2>Outreach — Email 1</h2>
      <p>
        <strong>From:</strong> {brand.name}
        <br />
        <strong>Subject:</strong> {"{BusinessName}"} — we built your website (free preview)
      </p>
      <ol>
        <li>Preview link on subdomain</li>
        <li>Callback number for AI assistant</li>
        <li>Checkout on preview — bundles from $500</li>
        <li>CAN-SPAM footer: public brand + {brand.legalEntity} address</li>
      </ol>

      <h2>Bundle upsell touchpoints</h2>
      <ul>
        <li>Preview site tier comparison cards</li>
        <li>Platform voice after customization</li>
        <li>Post-purchase upgrade emails</li>
      </ul>

      <h2>Operator workflow</h2>
      <p>Monitoring only — weekly metrics, alert on failures, monthly script tuning. No daily outreach or discovery calls.</p>

      <p>
        Full tier scope: <DocLink href="/docs/product-bundles">Product bundles</DocLink>
      </p>
    </DocPage>
  );
}
