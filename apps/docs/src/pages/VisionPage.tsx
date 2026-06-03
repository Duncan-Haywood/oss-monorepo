import { Link } from "react-router-dom";
import { Card, DataTable } from "../components/DocPrimitives";
import { DocLayout } from "../components/DocLayout";

export function VisionPage() {
  return (
    <DocLayout
      title="Product vision"
      subtitle="Increase profit per visitor in micro-format leather retail — privacy-preserving, store-local"
      footer={
        <>
          <Link to="/gtm">GTM strategy →</Link>
          {" · "}
          <Link to="/business-plan">Business plan →</Link>
          {" · "}
          <Link to="/roi">ROI matrix →</Link>
        </>
      }
    >
      <h2>Problem (financial)</h2>
      <p>
        A ~10 m² leather boutique in Italy runs on thin traffic and high ticket
        sizes. The owner cannot see which days convert footfall to margin, which
        SKUs attract attention but do not sell, or whether display and staffing
        choices return €. Generic footfall counters do not connect to POS margin.
      </p>

      <h2>Solution</h2>
      <p>
        A <strong>store-local intelligence layer</strong> that ties anonymous
        in-store signals to POS outcomes and surfaces ranked, €-oriented actions:
      </p>
      <ol>
        <li>
          Aggregate door and engagement events on premises — no identity
        </li>
        <li>Ingest POS sale capsules (no card data)</li>
        <li>Join funnel to revenue and SKU mix</li>
        <li>Track one in-store experiment at a time with measurable lift</li>
      </ol>

      <h2>Target pilot</h2>
      <Card>
        <ul>
          <li>
            <strong>Format:</strong> ~10 m² leather boutique, Italy (owner-operated
            or 1–2 staff)
          </li>
          <li>
            <strong>Economics:</strong> High AOV (bags, jackets), seasonal tourist
            traffic, working capital in slow-moving SKUs
          </li>
          <li>
            <strong>Hardware:</strong> Door camera; existing POS; scanners only if
            SKU gap needs them
          </li>
          <li>
            <strong>Compute:</strong> Edge PC on store LAN — no cloud required for
            raw video
          </li>
        </ul>
      </Card>

      <h2>Non-goals (v1)</h2>
      <ul>
        <li>Facial recognition or cross-store shopper IDs</li>
        <li>Cloud upload of identifiable imagery</li>
        <li>Replacing POS or full WMS</li>
        <li>Analytics that do not suggest a priced owner action within a week</li>
      </ul>

      <h2>Success criteria (owner-visible €)</h2>
      <DataTable
        headers={["Measure", "Target (indicative)", "Why"]}
        rows={[
          [
            "Joined conversion (entries → POS)",
            "Tracked weekly; goal +0.5 pp in 30 days",
            "Ties analytics to revenue",
          ],
          [
            "Revenue per entrant",
            "Baseline week 1; improve or explain flat trend",
            "Single owner KPI",
          ],
          [
            "≥ 1 inventory or display action / week",
            "From desirability gap or experiment",
            "Proves ROI, not dashboards",
          ],
          [
            "Entry count vs manual tally",
            "±5% on sample days",
            "Trust in funnel numerator",
          ],
          [
            "POS sync latency",
            "< 60 s for aggregates",
            "Same-day ops use",
          ],
          [
            "Raw video retention",
            "0 days default",
            "GDPR + owner trust",
          ],
        ]}
      />
    </DocLayout>
  );
}
