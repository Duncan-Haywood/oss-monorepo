import { BeforeAfterGrid } from "../components/BeforeAfterGrid";
import { KpiCard } from "../components/KpiCard";
import { PortalShell } from "../components/PortalShell";
import {
  pilotBeforeAfter,
  pilotEconomics,
  pilotImpactSummary,
  pilotSubscription,
  pilotWins,
  quarterlyFocus,
  rankedInitiatives,
} from "../data/demoStore";

export function ValuePage() {
  const impact = pilotImpactSummary;

  return (
    <PortalShell
      title="Business value"
      subtitle="What Retail Pilot Intel delivers for a micro-format luxury boutique — profit per visitor, not dashboards for their own sake."
    >
      <section className="value-hero">
        <p className="value-hero-label">Pilot impact (illustrative)</p>
        <p className="value-hero-headline">{impact.headline}</p>
        <p className="value-hero-sub">{impact.subline}</p>
        <div className="value-hero-stats">
          <div>
            <span className="stat-num">+{impact.conversionLiftPts}</span>
            <span className="stat-label">Conversion pts vs LW</span>
          </div>
          <div>
            <span className="stat-num">+{impact.weeklyRevenueDeltaPct}%</span>
            <span className="stat-label">Revenue vs last week</span>
          </div>
          <div>
            <span className="stat-num">{impact.experimentsPromoted}</span>
            <span className="stat-label">Test → standard practice</span>
          </div>
          <div>
            <span className="stat-num">{impact.slowSkuActions}</span>
            <span className="stat-label">SKU actions in flight</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Before vs after (6-week pilot)</h2>
        <p className="panel-desc">
          Baseline from pre-join footfall + Z-report estimates; week 6 from joined
          door CV and POS.
        </p>
        <BeforeAfterGrid metrics={pilotBeforeAfter} />
      </section>

      <section className="kpi-grid">
        <KpiCard
          label="Est. payback"
          value={pilotSubscription.pilotPaybackWeeks}
          suffix=" weeks"
          hint="At pilot subscription tier"
        />
        <KpiCard
          label="Monthly subscription"
          value={pilotSubscription.monthlyEur}
          hint="After setup fee"
        />
        <KpiCard label="Setup (one-time)" value={pilotSubscription.setupFeeEur} />
      </section>

      <section className="panel">
        <h2>If you ship three things this quarter</h2>
        <ol className="focus-list">
          {quarterlyFocus.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
        <p className="panel-desc muted">
          Everything else waits until the owner acts on at least one weekly € decision
          from these three — window/outdoor CV is intentionally last.
        </p>
      </section>

      <section className="panel">
        <h2>Store economics (pilot assumptions)</h2>
        <dl className="economics-dl">
          <div>
            <dt>Average order value</dt>
            <dd>{pilotEconomics.aovRange}</dd>
          </div>
          <div>
            <dt>Gross margin on leather</dt>
            <dd>{pilotEconomics.grossMargin}</dd>
          </div>
          <div>
            <dt>Daily door entries</dt>
            <dd>{pilotEconomics.dailyEntries}</dd>
          </div>
          <div>
            <dt>Staff on floor</dt>
            <dd>{pilotEconomics.staffOnFloor}</dd>
          </div>
        </dl>
        <p className="panel-desc muted formula">
          Daily gross profit ≈ Entries × Conversion × AOV × Margin% + Upsell uplift −
          carrying cost of slow SKUs
        </p>
      </section>

      <section className="panel">
        <h2>Build priority (financial ROI)</h2>
        <p className="panel-desc">
          Ranked for ~10 m² Italy leather pilot. Rows marked “Live” map to portal
          views you can click through in this demo.
        </p>
        <div className="table-wrap">
          <table className="sku-table initiative-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Initiative</th>
                <th>Score</th>
                <th>Build</th>
                <th>Upside</th>
                <th>Payback</th>
                <th>Demo</th>
              </tr>
            </thead>
            <tbody>
              {rankedInitiatives.map((row) => (
                <tr key={row.rank} className={row.liveInDemo ? "row-live" : "row-deferred"}>
                  <td>{row.rank}</td>
                  <td>
                    <strong>{row.name}</strong>
                    <span className="note-cell block">{row.action}</span>
                  </td>
                  <td>{row.score}</td>
                  <td>{row.buildCost}</td>
                  <td>{row.upside}</td>
                  <td>{row.payback}</td>
                  <td>
                    {row.liveInDemo ? (
                      <span className="gap-pill low">Live</span>
                    ) : (
                      <span className="gap-pill medium">Later</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Proof points this pilot week</h2>
        <ul className="wins-list">
          {pilotWins.map((w) => (
            <li key={w.title} className="win-card">
              <div className="win-metric">{w.metric}</div>
              <h3>{w.title}</h3>
              <p>{w.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel callout sales-callout">
        <h2>Sales narrative</h2>
        <p>
          Pilots are sold on <strong>weekly € decisions</strong>, not cameras. Show
          conversion and SKU gap first, then experiments that promote winners. Privacy
          (Trust) is the gate to go-live — ROI is why they renew.
        </p>
        <p className="panel-desc muted">
          Full matrix and methodology: documentation site → Business value &amp; ROI.
          Run <code>pnpm docs:dev</code> for legal/commercial depth.
        </p>
      </section>
    </PortalShell>
  );
}
