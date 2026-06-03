import { Link } from "react-router-dom";
import { Card, DataTable, Tag } from "../components/DocPrimitives";
import { DocLayout } from "../components/DocLayout";

export function RoiPage() {
  return (
    <DocLayout
      title="Business value & ROI"
      subtitle="What to build first for a ~10 m² Italian leather boutique — ranked by profit impact, not technical novelty"
      footer={<Link to="/roadmap">Next: Delivery roadmap →</Link>}
    >
      <Card variant="ok">
        <p>
          <strong>How to read this page:</strong> Every initiative below is scored
          for the pilot store as a <em>small luxury retailer</em> — high unit
          margin, tiny floor, limited staff, inventory tied up in few SKUs, and
          revenue driven by conversion and average order value (AOV), not
          footfall alone. Build and operator time should go to levers that move
          euros on the P&amp;L first.
        </p>
      </Card>

      <h2>Store economics (pilot assumptions)</h2>
      <p>
        Indicative ranges for planning — replace with the owner&apos;s actuals
        during onboarding:
      </p>
      <DataTable
        headers={["Assumption", "Indicative range", "Why it matters"]}
        rows={[
          [
            "Average order value (AOV)",
            "€180–€450",
            "One extra sale per week ≈ €10k–€23k/year",
          ],
          [
            "Gross margin on leather goods",
            "55–70%",
            "Slow movers tie up cash; repricing/positioning has outsized impact",
          ],
          [
            "Daily entries (urban boutique)",
            "25–80",
            "Small % conversion lift compounds across days",
          ],
          [
            "Staff on floor",
            "1–2",
            "Insights must be actionable in minutes, not analyst hours",
          ],
          [
            "Sellable SKUs on floor",
            "15–40",
            "Each dead SKU is high € trapped in ~10 m²",
          ],
        ]}
      />

      <h2>Profit formula (what we optimize)</h2>
      <pre>{`Daily gross profit ≈ Entries × Conversion × AOV × Margin%
              + Upsell uplift − Carrying cost of slow SKUs`}</pre>
      <p>
        Analytics should directly improve <strong>conversion</strong>,{" "}
        <strong>AOV</strong>, <strong>margin on mix</strong>, or{" "}
        <strong>inventory turns</strong>. Footfall counts alone are a leading
        indicator; joined POS data is where ROI appears.
      </p>

      <h2>Project priority matrix (financial ROI)</h2>
      <p>
        Ranked for the Italian leather pilot. &quot;Impact&quot; is annualized
        profit potential at pilot scale; &quot;Effort&quot; is build + store
        setup burden.
      </p>
      <DataTable
        headers={[
          "Rank",
          "Initiative",
          "€ lever",
          "Impact",
          "Effort",
          "Delivery",
        ]}
        rows={[
          [
            "1",
            "Door entries + POS join (conversion funnel)",
            "Conversion %",
            "Very high",
            "Medium",
            <Tag phase="p1" />,
          ],
          [
            "2",
            "Desirability gap (attention without sale by SKU)",
            "Margin / inventory turns",
            "Very high",
            "Medium",
            <Tag phase="p2" />,
          ],
          [
            "3",
            "Upsell & basket patterns (pairs, care kits, belts)",
            "AOV",
            "High",
            "Low (needs POS)",
            <Tag phase="p2" />,
          ],
          [
            "4",
            "Window funnel (pass-by → look-in → enter)",
            "Entries (top of funnel)",
            "Very high",
            "High",
            <Tag phase="p3" />,
          ],
          [
            "5",
            "Bounce & dwell at door (greeting / layout)",
            "Conversion (micro)",
            "Medium",
            "Low",
            <Tag phase="p1" />,
          ],
          [
            "6",
            "Experiment registry (display, price tests)",
            "Compound uplift",
            "Medium",
            "Low",
            <Tag phase="p2" />,
          ],
          [
            "7",
            "Hourly staffing / peak maps",
            "Labor vs revenue",
            "Medium",
            "Low",
            <Tag phase="p1" />,
          ],
          [
            "—",
            "GDPR / DPIA / privacy controls",
            "Risk & trust (enabler)",
            "Required",
            "Medium",
            "Gate for M4",
          ],
        ]}
      />

      <h2>Why this order for Italy</h2>
      <ul>
        <li>
          <strong>POS + door first:</strong> Without knowing{" "}
          <em>entries → purchases</em>, the owner cannot quantify conversion or
          justify display changes. This is the cheapest path to weekly €
          decisions (hours to staff, which days underperform).
        </li>
        <li>
          <strong>SKU attention before window CV:</strong> In a 10 m² shop,
          most revenue is decided <em>inside</em> — which bag got touched but not
          bought. Freeing one slow €800 SKU matters more than counting extra
          passers-by until baseline conversion is measured.
        </li>
        <li>
          <strong>Window funnel when baseline exists:</strong> Italian high-street
          locations can have large pass-by volume; outdoor CV is higher effort
          (second camera, weather, calibration). ROI is huge but only measurable
          once in-store conversion and AOV are on the dashboard.
        </li>
      </ul>

      <h2>Illustrative € scenarios (not guarantees)</h2>
      <DataTable
        headers={["Change", "Mechanism", "Illustrative annual upside"]}
        rows={[
          [
            "+1 sale/week",
            "Conversion +0.3 pp on ~50 entries/day",
            "€9k–€23k gross revenue (margin-dependent)",
          ],
          [
            "+€40 AOV",
            "Upsell on 3 sales/day, 250 trading days",
            "€30k gross revenue",
          ],
          [
            "Clear 2 slow SKUs",
            "Reposition or markdown; recycle cash",
            "€1.5k–€4k margin recovered + working capital",
          ],
          [
            "+5% window enter rate",
            "Display test on busy street (after baseline)",
            "Depends on pass-by; often largest lever in Italy urban pilots",
          ],
        ]}
      />
      <p className="subtitle">
        Replace assumptions with store books; use experiments to prove causality,
        not dashboards alone.
      </p>

      <h2>What to deprioritize (low ROI for v1)</h2>
      <ul>
        <li>Cross-store shopper identity or loyalty graphing</li>
        <li>Cloud video archive or heatmaps with PII risk</li>
        <li>Generic &quot;AI recommendations&quot; without SKU-level join to POS</li>
        <li>Real-time alerts for every metric — owners need weekly actions</li>
      </ul>

      <h2>Operator weekly ritual (15 min)</h2>
      <ol>
        <li>Conversion vs prior week (entries, purchases, bounce)</li>
        <li>Top desirability-gap SKUs — repricing, pairing, or window feature</li>
        <li>One experiment: hypothesis, start date, success = € or conversion</li>
      </ol>

      <h2>Maps to delivery</h2>
      <p>
        Technical phases in the <Link to="/roadmap">Roadmap</Link> follow this
        financial order. Milestones M1–M3 exist to unlock rank #1; M4 is live
        pilot with privacy sign-off, not new features.
      </p>
    </DocLayout>
  );
}
