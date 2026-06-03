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

      <Card>
        <p>
          <strong>If you only ship three things this quarter:</strong> (1) POS +
          door join for conversion, (2) desirability gap on slow leather SKUs, (3)
          upsell prompts on single-category baskets. Together they attack revenue,
          working capital, and margin — the three levers that matter in a 10 m²
          shop. Everything else waits until the owner acts on at least one weekly €
          decision from these three.
        </p>
      </Card>

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
      <p>
        Weighting for the score column below: revenue leverage 40%, margin &amp;
        cash 30%, operating cost 20%, time to proof 10%.
      </p>

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
        in a micro-store, most € is decided inside. Build cost is one-time pilot
        engineering + install; upside is indicative annual gross profit or cash
        recovered at pilot assumptions.
      </p>
      <DataTable
        headers={[
          "Rank",
          "Initiative",
          "Score",
          "Build €",
          "Annual upside",
          "Payback",
          "Owner action",
          "Phase",
        ]}
        rows={[
          [
            "1",
            "Door entries + POS join (conversion funnel)",
            "92",
            "€2k–€4k",
            "€8k–€23k rev",
            "4–8 wk",
            "Compare low-conversion days; test greeting or hero SKU",
            <Tag phase="p1" />,
          ],
          [
            "2",
            "Desirability gap (attention without sale by SKU)",
            "88",
            "€1k–€3k",
            "€1.5k–€6k margin + cash",
            "2–6 wk",
            "Markdown, bundle, or reposition in 14 days",
            <Tag phase="p2" />,
          ],
          [
            "3",
            "Upsell & basket patterns (pairs, care kits, belts)",
            "84",
            "€0.5k–€1k",
            "€6k–€18k rev",
            "2–4 wk",
            "Staff script when single-category baskets dominate",
            <Tag phase="p2" />,
          ],
          [
            "4",
            "Hourly traffic vs sales (staffing & hours)",
            "72",
            "€0 (uses rank 1)",
            "€1.4k–€2.4k OpEx",
            "Immediate",
            "Close dead mornings or extend tourist peaks",
            <Tag phase="p1" />,
          ],
          [
            "5",
            "Bounce & dwell at door (greeting / layout)",
            "68",
            "€0 (uses rank 1)",
            "€3k–€9k rev",
            "4–12 wk",
            "Fix first 10 seconds in the room",
            <Tag phase="p1" />,
          ],
          [
            "6",
            "Experiment registry (display, price tests)",
            "65",
            "€0.5k–€1k",
            "Compound — 5–15% on tested lever",
            "After baseline",
            "One 7-day test; success = € or conversion",
            <Tag phase="p2" />,
          ],
          [
            "7",
            "Fixture zones / RFID or scanners",
            "52",
            "€2k–€5k",
            "Enables rank 2 precision",
            "Only if 2 stalls",
            "Defer until ranks 1–3 prove value",
            <Tag phase="p2" />,
          ],
          [
            "8",
            "Window funnel (pass-by → look-in → enter)",
            "48*",
            "€3k–€6k",
            "Street-dependent",
            "Only after rank 1",
            "Only after in-store conversion baseline exists",
            <Tag phase="p3" />,
          ],
          [
            "—",
            "GDPR / DPIA / privacy controls",
            "Gate",
            "€1k–€2k counsel",
            "Avoids pilot halt",
            "Before M4",
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

      <h2>Which bottleneck to tackle first?</h2>
      <p>
        Use the owner&apos;s current pain — not feature interest — to pick the
        first € action after rank 1 baseline is live:
      </p>
      <DataTable
        headers={["Owner says…", "Start here", "ROI rank"]}
        rows={[
          [
            "“I get people in but they leave empty-handed”",
            "Conversion + bounce diagnostics",
            "1, then 5",
          ],
          [
            "“This bag has sat here since last season”",
            "Desirability gap on that SKU",
            "2",
          ],
          [
            "“They buy one item and leave”",
            "Upsell basket patterns",
            "3",
          ],
          [
            "“I stay open all day but mornings are dead”",
            "Hourly traffic vs sales",
            "4",
          ],
          [
            "“Nobody even looks at my window”",
            "Window funnel — only if rank 1 shows in-store close is healthy",
            "8 (after 1)",
          ],
        ]}
      />

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

      <h2>Illustrative € scenarios (not guarantees)</h2>
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
            "Labor 4 h/week saved",
            "Owner not staffing dead Tuesday mornings",
            "€120–€200/month",
          ],
          [
            "+5% window enter rate",
            "Display test — after rank 1 baseline",
            "Street-dependent; often largest lever once blind spots are gone",
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
        (pricing, market): <Link to="/business-plan">Business plan</Link>. GTM
        &amp; ICP: <Link to="/gtm">GTM strategy</Link>.
      </p>
    </DocLayout>
  );
}
