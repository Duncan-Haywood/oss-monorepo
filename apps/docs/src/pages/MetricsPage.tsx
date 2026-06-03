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
        headers={["KPI", "Formula", "€ decision it drives"]}
        rows={[
          [
            "Conversion",
            "purchases / entries",
            "Greeting, hero SKU, pricing — lifts revenue without more traffic",
          ],
          [
            "Revenue per entrant",
            "Σ sale total / entries",
            "Single number for “was today worth opening?”",
          ],
          [
            "Average basket (AOV)",
            "Σ sale total / purchases",
            "Upsell belts, care kits, wallets with bags",
          ],
          [
            "Margin proxy",
            "Use POS category margin % × revenue (if available)",
            "Prefer margin over raw revenue when comparing experiments",
          ],
          [
            "Desirability gap",
            "High touches or dwell, low SKU conversion",
            "Markdown, bundle, or remove dead stock",
          ],
        ]}
      />

      <h2>Store funnel (phase 1)</h2>
      <DataTable
        headers={["Metric", "Definition", "Source"]}
        rows={[
          ["Entry", "Inward door line cross + dwell inside", "Door CV"],
          ["Exit", "Outward line cross after entry", "Door CV"],
          ["Bounce", "Entry + exit within T without zone dwell", "CV"],
          ["Engaged visit", "Entry + product zone activation", "CV / scanner"],
          ["Purchase", "POS basket in visit window", "POS"],
        ]}
      />

      <h2>Derived rates</h2>
      <ul>
        <li>
          <strong>Conversion</strong> = purchases / entries
        </li>
        <li>
          <strong>Engagement rate</strong> = engaged / entries
        </li>
        <li>
          <strong>Touch-to-buy</strong> = purchases with SKU / touches for SKU
        </li>
        <li>
          <strong>Bounce rate</strong> = bounces / entries — short visits in a
          10 m² room often mean display or price shock
        </li>
      </ul>

      <h2>Product metrics</h2>
      <DataTable
        headers={["Metric", "Use (€)"]}
        rows={[
          ["Touch count by SKU", "Heat → promote winners"],
          ["Zone dwell", "Interest without touch → layout"],
          ["Desirability gap", "Working capital risk → act in 14 days"],
          ["Upsell opportunity", "Single-category baskets → staff script"],
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
