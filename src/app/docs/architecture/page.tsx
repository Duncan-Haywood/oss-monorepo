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

      <h2 id="data-ingestion">1. Data ingestion (future)</h2>
      <p>Google Places API, CSV import, licensed data. No UI scraping without legal review.</p>
      <p>
        See <DocLink href="/docs/compliance">Compliance</DocLink>.
      </p>

      <h2>2. Site generation (future)</h2>
      <p>Category templates, merge public fields, preview slug, JSON config rendered at <code>/preview/[slug]</code>.</p>

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
        <code>POST /api/stripe/checkout</code> → Stripe Checkout → webhook → production deploy.
        Current scaffold returns 501.
      </p>

      <h2>7. Marketing engine (Growth + Complete)</h2>
      <p>LLM content from ingestion + site + voice discovery → quality gates → Buffer scheduling.</p>

      <h2>8. Client AI phone (Complete)</h2>
      <p>Twilio + Vapi per client; FAQ, booking, lead capture on their business line.</p>

      <h2>9. Commerce add-on</h2>
      <p>Catalog JSON, Stripe Products sync, embedded checkout, order notifications.</p>

      <h2>Tech stack</h2>
      <ul>
        <li>Next.js 16 + TypeScript + Tailwind v4</li>
        <li>Vercel hosting, Stripe Checkout</li>
        <li>Vapi/Retell (platform + client voice)</li>
        <li>Resend (email), Buffer (scheduling MVP)</li>
        <li>Database TBD — Convex or PostgreSQL</li>
      </ul>
    </DocPage>
  );
}
