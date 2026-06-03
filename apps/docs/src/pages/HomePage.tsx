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
          <strong>Start here for build order:</strong>{" "}
          <Link to="/roi">Business value &amp; ROI</Link> — initiatives ranked by
          € impact for the Italy leather boutique. Commercial framing:{" "}
          <Link to="/business-plan">Business plan</Link>.
        </p>
      </Card>

      <h2>Highest-ROI work (ranks 1–3)</h2>
      <DataTable
        headers={["Rank", "Deliverable", "Why it wins for a 10 m² leather shop"]}
        rows={[
          [
            "1",
            "Door + POS join",
            "Conversion and revenue per entrant — without this, no weekly € decisions",
          ],
          [
            "2",
            "Desirability gap by SKU",
            "One slow €800 bag ties cash in ~10 m²; attention-without-sale is the signal",
          ],
          [
            "3",
            "Upsell / basket patterns",
            "Belts and care kits lift AOV without more street traffic",
          ],
        ]}
      />
      <p>
        Full matrix, monthly € math, and deprioritized features:{" "}
        <Link to="/roi">ROI page</Link>. Delivery phases:{" "}
        <Link to="/roadmap">Roadmap</Link>.
      </p>

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
