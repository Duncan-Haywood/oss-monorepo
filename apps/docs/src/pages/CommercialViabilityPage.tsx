import { Link } from "react-router-dom";
import { Card, DataTable } from "../components/DocPrimitives";
import { DocLayout } from "../components/DocLayout";
import { CommercialViabilitySubnav } from "../components/CommercialViabilitySubnav";
import { commercialViabilityPages } from "./commercial-viability";

export function CommercialViabilityPage() {
  return (
    <DocLayout
      title="Commercial viability"
      subtitle="TSX assessments — converted from legacy HTML reports; hub for all viability analyses"
      footer={
        <>
          <Link to="/business-plan">Business plan</Link>
          {" · "}
          <Link to="/roi">ROI</Link>
          {" · "}
          <Link to="/">Home</Link>
        </>
      }
    >
      <CommercialViabilitySubnav />

      <Card variant="warn">
        <p>
          <strong>Verdict (M0–M1):</strong> Conditionally viable for a design-partner
          pilot in Italian micro-format luxury retail. Payback depends on ranks 1–3
          (door+POS, SKU gap, upsell) shipping before window/outdoor analytics.
        </p>
      </Card>

      <h2>Scorecard (illustrative)</h2>
      <DataTable
        headers={["Dimension", "Score /10", "Note"]}
        rows={[
          ["Market fit (ICP)", "7", "10 m² leather boutique; owner-operated, GDPR-sensitive"],
          ["Unit economics", "6", "Core €149/mo plausible if one incremental sale/month"],
          ["Technical readiness", "5", "Stubs + TSX collateral strong; live pilot wiring pending"],
          ["Scalability", "4", "Multi-store playbook unproven; edge ops still manual"],
          ["Competitive moat", "5", "Privacy-first + SKU margin story; not yet defensible data network"],
        ]}
      />

      <h2>Full assessments (TSX)</h2>
      <DataTable
        headers={["Report", "Route", "Open"]}
        rows={commercialViabilityPages.map((page) => [
          page.title.replace(/ — Retail Pilot Intel.*$/i, ""),
          <code key={`${page.slug}-route`}>/commercial-viability/{page.slug}</code>,
          <Link to={`/commercial-viability/${page.slug}`} key={page.slug}>
            Read
          </Link>,
        ])}
      />

      <h2>What to do first</h2>
      <ol>
        <li>
          Close design partner with written ROI baseline — see{" "}
          <Link to="/business-plan">Business plan</Link>.
        </li>
        <li>
          Ship door + POS join (rank 1) before any window CV spend —{" "}
          <Link to="/roi">ROI matrix</Link>.
        </li>
        <li>
          Run sales demos via <code>pnpm portal:dev</code> with passcode gate; docs
          site mirrors the same commercial story.
        </li>
      </ol>
    </DocLayout>
  );
}
