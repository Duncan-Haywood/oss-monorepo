import { Link } from "react-router-dom";
import { Card, DataTable } from "../components/DocPrimitives";
import { DocLayout } from "../components/DocLayout";

export function VisionPage() {
  return (
    <DocLayout
      title="Product vision"
      subtitle="Optimize profit and sales in micro-format retail without surveillance capitalism"
      footer={<Link to="/roi">Next: Business value &amp; ROI →</Link>}
    >
      <h2>Problem</h2>
      <p>
        Small luxury retail has thin margins and limited staff. Operators lack
        feedback on window conversion, attention without sales, upsell gaps, and
        whether display changes move revenue.
      </p>

      <h2>Solution</h2>
      <p>A <strong>store-local intelligence layer</strong> that:</p>
      <ol>
        <li>
          Runs CV on premises, emitting only aggregated, non-identifying
          statistics
        </li>
        <li>Ingests POS data capsules (no card data)</li>
        <li>Joins engagement with sales for funnel analytics</li>
        <li>Suggests and tracks simple in-store experiments</li>
      </ol>

      <h2>Target pilot</h2>
      <Card>
        <ul>
          <li>
            <strong>Format:</strong> ~10 m² leather boutique, Italy
          </li>
          <li>
            <strong>Hardware:</strong> Door camera; optional scanners; existing
            POS
          </li>
          <li>
            <strong>Compute:</strong> Edge PC on store LAN — no cloud required
            for raw video
          </li>
        </ul>
      </Card>

      <h2>Non-goals (v1)</h2>
      <ul>
        <li>Facial recognition or cross-store shopper IDs</li>
        <li>Cloud upload of identifiable imagery</li>
        <li>Replacing POS or full WMS</li>
      </ul>

      <h2>Success criteria (business-first)</h2>
      <DataTable
        headers={["Measure", "Target (indicative)", "Why"]}
        rows={[
          [
            "Joined conversion (entries → POS)",
            "Stable weekly trend; owner cites in decisions",
            "Ties analytics to revenue",
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
          [
            "Weekly experiment",
            "≥ 1 with € or conversion success metric",
            "Proves ROI, not dashboards",
          ],
        ]}
      />
    </DocLayout>
  );
}
