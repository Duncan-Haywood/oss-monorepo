import { Link } from "react-router-dom";
import { Card, DataTable } from "../components/DocPrimitives";
import { DocLayout } from "../components/DocLayout";
import { reportRegistry } from "../generated/report-manifest";

const primarySlug = "commercial-viability-report";

export function CommercialViabilityPage() {
  const primary = reportRegistry.find((e) => e.slug === primarySlug);
  const related = reportRegistry.filter(
    (e) => e.slug.includes("commercial-viability") && e.slug !== primarySlug,
  );

  return (
    <DocLayout
      title="Commercial viability"
      subtitle="TSX summary — full assessments are TSX reports under /reports"
    >
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

      <h2>Full assessments (TSX)</h2>
      <Card>
        <p>
          Long-form reports live in <code>apps/docs/src/reports/</code> and are
          registered at build time. Edit TSX there, then{" "}
          <code>pnpm docs:sync</code>.
        </p>
        <DataTable
          headers={["Report", "Open"]}
          rows={[
            ...(primary
              ? [
                  [
                    primary.title,
                    <Link to={`/reports/${primary.slug}`} key="primary">
                      Open full report
                    </Link>,
                  ],
                ]
              : []),
            ...related.map((e) => [
              e.title,
              <Link to={`/reports/${e.slug}`} key={e.slug}>
                Open
              </Link>,
            ]),
          ]}
        />
        <p>
          <Link to="/reports">Browse all reports →</Link>
        </p>
      </Card>

      <footer>
        <Link to="/business-plan">Business plan</Link>
        {" · "}
        <Link to="/roi">ROI</Link>
        {" · "}
        <Link to="/">Home</Link>
      </footer>
    </DocLayout>
  );
}
