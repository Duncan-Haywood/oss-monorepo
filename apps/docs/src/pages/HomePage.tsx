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
          AOV, and margin on a small floor — not analytics for its own sake.
          Stakeholders: <Link to="/business-plan">Business plan</Link>.
          Builders: <Link to="/roi">Business value &amp; ROI</Link> for build
          order.
        </p>
      </Card>

      <h2>Documentation map</h2>
      <DataTable
        headers={["Page", "Topic"]}
        rows={[
          [
            <Link to="/business-plan">Business plan</Link>,
            "Market, pricing, GTM, unit economics, risks",
          ],
          [
            <Link to="/roi">ROI</Link>,
            "Financial priority matrix — what to build first",
          ],
          [<Link to="/vision">Vision</Link>, "Profit-oriented goals and pilot context"],
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
          [
            <Link to="/roadmap">Roadmap</Link>,
            "Phased delivery aligned to ROI",
          ],
          ["Sales portal (pnpm portal:dev)", "Secure demo UI with illustrative pilot data"],
          [<Link to="/dashboard">Dashboard</Link>, "Docs placeholder (see portal)"],
        ]}
      />

      <h2>Highest-ROI deliverable (Phase 1)</h2>
      <p>
        Combine <strong>door entry counts</strong> with{" "}
        <strong>normalized POS events</strong> so the owner can answer — in €
        terms:
      </p>
      <ul>
        <li>Conversion and revenue per entrant this week</li>
        <li>Which hours or days under-convert (staffing and greeting)</li>
        <li>Phase 2: SKUs with attention but no sale (inventory cash trap)</li>
        <li>Phase 3: Window tests once in-store close rate is known</li>
      </ul>

      <h2>Repository</h2>
      <pre>{`apps/docs/       ← TSX documentation (this site)
apps/portal/     sales demo portal (pnpm portal:dev)
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
