import type { Metadata } from "next";
import { DocLink, DocPage } from "@/components/docs/doc-page";
import { brand } from "@/lib/brand";
import { docPageMetadata } from "@/lib/seo";

export const metadata: Metadata = docPageMetadata("/docs/legal");

export default function LegalDocPage() {
  return (
    <DocPage
      title="Legal — Maris Stella Labs"
      subtitle="Operational guidance, not legal advice. Have counsel review before launch."
      related={[
        { href: "/docs/compliance", label: "Compliance" },
        { href: "/docs/voice-agent-flow", label: "Voice agent flow" },
        { href: "/docs/business-model", label: "Business model" },
      ]}
    >
      <h2>Two-layer branding</h2>
      <table>
        <thead>
          <tr>
            <th>Layer</th>
            <th>Name</th>
            <th>Used for</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Legal entity</td>
            <td>{brand.legalEntity}</td>
            <td>Stripe, contracts, Terms/Privacy, CAN-SPAM/TCPA footers, invoices</td>
          </tr>
          <tr>
            <td>Public brand</td>
            <td>{brand.isConfigured ? brand.name : "[TBD — set NEXT_PUBLIC_BRAND_NAME]"}</td>
            <td>Marketing site, outreach From name, voice persona, preview pages</td>
          </tr>
        </tbody>
      </table>
      <p>
        <strong>{brand.legalEntity}</strong> ({brand.legalLocation}) owns and operates the
        business. The public brand is customer-facing and may differ from the legal entity.
      </p>

      <h3>DBA / trade name</h3>
      <p>
        If the public brand differs from &ldquo;{brand.legalEntity}&rdquo;, file a trade name
        (DBA) with the Colorado Secretary of State before using it in commerce.
      </p>
      <ul>
        <li>
          <strong>Env:</strong> <code>NEXT_PUBLIC_BRAND_NAME</code> (public) ·{" "}
          <code>NEXT_PUBLIC_LEGAL_ENTITY={brand.legalEntity}</code> — read by{" "}
          <code>src/lib/brand.ts</code> (Vitest-covered; whitespace-only treated as unset)
        </li>
        <li>
          <strong>DBA filing:</strong> [PLACEHOLDER] — required if brand ≠ legal entity
        </li>
      </ul>

      <h2>Placeholders to complete with counsel</h2>
      <ul>
        <li>Public brand name + DBA</li>
        <li>Registered business address (CAN-SPAM)</li>
        <li>EIN / tax ID</li>
        <li>Entity type and registered agent</li>
        <li>Terms at <DocLink href="/terms">/terms</DocLink> and Privacy at{" "}
          <DocLink href="/privacy">/privacy</DocLink>
        </li>
        <li>Refund policy and Colorado sales tax review</li>
      </ul>

      <h2>CAN-SPAM (email outreach)</h2>
      <p>
        Footer must identify <strong>{brand.legalEntity}</strong>. From name may use the public
        brand.
      </p>
      <pre>{`---
${brand.name}
A ${brand.legalEntity} company

${brand.legalEntity}
[Street], [City], CO [ZIP]
Pre-built websites for local businesses

Unsubscribe: [link]`}</pre>

      <h2>Stripe merchant</h2>
      <ul>
        <li>Account business name: {brand.legalEntity}</li>
        <li>Statement descriptor: public brand or abbreviated form</li>
        <li>Checkout and receipts show {brand.legalEntity} as seller</li>
      </ul>

      <h2>Voice agent disclosures</h2>
      <ol>
        <li>Introduce with the public brand — not {brand.legalEntity} unless legally required</li>
        <li>Disclose AI/automation where required</li>
        <li>Honor verbal opt-out; sync to suppression list</li>
        <li>No outbound TCPA marketing without documented consent — see{" "}
          <DocLink href="/docs/compliance">Compliance</DocLink>
        </li>
      </ol>
      <p>
        Scripts: <DocLink href="/docs/voice-agent-flow">Voice agent flow</DocLink>
      </p>

      <h2>Pre-launch checklist</h2>
      <ul>
        <li>Entity formed (Colorado)</li>
        <li>Public brand chosen; DBA filed if needed</li>
        <li>EIN and CAN-SPAM address live</li>
        <li>Terms and Privacy published</li>
        <li>Stripe verified as {brand.legalEntity}</li>
        <li>Email domain authenticated (SPF/DKIM/DMARC)</li>
        <li>TCPA strategy before outbound voice</li>
        <li>Attorney review of templates and scripts</li>
      </ul>
    </DocPage>
  );
}
