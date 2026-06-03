import { Link } from "react-router-dom";
import { Card, DataTable } from "../components/DocPrimitives";
import { DocLayout } from "../components/DocLayout";

/**
 * Initiative ranking for a ~10 m² leather boutique in Italy.
 * Order = expected € impact per unit of build/operating cost (not technical phase).
 */
export function PrioritiesPage() {
  return (
    <DocLayout
      title="Priorities & ROI"
      subtitle="What to build first for the leather boutique — ranked by financial value, not feature novelty"
      footer={<Link to="/roadmap">Next: Roadmap (delivery order) →</Link>}
    >
      <Card variant="ok">
        <p>
          <strong>Decision rule:</strong> Ship capabilities that change revenue,
          margin, or cash tied up in stock before capabilities that only add
          descriptive analytics. Compliance (GDPR/DPIA) is a gate to go-live, not
          a substitute for profit metrics.
        </p>
      </Card>

      <h2>How we score ROI</h2>
      <p>
        Each initiative is ranked on four lenses that matter in a high-ticket,
        low-footprint leather shop:
      </p>
      <DataTable
        headers={["Lens", "Question", "Why it matters in Italy"]}
        rows={[
          [
            "Revenue leverage",
            "Does this move conversion or basket size?",
            "One extra bag sale/week at €250–€600 AOV dwarfs many analytics costs.",
          ],
          [
            "Margin & cash",
            "Does this free margin or reduce dead stock?",
            "Seasonal leather inventory ties working capital; slow SKUs hurt liquidity.",
          ],
          [
            "Operating cost",
            "Does this cut wasted labor or ad spend?",
            "Owner-operated boutiques pay for hours whether the door is busy or not.",
          ],
          [
            "Time to proof",
            "Can the owner see € impact within ~2 weeks?",
            "Pilots fail when insight arrives after the buying season ends.",
          ],
        ]}
      />

      <h2>Ranked initiatives (highest ROI first)</h2>
      <DataTable
        headers={[
          "Rank",
          "Initiative",
          "Primary € lever",
          "Build cost",
          "Owner action",
        ]}
        rows={[
          [
            "1",
            "POS ingest + entry→purchase conversion baseline",
            "Revenue — know true conversion and revenue per visitor",
            "Low (one POS adapter)",
            "Compare days with traffic but no sales; test greeting or hero SKU placement",
          ],
          [
            "2",
            "Desirability gap by SKU (attention without sale)",
            "Cash — markdown, bundle, or reposition before season ends",
            "Medium (needs engagement signal or POS line items)",
            "Kill or promote SKUs with high touches and zero baskets in 14 days",
          ],
          [
            "3",
            "Basket composition & upsell opportunities",
            "Margin — belts, care kits, wallets with bags",
            "Low once POS normalized",
            "Train staff on pair prompts when single-category baskets dominate",
          ],
          [
            "4",
            "Hourly traffic vs sales (staffing & hours)",
            "OpEx — align open hours and presence with paying traffic",
            "Low (door counts + POS rollups)",
            "Close quiet windows or extend high-conversion slots (tourist peaks)",
          ],
          [
            "5",
            "Bounce & short-visit diagnostics",
            "Revenue — fix first 10 seconds in a 10 m² room",
            "Low (door dwell rules)",
            "Adjust window hero, price visibility, or welcome script",
          ],
          [
            "6",
            "Experiment registry (one change at a time)",
            "Revenue — attribute lifts to layout/pricing tests",
            "Low after baseline KPIs exist",
            "Run 7-day A/B on display or bundle; keep winner",
          ],
          [
            "7",
            "Fixture zones / RFID or scanners",
            "Margin — finer SKU attribution",
            "Higher (hardware + install)",
            "Defer until ranks 1–3 prove value; use manual SKU tags in pilot if needed",
          ],
          [
            "8",
            "Outdoor window funnel (pass-by → enter)",
            "Revenue — only if street traffic is the bottleneck",
            "Higher (second camera, tuning)",
            "Last in a micro-store where most buyers already step inside",
          ],
        ]}
      />

      <h2>Illustrative € math (pilot assumptions)</h2>
      <p>
        Numbers are indicative for planning — calibrate with the store’s real AOV
        and footfall after week one of data.
      </p>
      <DataTable
        headers={["Scenario", "Assumption", "Monthly € upside (order of magnitude)"]}
        rows={[
          [
            "Conversion +0.5 pp",
            "40 entries/day, 8% → 8.5% conversion, €350 AOV",
            "~€210/month (1–2 extra bags)",
          ],
          [
            "AOV +€25 via upsell",
            "12 purchases/day attach care kit or belt",
            "~€300/month",
          ],
          [
            "One slow SKU cleared",
            "€800 COGS bag held 60 days → cash back + avoid markdown",
            "€800 one-time + margin preserved",
          ],
          [
            "Labor 4 h/week saved",
            "Owner not staffing dead Tuesday mornings",
            "~€120–€200/month at Italian labor cost",
          ],
        ]}
      />
      <p className="stub">
        Rank 1–3 typically beat rank 7–8 on ROI because they use data you already
        have (POS + door) before new sensors.
      </p>

      <h2>Explicitly deprioritize (v1)</h2>
      <ul>
        <li>
          <strong>Multi-vendor POS</strong> — second adapter only after one
          vendor proves daily owner use.
        </li>
        <li>
          <strong>Cloud dashboards with PII</strong> — no revenue lift; adds GDPR
          risk and cost.
        </li>
        <li>
          <strong>Facial recognition / cross-visit IDs</strong> — illegal or
          toxic trust risk; irrelevant to basket size in a 10 m² shop.
        </li>
        <li>
          <strong>Real-time ML recommendations on device</strong> — ship
          rule-based insights first; model when experiment log exists.
        </li>
      </ul>

      <h2>Map to delivery milestones</h2>
      <DataTable
        headers={["Milestone", "ROI rank served", "Financial proof"]}
        rows={[
          ["M1 — POS ingest", "1, 3", "Revenue per day and SKU mix visible"],
          ["M2 — Door counts", "1, 4, 5", "Conversion = purchases / entries"],
          ["M3 — Joined funnel", "1–5", "Weekly owner note: one € action taken"],
          ["M4 — Pilot live 7d", "All above", "DPIA signed; no compliance block on selling"],
          ["M5+ — Zones / window", "7–8", "Only if ranks 1–3 plateau"],
        ]}
      />

      <Card variant="warn">
        <p>
          <strong>Italy-specific:</strong> Price tags include IVA; owner decisions
          should use <em>margin</em> and <em>cash recovery</em>, not footfall
          alone. Align reports to <code>Europe/Rome</code> and tourist season
          (Easter, summer, Christmas) when setting experiment windows.
        </p>
      </Card>
    </DocLayout>
  );
}
