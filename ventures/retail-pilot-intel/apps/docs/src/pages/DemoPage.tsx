import { Link } from "react-router-dom";
import { Card, DataTable } from "../components/DocPrimitives";
import { DocLayout } from "../components/DocLayout";

const demoScript = [
  {
    step: 1,
    where: "ROI page (this site)",
    duration: "5 min",
    goal: "Frame the problem: small boutiques pay for footfall and POS but cannot join them to weekly € decisions.",
    points: [
      "Profit per visitor — conversion, AOV, inventory cash",
      "Build order: door+POS join → desirability gap → experiments",
      "Window/outdoor CV is last — most € is decided inside a 10 m² floor",
    ],
  },
  {
    step: 2,
    where: "Business plan",
    duration: "3 min",
    goal: "Commercial context: market, pricing (€150–€350/mo), GTM, unit economics.",
    points: [
      "Target: owner-operated luxury micro-format in Italy",
      "Pilot install €2k–€5k; payback 4–8 weeks at indicative upside",
      "Privacy-first positioning vs cloud analytics vendors",
    ],
  },
  {
    step: 3,
    where: "Sales portal",
    duration: "12 min",
    goal: "Show the operator UI — what the owner sees after edge + POS are joined.",
    points: [
      "Overview: daily KPIs, hourly footfall vs closes, actionable insights",
      "Products: desirability gap — high touch / low sale SKUs",
      "Experiments: till script lifted scarf attach 22% → 67%",
      "Business value: €18k–€48k indicative annual upside",
      "Privacy & trust: GDPR posture for stakeholder sign-off",
    ],
  },
];

export function DemoPage() {
  return (
    <DocLayout
      title="Sales & marketing demo"
      subtitle="Scripted walkthrough for prospects — problem framing, business case, and live operator UI"
      footer={
        <>
          <Link to="/roi">ROI matrix →</Link>
          {" · "}
          <Link to="/">← Home</Link>
        </>
      }
    >
      <Card variant="ok">
        <p>
          <strong>Two-app demo flow:</strong> Start here in the docs site for ROI and
          commercial framing (~8 min), then open the passcode-gated{" "}
          <strong>sales portal</strong> for the operator experience (~12 min). The portal
          includes a <strong>Presenter guide</strong> on each page — use passcode{" "}
          <code>atelier-demo</code> unless your build sets <code>VITE_DEMO_PASSCODE</code>.
        </p>
      </Card>

      <h2>Quick start</h2>
      <pre>{`# Terminal 1 — documentation (this site)
pnpm docs:dev          # http://localhost:5173/demo

# Terminal 2 — optional live KPI API (after pnpm bootstrap)
pnpm exec tsx packages/analytics/src/cli.ts serve-kpis --port 8787

# Terminal 3 — sales portal
VITE_PILOT_API_URL=http://127.0.0.1:8787 pnpm portal:dev
# http://localhost:5174  passcode: atelier-demo
# omit VITE_PILOT_API_URL to keep illustrative demoStore numbers`}</pre>

      <h2>Demo script (~20 min total)</h2>
      {demoScript.map((section) => (
        <Card key={section.step}>
          <p>
            <strong>
              Step {section.step}: {section.where}
            </strong>{" "}
            · {section.duration}
          </p>
          <p>
            <em>Goal:</em> {section.goal}
          </p>
          <ul>
            {section.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          {section.step === 1 ? (
            <p>
              Open <Link to="/roi">Business value & ROI</Link>
            </p>
          ) : null}
          {section.step === 2 ? (
            <p>
              Open <Link to="/business-plan">Business plan</Link>
            </p>
          ) : null}
          {section.step === 3 ? (
            <p>
              Open portal at <code>http://localhost:5174</code> — sign in as{" "}
              <strong>Owner</strong> for the ROI banner. Tour order: Business value →
              Overview → Products → Experiments → Trust. Use the{" "}
              <strong>Presenter guide</strong> at the bottom of each page.
            </p>
          ) : null}
        </Card>
      ))}

      <h2>Value proposition (elevator)</h2>
      <Card>
        <p>
          Small luxury retailers already pay for footfall counters and POS — but cannot
          connect them to weekly profit decisions. <strong>Retail Pilot Intel</strong> is a
          store-local join layer: anonymous door signals + normalized sales events →
          conversion baseline, SKU desirability gaps, and lightweight in-store
          experiments — without cloud video or shopper identity.
        </p>
      </Card>

      <h2>Key numbers for the close</h2>
      <DataTable
        headers={["Metric", "Indicative range", "Talking point"]}
        rows={[
          [
            "Annual upside (3 levers)",
            "€18k–€48k",
            "Conversion + dead SKU recovery + upsell attach",
          ],
          ["Payback", "4–8 weeks", "Owner acts on at least one weekly € decision"],
          ["Subscription", "€150–€350/mo", "Per store after pilot"],
          ["Pilot install", "€2k–€5k", "Edge node + door CV + POS bridge"],
          ["AOV (leather boutique)", "€180–€450", "One extra sale/week ≈ €10k–€23k/year"],
          ["Conversion lift (pilot)", "+2.4 pts", "Door+POS join in ~2 weeks"],
        ]}
      />

      <h2>Objection handling</h2>
      <DataTable
        headers={["Objection", "Response"]}
        rows={[
          [
            "We already have footfall",
            "Footfall alone doesn't close the loop — we join entries to POS so you see conversion % and revenue per entrant.",
          ],
          [
            "GDPR / privacy concerns",
            "Frames discarded on device; no identity; aggregates only. Store is controller. See portal Trust page + docs Privacy.",
          ],
          [
            "Too small for analytics",
            "Built for ~10 m² — one dead SKU or +1 sale/week moves the P&L. Insights fit a 2-minute morning check.",
          ],
          [
            "Another dashboard",
            "Ranked recommendations and experiment loop — not charts for analysts. Sold on € outcomes.",
          ],
        ]}
      />

      <h2>Static builds for deployment</h2>
      <pre>{`pnpm docs:build    # → apps/docs/dist
pnpm portal:build  # → apps/portal/dist`}</pre>
      <p className="stub">
        Host docs publicly for pre-sales framing; host portal on a separate URL with
        passcode shared per prospect. Set <code>VITE_DEMO_PASSCODE</code> for
        prospect-specific access.
      </p>
    </DocLayout>
  );
}
