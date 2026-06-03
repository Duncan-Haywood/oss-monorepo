import { Link } from "react-router-dom";
import { Card, DataTable, Tag } from "../components/DocPrimitives";
import { DocLayout } from "../components/DocLayout";

export function RoadmapPage() {
  return (
    <DocLayout
      title="Roadmap"
      subtitle="Delivery phases aligned to financial ROI for the leather boutique pilot"
      footer={<Link to="/">← Back to home</Link>}
    >
      <Card>
        <p>
          Phases are ordered by <strong>profit impact per euro of build</strong>,
          not by sensor novelty. See{" "}
          <Link to="/roi">Business value &amp; ROI</Link> for rankings and
          illustrative € scenarios.
        </p>
      </Card>

      <h2>
        Phase 1 — Conversion foundation <Tag phase="p1" />
      </h2>
      <p>
        <strong>Financial goal:</strong> Answer &quot;how many entered, how many
        bought, and when?&quot; — unlocks conversion %, bounce, and labor
        alignment.
      </p>
      <ul>
        <li>Door line-crossing counts (entries / exits / bounce)</li>
        <li>POS adapter (one vendor) → normalized baskets</li>
        <li>SQLite + daily rollups; join funnel in TypeScript</li>
        <li>LAN dashboard: entries, purchases, conversion (M3)</li>
      </ul>
      <p>
        <em>ROI rank:</em> #1 — required before any SKU or window work pays off.
      </p>

      <h2>
        Phase 2 — Margin &amp; AOV <Tag phase="p2" />
      </h2>
      <p>
        <strong>Financial goal:</strong> Recover margin on slow SKUs and lift
        basket size (belts, care, small leather goods with bags).
      </p>
      <ul>
        <li>Fixture zones / scanner events → touch &amp; dwell by SKU</li>
        <li>Desirability gap: high attention, low conversion</li>
        <li>Upsell signals from basket category pairs</li>
        <li>Experiment registry with € or conversion success criteria</li>
      </ul>
      <p>
        <em>ROI rank:</em> #2–#3 and #6 — highest leverage inside the shop.
      </p>

      <h2>
        Phase 3 — Street &amp; display <Tag phase="p3" />
      </h2>
      <p>
        <strong>Financial goal:</strong> Turn pass-by traffic into entries
        (critical on Italian high streets once in-store baseline exists).
      </p>
      <ul>
        <li>Outdoor pass-by / look-in / enter funnel</li>
        <li>Display scheduling hooks tied to experiment outcomes</li>
      </ul>
      <p>
        <em>ROI rank:</em> #4 — build after Phase 1 metrics prove in-store
        conversion; avoids optimizing the window while blind to close rate.
      </p>

      <h2>Milestones (value-gated)</h2>
      <DataTable
        headers={["Milestone", "Exit criteria", "Business unlock"]}
        rows={[
          [
            "M0 — Repo & docs",
            "TSX docs site + CI build",
            "Team alignment on ROI order",
          ],
          [
            "M1 — POS ingest",
            "Sample SaleEvent in DB",
            "Revenue side of funnel live",
          ],
          [
            "M2 — Door counts",
            "Replay → hourly entries",
            "Traffic side of funnel live",
          ],
          [
            "M3 — Joined funnel",
            "Dashboard KPIs from SQLite API",
            "Weekly conversion decisions",
          ],
          [
            "M4 — Pilot live",
            "7 days stable; DPIA signed",
            "Owner trust → experiments with € targets",
          ],
        ]}
      />

      <h2>Explicitly later (v2+)</h2>
      <ul>
        <li>Multi-store benchmarks</li>
        <li>Weather / event overlays for tourism peaks</li>
        <li>Supplier integration — only if desirability gaps are proven</li>
      </ul>
    </DocLayout>
  );
}
