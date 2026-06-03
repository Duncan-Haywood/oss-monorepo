import { Link } from "react-router-dom";
import { DataTable, Tag } from "../components/DocPrimitives";
import { DocLayout } from "../components/DocLayout";

export function RoadmapPage() {
  return (
    <DocLayout
      title="Roadmap"
      subtitle="Delivery order follows financial ROI — see Priorities for the full ranking"
      footer={<Link to="/priorities">← Priorities & ROI</Link>}
    >
      <p>
        Phases below are <strong>reordered by € impact</strong> for the leather
        boutique pilot, not by sensor novelty. Technical phase tags (P1–P3)
        remain for engineering traceability.
      </p>

      <h2>
        Now — Revenue baseline <Tag phase="p1" />
      </h2>
      <p>
        <strong>ROI ranks 1–4.</strong> Without POS + door conversion, no other
        feature pays for itself.
      </p>
      <ul>
        <li>POS adapter (one vendor) → normalized SaleEvent</li>
        <li>Door line-crossing counts → entries / bounces</li>
        <li>SQLite daily rollups + conversion & revenue-per-visitor KPIs</li>
        <li>LAN dashboard — owner checks one number: € per entrant</li>
      </ul>

      <h2>
        Next — Margin & inventory <Tag phase="p2" />
      </h2>
      <p>
        <strong>ROI ranks 2–3, 6.</strong> Only after baseline KPIs are trusted
        for 7+ days.
      </p>
      <ul>
        <li>SKU-level desirability gap (attention vs purchase)</li>
        <li>Basket mix / upsell prompts (single-category vs pairs)</li>
        <li>Experiment registry — one in-store change, measured outcome</li>
        <li>Optional fixture zones or scanners if SKU attribution is too coarse</li>
      </ul>

      <h2>
        Later — Street & display <Tag phase="p3" />
      </h2>
      <p>
        <strong>ROI ranks 7–8.</strong> Defer unless owner confirms pass-by traffic
        is the bottleneck (common in larger frontage, rare in ~10 m²).
      </p>
      <ul>
        <li>Outdoor pass-by / look-in / enter funnel</li>
        <li>Display scheduling hooks tied to conversion experiments</li>
      </ul>

      <h2>Milestones (financial exit criteria)</h2>
      <DataTable
        headers={["Milestone", "ROI focus", "Exit criteria"]}
        rows={[
          [
            "M0 — Repo & docs",
            "Enablement",
            "TSX docs site + CI; Priorities page agreed with owner",
          ],
          [
            "M1 — POS ingest",
            "Rank 1, 3",
            "Daily revenue & SKU mix in DB; &lt; 60 s lag",
          ],
          [
            "M2 — Door counts",
            "Rank 1, 4, 5",
            "Replay → hourly entries; ±5% vs manual tally",
          ],
          [
            "M3 — Joined funnel",
            "Rank 1–5",
            "Dashboard shows conversion; owner names one € action/week",
          ],
          [
            "M4 — Pilot live",
            "Compliance gate",
            "7 days stable; DPIA signed; no PII retention",
          ],
          [
            "M5+ — Zones / window",
            "Rank 7–8",
            "Only if M3 KPIs plateau; experiment shows lift",
          ],
        ]}
      />
    </DocLayout>
  );
}
