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
          KPI; moves daily gross profit directly
        </li>
        <li>
          <strong>Revenue per entry</strong> = basket total / entries — combines
          conversion and AOV
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
          ["Zone dwell", "Interest without touch", "Staffing / demo"],
          ["Desirability gap", "High attention, low conversion", "Markdown / pair"],
          ["Upsell opportunity", "Single-category baskets vs pairs", "AOV"],
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
