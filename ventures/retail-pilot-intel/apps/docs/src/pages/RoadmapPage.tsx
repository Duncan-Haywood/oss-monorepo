import { Link } from "react-router-dom";
import { Card, DataTable, Tag } from "../components/DocPrimitives";
import { DocLayout } from "../components/DocLayout";

export function RoadmapPage() {
  return (
    <DocLayout
      title="Roadmap"
      subtitle="Delivery phases aligned to financial ROI for the leather boutique pilot"
      footer={<Link to="/roi">← Business value & ROI</Link>}
    >
      <Card>
        <p>
          Phases are ordered by <strong>profit impact per euro of build</strong>,
          not by sensor novelty. See{" "}
          <Link to="/roi">Business value &amp; ROI</Link> for rankings and
          illustrative € scenarios.
        </p>
        <p>
          <strong>Current priority:</strong> deploy the surfaces that already
          exist (docs site, portal demo) to a public URL before starting
          Phase 2 sensors or another unshipped package. A built page nobody
          can open does not produce the Phase 1 KPIs. The owner flip for
          Pages / Vercel is already queued as <code>deploy-settings</code> —
          do not open a second ask.
        </p>
      </Card>

      <h2>
        Phase 1 — Conversion foundation <Tag phase="p1" />
      </h2>
      <p>
        <strong>Financial goal:</strong> Answer how many entered, how many bought,
        and when — unlocks conversion %, bounce, revenue per entrant, and labor
        alignment. <em>ROI ranks 1, 4, 5.</em>{" "}
        <strong>Indicative upside:</strong> €8k–€23k/year from +1 sale/week or
        €1.4k–€2.4k OpEx from smarter hours.
      </p>
      <ul>
        <li>Door line-crossing counts (entries / exits / bounce)</li>
        <li>POS adapter (one vendor) → normalized baskets</li>
        <li>SQLite + daily rollups; join funnel in TypeScript</li>
        <li>LAN dashboard: entries, purchases, conversion, €/entrant proxy</li>
      </ul>

      <h2>
        Phase 2 — Margin &amp; AOV <Tag phase="p2" />
      </h2>
      <p>
        <strong>Financial goal:</strong> Recover margin on slow SKUs and lift
        basket size. Only after Phase 1 KPIs are trusted for 7+ days.{" "}
        <em>ROI ranks 2–3, 6–7.</em>{" "}
        <strong>Indicative upside:</strong> €1.5k–€6k margin + cash from clearing
        dead stock; €6k–€18k/year from +€25 AOV on daily sales.
      </p>
      <ul>
        <li>Fixture zones / scanner events → touch &amp; dwell by SKU (if needed)</li>
        <li>Desirability gap: high attention, low conversion</li>
        <li>Upsell signals from basket category pairs</li>
        <li>Experiment registry with € or conversion success criteria</li>
      </ul>

      <h2>
        Phase 3 — Street &amp; display <Tag phase="p3" />
      </h2>
      <p>
        <strong>Financial goal:</strong> Turn pass-by traffic into entries on
        Italian high streets — <em>ROI rank 8</em>, after in-store baseline exists.
        <strong> Gate:</strong> Do not start until rank 1 conversion is tracked for
        14+ days and the owner confirms pass-by — not close rate — is the
        bottleneck.
      </p>
      <ul>
        <li>Outdoor pass-by / look-in / enter funnel</li>
        <li>Display scheduling hooks tied to experiment outcomes</li>
      </ul>

      <h2>Do not start yet (low ROI until M3)</h2>
      <ul>
        <li>
          <strong>Window / outdoor CV</strong> — ROI rank 8; needs a trusted
          conversion baseline from Phase 1
        </li>
        <li>
          <strong>RFID / extra scanners</strong> — rank 7; only if desirability
          gaps cannot be inferred from POS + door
        </li>
        <li>
          <strong>Multi-store benchmarks</strong> — no € proof at a single pilot
        </li>
      </ul>

      <h2>Milestones (value-gated)</h2>
      <DataTable
        headers={["Milestone", "ROI focus", "Exit criteria", "Business unlock"]}
        rows={[
          [
            "M0 — Repo & docs",
            "Enablement",
            "TSX docs site + CI; ROI page agreed with owner",
            "Team alignment on build order",
          ],
          [
            "M1 — POS ingest",
            "Rank 1, 3",
            "Daily revenue & SKU mix in DB; &lt; 60 s lag",
            "Revenue side of funnel live",
          ],
          [
            "M2 — Door counts",
            "Rank 1, 4, 5",
            "Replay → hourly entries; ±5% vs manual tally",
            "Traffic side of funnel live",
          ],
          [
            "M3 — Joined funnel",
            "Rank 1–5",
            "Dashboard KPIs; owner names one € action/week",
            "Weekly conversion decisions",
          ],
          [
            "M4 — Pilot live",
            "Compliance gate",
            "7 days stable; DPIA signed; no PII retention",
            "Owner trust → experiments with € targets",
          ],
          [
            "M5+ — Zones / window",
            "Rank 7–8",
            "Only if M3 plateaus; experiment shows lift",
            "Street or SKU precision upgrades",
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
