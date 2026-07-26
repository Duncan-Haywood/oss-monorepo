import type { Metadata } from "next";
import { DocLink, DocPage } from "@/components/docs/doc-page";
import { brand } from "@/lib/brand";
import { docPageMetadata } from "@/lib/seo";

export const metadata: Metadata = docPageMetadata("/docs/compliance");

export default function ComplianceDocPage() {
  return (
    <DocPage
      title="Compliance"
      subtitle={`${brand.legalEntity} · ${brand.legalLocation} — not legal advice.`}
      related={[
        { href: "/docs/legal", label: "Legal" },
        { href: "/docs/voice-agent-flow", label: "Voice agent flow" },
      ]}
    >
      <h2>Data gathering</h2>
      <ul>
        <li>Prefer official APIs and licensed data over scraping HTML</li>
        <li>Use only publicly available business information</li>
        <li>Do not copy copyrighted photos, logos, or long-form text without permission</li>
        <li>Respect robots.txt and platform Terms of Service</li>
        <li>
          Document data source per lead (<code>Lead.dataSource</code> — e.g.{" "}
          <code>manual_entry</code>, <code>csv_import</code>, <code>places_api</code>)
        </li>
      </ul>
      <table>
        <thead>
          <tr>
            <th scope="col">Platform</th>
            <th scope="col">Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Google Maps / GBP</td>
            <td>Use Places API — UI scraping violates Google ToS</td>
          </tr>
          <tr>
            <td>Facebook / Meta</td>
            <td>Graph API with app review; scraping is high risk</td>
          </tr>
          <tr>
            <td>Yelp and directories</td>
            <td>ToS prohibit scraping — use partnerships or manual entry</td>
          </tr>
        </tbody>
      </table>

      <h2>Email — CAN-SPAM</h2>
      <ul>
        <li>Identify sender: {brand.legalEntity} in footer; public brand in From name</li>
        <li>
          Resend <code>from</code> uses <code>EMAIL_FROM</code> via{" "}
          <code>brand.emailFrom</code> / <code>formatResendFromHeader</code> — until set to a
          non-placeholder Resend-verified address,{" "}
          <DocLink href="/dashboard">/dashboard</DocLink> shows a lime readiness banner via{" "}
          <code>assessEmailFromEnvReadiness</code> (
          <code>src/lib/email/email-from-env-readiness.ts</code>)
        </li>
        <li>
          Valid physical postal address in Colorado — until{" "}
          <code>NEXT_PUBLIC_COMPANY_ADDRESS</code> is a non-placeholder address,{" "}
          <DocLink href="/dashboard">/dashboard</DocLink> shows a yellow readiness banner via{" "}
          <code>assessCompanyAddressEnvReadiness</code> (
          <code>src/lib/brand/company-address-env-readiness.ts</code>) so outreach cannot
          silently ship the bracket stub
        </li>
        <li>
          Outbound HTML escapes <code>brand.name</code> / legal entity / postal address (and
          lead fields) via <code>escapeHtmlForEmail</code> — including the email shown on the
          unsubscribe success page; subject/From stay plain text
        </li>
        <li>
          Working unsubscribe honored within 10 business days —{" "}
          <code>GET /api/unsubscribe</code> must record suppression in the shared store when
          Convex is configured (<code>requireConvex</code>); a transient Convex failure returns
          500 so the visitor can retry rather than a false success page
        </li>
        <li>
          Unsubscribe links are per-recipient signed tokens (
          <code>src/lib/email/unsubscribe-token.ts</code>) so a third party who only knows an
          address cannot suppress it without ever having received a message — the route rejects
          a missing/invalid token with 400 before touching the suppression store
        </li>
        <li>
          <code>GET /api/unsubscribe</code> is rate-limited by client IP (
          <code>src/lib/security/rate-limit.ts</code>, same helper as contact / checkout /
          commerce checkout / billing portal / preview-open / bootstrap-prices /
          marketing generate) before token verify — returns 429 +
          Retry-After so a harvested footer link cannot unboundedly mutate the global suppression
          list that gates every automated send
        </li>
        <li>
          Every outbound send carries <code>List-Unsubscribe</code> +{" "}
          <code>List-Unsubscribe-Post: List-Unsubscribe=One-Click</code> headers (
          <code>src/lib/email/resend.ts</code>) per Gmail/Yahoo bulk-sender requirements, and{" "}
          <code>POST /api/unsubscribe</code> (RFC 8058 one-click) shares the exact same
          rate-limit / token-verify / length-cap / <code>requireConvex</code> guards as{" "}
          <code>GET</code> so a mail client&apos;s automated one-click request cannot bypass
          anything the browser-driven link enforces
        </li>
        <li>Non-deceptive subject lines</li>
        <li>
          Operators can review the full suppression list and remove an address via the
          Suppressed emails panel on <DocLink href="/dashboard">/dashboard/leads</DocLink> (
          <code>unsuppressEmailAction</code>) — this is for correcting a mistaken or stale
          suppression only, never because the recipient asked to be contacted again; removing an
          address does not restore consent, and a genuine opt-out must go through a fresh,
          affirmative re-consent flow before that address is emailed again
        </li>
      </ul>

      <h2>Voice — TCPA</h2>
      <p>
        Automated marketing calls to cell phones typically require prior express written
        consent. Recommended launch sequence:
      </p>
      <ol>
        <li>Phase A: Email outreach only</li>
        <li>Phase B: Inbound-only voice (customer calls you)</li>
        <li>Phase C: Outbound AI only after attorney-approved consent strategy</li>
      </ol>
      <p>
        Platform voice introduces with the <strong>public brand</strong>. Honor verbal
        opt-out immediately.
      </p>

      <h2>Data retention (suggested)</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Data</th>
            <th scope="col">Retention</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Active leads</td>
            <td>Until converted or 12 months inactive</td>
          </tr>
          <tr>
            <td>Opted-out / DNC</td>
            <td>
              Indefinitely, unless an operator removes a mistaken/stale entry via the Suppressed
              emails panel (see above)
            </td>
          </tr>
          <tr>
            <td>Email logs</td>
            <td>24 months</td>
          </tr>
          <tr>
            <td>Voice transcripts</td>
            <td>90 days (adjust per Privacy Policy)</td>
          </tr>
        </tbody>
      </table>

      <h2>Before first outreach batch</h2>
      <ul>
        <li>{brand.legalEntity} registered (Colorado SOS)</li>
        <li>CAN-SPAM address live</li>
        <li>Privacy and Terms published</li>
        <li>Unsubscribe + suppression list implemented</li>
        <li>SPF/DKIM/DMARC on sending domain</li>
        <li>Stripe verified as {brand.legalEntity}</li>
        <li>TCPA strategy before outbound voice</li>
        <li>No Maps/Facebook UI scraping without legal approval</li>
      </ul>
      <p>
        Legal outlines: <DocLink href="/docs/legal">Legal</DocLink>
      </p>
    </DocPage>
  );
}
