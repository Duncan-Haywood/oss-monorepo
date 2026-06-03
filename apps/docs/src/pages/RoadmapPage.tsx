import { Link } from "react-router-dom";
import { DataTable, Tag } from "../components/DocPrimitives";
import { DocLayout } from "../components/DocLayout";

export function RoadmapPage() {
  return (
    <DocLayout
      title="Roadmap"
      subtitle="Phased delivery for leather boutique pilot"
      footer={<Link to="/">← Back to home</Link>}
    >
      <h2>
        Phase 1 — Camera + POS <Tag phase="p1" />
      </h2>
      <ul>
        <li>Door line-crossing counts</li>
        <li>POS adapter (one vendor)</li>
        <li>SQLite + daily rollups (TypeScript)</li>
        <li>LAN dashboard in docs app</li>
      </ul>

      <h2>
        Phase 2 — Product engagement <Tag phase="p2" />
      </h2>
      <ul>
        <li>Fixture zones / scanner events</li>
        <li>Desirability gap recommendations</li>
        <li>Experiment registry</li>
      </ul>

      <h2>
        Phase 3 — Window & display <Tag phase="p3" />
      </h2>
      <ul>
        <li>Outdoor pass-by / look-in / enter funnel</li>
        <li>Display scheduling hooks</li>
      </ul>

      <h2>Milestones</h2>
      <DataTable
        headers={["Milestone", "Exit criteria"]}
        rows={[
          ["M0 — Repo & docs", "TSX docs site + CI build"],
          ["M1 — POS ingest", "Sample SaleEvent in DB"],
          ["M2 — Door counts", "Replay → hourly entries"],
          ["M3 — Joined funnel", "Dashboard KPIs from SQLite API"],
          ["M4 — Pilot live", "7 days stable; DPIA signed"],
        ]}
      />
    </DocLayout>
  );
}
