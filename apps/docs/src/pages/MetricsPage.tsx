import { Link } from "react-router-dom";
import { DataTable } from "../components/DocPrimitives";
import { DocLayout } from "../components/DocLayout";

export function MetricsPage() {
  return (
    <DocLayout
      title="Metrics & funnels"
      subtitle="Aggregate definitions — ordered by owner € decisions, not data novelty"
      footer={<Link to="/privacy">Next: Privacy & GDPR →</Link>}
    >
      <h2>Owner KPIs (check these first)</h2>
      <DataTable
        headers={["KPI", "Formula", "ROI rank", "€ decision it drives"]}
        rows={[
          [
            "Conversion",
            "purchases / entries",
            "1",
            "Greeting, hero SKU, pricing — lifts revenue without more traffic",
          ],
          [
            "Revenue per entrant",
            "Σ sale total / entries",
            "1",
            "Single number for “was today worth opening?”",
          ],
          [
            "Average basket (AOV)",
            "Σ sale total / purchases",
            "3",
            "Upsell belts, care kits, wallets with bags",
          ],
          [
            "Margin proxy",
            "POS category margin % × revenue (if available)",
            "2",
            "Prefer margin over raw revenue in experiments",
          ],
          [
            "Desirability gap",
            "High touches or dwell, low SKU conversion",
            "2",
            "Markdown, bundle, or remove dead stock in 14 days",
          ],
        ]}
      />

      <h2>Store funnel (phase 1)</h2>
      <DataTable
        headers={["Metric", "Definition", "Source", "€ lever"]}
        rows={[
          ["Entry", "Inward door line cross + dwell inside", "Door CV", "Funnel top"],
          ["Exit", "Outward line cross after entry", "Door CV", "—"],
          ["Bounce", "Entry + exit within T without zone dwell", "CV", "Conversion loss"],
          ["Engaged visit", "Entry + product zone activation", "CV / scanner", "Close rate"],
          ["Purchase", "POS basket in visit window", "POS", "Revenue"],
        ]}
      />

      <h2>Derived rates (prioritized)</h2>
      <ol>
        <li>
          <strong>Conversion</strong> = purchases / entries — primary Phase 1
          KPI
        </li>
        <li>
          <strong>Revenue per entry</strong> = basket total / entries — combines
          conversion and AOV
        </li>
        <li>
          <strong>Bounce rate</strong> = bounces / entries — short visits in 10 m²
          often mean display or price shock
        </li>
        <li>
          <strong>Engagement rate</strong> = engaged / entries — leading indicator
          before Phase 2 SKU data
        </li>
        <li>
          <strong>Touch-to-buy</strong> = purchases with SKU / touches for SKU —
          Phase 2 margin lever
        </li>
      </ol>

      <h2>Product metrics (phase 2+)</h2>
      <DataTable
        headers={["Metric", "Use", "€ lever"]}
        rows={[
          ["Touch count by SKU", "Merchandising heat", "Placement"],
          ["Zone dwell", "Interest without touch", "Layout / demo"],
          ["Desirability gap", "High attention, low conversion", "Working capital"],
          ["Upsell opportunity", "Single-category baskets", "AOV / staff script"],
        ]}
      />

      <h2>Time bucketing</h2>
      <p>
        Default: 5m (live), 1h (ops), 1d (owner). Align POS to{" "}
        <code>Europe/Rome</code>. Compare weeks with Italian retail seasonality
        (tourist peaks, Christmas gifting) before calling an experiment failed.
      </p>
    </DocLayout>
  );
}
