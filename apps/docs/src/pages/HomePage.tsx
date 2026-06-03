import { Link } from "react-router-dom";
import { Card, DataTable } from "../components/DocPrimitives";
import { DocLayout } from "../components/DocLayout";

export function HomePage() {
  return (
    <DocLayout
      title="Retail Pilot Intel"
      subtitle="Edge analytics + POS intelligence for small-format retail pilots (Italy / GDPR-first)"
    >
      <Card variant="ok">
        <p>
          <strong>Pilot context:</strong> A ~10 m² leather boutique in Italy.
          The pilot optimizes <strong>profit per visitor</strong> — conversion,
          basket margin, and cash in slow SKUs — using door aggregates and POS
          data on a store-local edge node. Build order follows{" "}
          <Link to="/priorities">financial ROI</Link>, not feature count.
        </p>
      </Card>

      <h2>Documentation map</h2>
      <DataTable
        headers={["Page", "Topic"]}
        rows={[
          [<Link to="/vision">Vision</Link>, "Profit-oriented goals and pilot context"],
          [
            <Link to="/priorities">Priorities & ROI</Link>,
            "What to build first for maximum € impact (start here for planning)",
          ],
          [
            <Link to="/architecture">Architecture</Link>,
            "On-device CV, POS bridge, local aggregation",
          ],
          [
            <Link to="/metrics">Metrics</Link>,
            "Funnel + margin-oriented KPI definitions",
          ],
          [
            <Link to="/privacy">Privacy & GDPR</Link>,
            "Italy/EU constraints and technical controls",
          ],
          [<Link to="/roadmap">Roadmap</Link>, "ROI-ordered delivery milestones"],
          [<Link to="/dashboard">Dashboard</Link>, "Operator UI prototype"],
        ]}
      />

      <h2>Phase 1 deliverable (highest ROI)</h2>
      <p>
        Combine <strong>indoor door camera aggregates</strong> with{" "}
        <strong>normalized POS events</strong> so the owner can answer — in €
        terms:
      </p>
      <ul>
        <li>What is conversion and revenue per entrant this week?</li>
        <li>Which days have traffic without sales (staffing or display issue)?</li>
        <li>Which SKUs get attention but under-convert (cash tied up)?</li>
        <li>Where is a simple upsell or layout test worth running next?</li>
      </ul>

      <h2>Repository</h2>
      <pre>{`apps/docs/       ← TSX documentation (this site)
packages/edge/   on-device vision & aggregation
packages/pos/    POS connector & event schema
packages/analytics/  rollups & reports
.github/workflows/   CI (TypeScript orchestrator)`}</pre>

      <footer>
        Private pilot documentation — not legal advice. Engage counsel for GDPR
        sign-off in Italy.
      </footer>
    </DocLayout>
  );
}
