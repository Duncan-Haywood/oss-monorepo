import { DocLink, DocPage } from "@/components/docs/doc-page";
import { brand } from "@/lib/brand";

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
        <li>Document data source per lead</li>
      </ul>
      <table>
        <thead>
          <tr>
            <th>Platform</th>
            <th>Notes</th>
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
        <li>Valid physical postal address in Colorado</li>
        <li>Working unsubscribe honored within 10 business days</li>
        <li>Non-deceptive subject lines</li>
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
            <th>Data</th>
            <th>Retention</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Active leads</td>
            <td>Until converted or 12 months inactive</td>
          </tr>
          <tr>
            <td>Opted-out / DNC</td>
            <td>Indefinitely</td>
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
