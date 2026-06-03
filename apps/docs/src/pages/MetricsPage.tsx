import { Link } from "react-router-dom";
import { DataTable } from "../components/DocPrimitives";
import { DocLayout } from "../components/DocLayout";

export function MetricsPage() {
  return (
    <DocLayout
      title="Metrics & funnels"
      subtitle="Definitions for footfall, engagement, and commerce — all aggregate"
      footer={<Link to="/privacy">Next: Privacy & GDPR →</Link>}
    >
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
      </ul>

      <h2>Product metrics</h2>
      <DataTable
        headers={["Metric", "Use"]}
        rows={[
          ["Touch count by SKU", "Merchandising heat"],
          ["Zone dwell", "Interest without touch"],
          ["Desirability gap", "High attention, low conversion"],
          ["Upsell opportunity", "Single-category baskets vs pairs"],
        ]}
      />

      <h2>Time bucketing</h2>
      <p>
        Default: 5m (live), 1h (ops), 1d (owner). Align POS to{" "}
        <code>Europe/Rome</code>.
      </p>
    </DocLayout>
  );
}
