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
          <strong>Pilot context:</strong> A ~10 m² leather boutique running a
          technology pilot: door-mounted vision (aggregate only), in-store
          scanners or RFID where available, and POS sales data unified for
          profit-oriented recommendations and controlled experiments.
        </p>
      </Card>

      <h2>Documentation map</h2>
      <DataTable
        headers={["Page", "Topic"]}
        rows={[
          [<Link to="/vision">Vision</Link>, "Product goals and pilot context"],
          [
            <Link to="/architecture">Architecture</Link>,
            "On-device CV, POS bridge, local aggregation",
          ],
          [
            <Link to="/metrics">Metrics</Link>,
            "Funnel definitions (look → touch → buy)",
          ],
          [
            <Link to="/privacy">Privacy & GDPR</Link>,
            "Italy/EU constraints and technical controls",
          ],
          [<Link to="/roadmap">Roadmap</Link>, "Phased delivery"],
          [<Link to="/dashboard">Dashboard</Link>, "Operator UI prototype"],
        ]}
      />

      <h2>Phase 1 deliverable</h2>
      <p>
        Combine <strong>indoor door camera aggregates</strong> with{" "}
        <strong>normalized POS events</strong> so operators can answer:
      </p>
      <ul>
        <li>How many people entered vs bounced?</li>
        <li>
          Of entrants, how many engaged with product vs purchased?
        </li>
        <li>Which SKUs get attention but under-convert?</li>
        <li>What layout experiments might lift margin?</li>
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
