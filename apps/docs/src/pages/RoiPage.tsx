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
          <strong>Decision rule:</strong> Ship capabilities that change revenue,
          margin, or cash tied up in stock before capabilities that only add
          descriptive analytics. Compliance (GDPR/DPIA) is a gate to go-live, not
          a substitute for profit metrics. Every initiative below is scored for a{" "}
          <em>small luxury retailer</em> — high unit margin, tiny floor, limited
          staff, and revenue driven by conversion and AOV, not footfall alone.
        </p>
      </Card>

      <h2>Build these three first (highest ROI)</h2>
      <p>
        If engineering or pilot time is constrained, stop after these — they use
        door + POS only and typically pay back a Core subscription (€149–€249/mo)
        with one incremental sale per month at pilot AOV.
      </p>
      <DataTable
        headers={["Rank", "Initiative", "Owner sees within ~2 weeks", "Primary € lever"]}
        rows={[
          [
            "1",
            "Door entries + POS join",
            "Conversion % and revenue per entrant vs last week",
            "Revenue — every staffing and greeting decision",
          ],
          [
            "2",
            "Desirability gap by SKU",
            "SKUs with attention but no sale in 14 days",
            "Cash — markdown, bundle, or reposition before season ends",
          ],
          [
            "3",
            "Basket composition & upsell",
            "Single-category baskets (bag without belt/care kit)",
            "Margin — AOV without more footfall",
          ],
        ]}
      />
      <p className="stub">
        Ranks 4–8 and compliance gates are below. Outdoor window CV stays last
        unless the owner proves pass-by — not in-store conversion — is the
        bottleneck.
      </p>

      <h2>How we score ROI</h2>
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
        <strong>inventory turns</strong>. Joined POS data is where ROI appears;
        footfall alone is only a leading indicator.
      </p>

      <h2>Project priority matrix (financial ROI)</h2>
      <p>
        Ranked for the leather pilot at ~10 m². Window/street work is{" "}
        <strong>last</strong> unless the owner proves pass-by is the bottleneck —
        in a micro-store, most € is decided inside.
      </p>
      <DataTable
        headers={[
          "Rank",
          "Initiative",
          "€ lever",
          "Impact",
          "Effort",
          "Owner action",
          "Delivery",
        ]}
        rows={[
          [
            "1",
            "Door entries + POS join (conversion funnel)",
            "Conversion %",
            "Very high",
            "Medium",
            "Compare low-conversion days; test greeting or hero SKU",
            <Tag phase="p1" />,
          ],
          [
            "2",
            "Desirability gap (attention without sale by SKU)",
            "Margin / inventory turns",
            "Very high",
            "Medium",
            "Markdown, bundle, or reposition in 14 days",
            <Tag phase="p2" />,
          ],
          [
            "3",
            "Upsell & basket patterns (pairs, care kits, belts)",
            "AOV",
            "High",
            "Low",
            "Staff script when single-category baskets dominate",
            <Tag phase="p2" />,
          ],
          [
            "4",
            "Hourly traffic vs sales (staffing & hours)",
            "Labor vs revenue",
            "Medium",
            "Low",
            "Close dead mornings or extend tourist peaks",
            <Tag phase="p1" />,
          ],
          [
            "5",
            "Bounce & dwell at door (greeting / layout)",
            "Conversion (micro)",
            "Medium",
            "Low",
            "Fix first 10 seconds in the room",
            <Tag phase="p1" />,
          ],
          [
            "6",
            "Experiment registry (display, price tests)",
            "Compound uplift",
            "Medium",
            "Low",
            "One 7-day test; success = € or conversion",
            <Tag phase="p2" />,
          ],
          [
            "7",
            "Fixture zones / RFID or scanners",
            "Finer SKU attribution",
            "Medium",
            "Higher",
            "Defer until ranks 1–3 prove value",
            <Tag phase="p2" />,
          ],
          [
            "8",
            "Window funnel (pass-by → look-in → enter)",
            "Entries (top of funnel)",
            "High*",
            "High",
            "Only after in-store conversion baseline exists",
            <Tag phase="p3" />,
          ],
          [
            "—",
            "GDPR / DPIA / privacy controls",
            "Risk & trust (enabler)",
            "Required",
            "Medium",
            "Sign-off before M4 go-live",
            "Gate",
          ],
        ]}
      />
      <p className="stub">
        *Window impact can be huge on Italian high streets but is rank 8 here
        because it is expensive to build and impossible to interpret without
        in-store close rate (rank 1).
      </p>

      <h2>Why this order for Italy</h2>
      <ul>
        <li>
          <strong>POS + door first:</strong> Without <em>entries → purchases</em>,
          the owner cannot quantify conversion or justify display changes.
        </li>
        <li>
          <strong>SKU attention before outdoor CV:</strong> In 10 m², freeing one
          slow €800 SKU often beats counting extra passers-by.
        </li>
        <li>
          <strong>Window when baseline exists:</strong> Outdoor CV is higher
          effort (second camera, weather). ROI is measurable only once conversion
          and AOV are on the dashboard.
        </li>
      </ul>

      <h2>Monthly € upside (pilot scale)</h2>
      <p>
        Order-of-magnitude for owner conversations — calibrate with real AOV and
        footfall after week one of joined data.
      </p>
      <DataTable
        headers={["Scenario", "Assumption", "Monthly € upside"]}
        rows={[
          [
            "Conversion +0.5 pp",
            "40 entries/day, 8% → 8.5%, €350 AOV",
            "~€210 (1–2 extra bags)",
          ],
          [
            "AOV +€25 via upsell",
            "12 purchases/day attach care kit or belt",
            "~€300",
          ],
          [
            "One slow SKU cleared",
            "€800 COGS bag held 60 days → cash back + avoid markdown",
            "€800 one-time + margin preserved",
          ],
          [
            "Labor 4 h/week saved",
            "Close dead Tuesday mornings",
            "~€120–€200 at Italian labor cost",
          ],
        ]}
      />
      <p className="stub">
        Ranks 1–3 usually beat ranks 7–8 on ROI because they use POS + door before
        new sensors or a second camera.
      </p>

      <h2>Annual € scenarios (not guarantees)</h2>
      <DataTable
        headers={["Change", "Mechanism", "Illustrative upside"]}
        rows={[
          [
            "+1 sale/week",
            "Conversion +0.3 pp on ~50 entries/day, €350 AOV",
            "€9k–€23k gross revenue/year",
          ],
          [
            "+€40 AOV",
            "Upsell on 3 sales/day, 250 trading days",
            "€30k gross revenue/year",
          ],
          [
            "Clear 2 slow SKUs",
            "Reposition or markdown; recycle cash",
            "€1.5k–€4k margin + working capital",
          ],
          [
            "+5% window enter rate",
            "Display test — after rank 1 baseline",
            "Street-dependent; often largest lever once in-store blind spots are gone",
          ],
        ]}
      />

      <h2>What to deprioritize (low ROI for v1)</h2>
      <ul>
        <li>Cross-store shopper identity or loyalty graphing</li>
        <li>Cloud video archive or heatmaps with PII risk</li>
        <li>Multi-vendor POS before one adapter proves daily owner use</li>
        <li>Generic recommendations without SKU-level POS join</li>
        <li>Real-time alerts for every metric — owners need weekly € actions</li>
      </ul>

      <h2>Operator weekly ritual (15 min)</h2>
      <ol>
        <li>Conversion and revenue per entrant vs prior week</li>
        <li>Top desirability-gap SKUs — repricing, pairing, or window feature</li>
        <li>One experiment: hypothesis, start date, success = € or conversion</li>
      </ol>

      <Card variant="warn">
        <p>
          <strong>Italy-specific:</strong> Price tags include IVA; compare{" "}
          <em>margin</em> and <em>cash recovery</em>, not footfall alone. Align
          reports to <code>Europe/Rome</code> and tourist season (Easter, summer,
          Christmas) when setting experiment windows.
        </p>
      </Card>

      <h2>Maps to delivery</h2>
      <p>
        Technical phases in the <Link to="/roadmap">Roadmap</Link> follow this
        financial order. Milestones M1–M3 unlock ranks 1–5; M4 is live pilot with
        DPIA; M5+ is ranks 7–8 only if M3 KPIs plateau. Commercial framing
        (pricing, GTM, market): <Link to="/business-plan">Business plan</Link>.
      </p>
    </DocLayout>
  );
}
